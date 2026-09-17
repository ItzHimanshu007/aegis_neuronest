import { onMessage, type ObserveResult, type StateToken } from '../shared/messages';
import { health } from '../net/network';
import { AEGIS_CONFIG } from '../shared/config';
import { composeObservation, type FrameComposeInput } from '../observe/compose';
import { computeMutationDiff, toMarkIdentity, type MarkIdentity } from '../observe/diff';
import { decideScreenChange, type ChangeResult, type ChangeSnapshot } from '../observe/change';
import { dataUrlToGrayscale, imageSizeFromDataUrl } from '../observe/captureAdapter';
import { RateLimiter, CoalescingQueue } from '../observe/rateLimiter';
import { markLocalOnly, type FrameInfo, type RawElement } from '../observe/types';

/**
 * Background: orchestrates the capture pipeline (Stage 1 Part D) on top of the on-demand harvester
 * content script (entrypoints/content.ts). Nothing observed here is sent anywhere — see
 * observe/types.ts's `LocalOnly<T>` brand and observe/__tests__/localOnly.typetest.ts.
 */
export default defineBackground(() => {
  onMessage('PING_SERVER', async () => {
    return health();
  });

  onMessage('OBSERVE', async (message) => {
    const { tabId } = message.data;
    return observeTab(tabId);
  });

  onMessage('START_TASK', async () => {
    // TODO(stage-3): wire this to extension/agent/runAgentLoop.ts
    throw new Error('START_TASK is not implemented until Stage 3');
  });

  onMessage('STOP_TASK', async () => {
    // TODO(stage-3): signal the running agent loop to stop
    throw new Error('STOP_TASK is not implemented until Stage 3');
  });

  // --- F1: toolbar button opens/toggles the panel -------------------------------------------
  if (browser.sidePanel) {
    // Chrome: clicking the action button opens the side panel directly (requires the `action`
    // key to exist in the manifest — see wxt.config.ts — even with no popup/default_title action).
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.error('[aegis] setPanelBehavior failed', err));
  } else {
    // Firefox: sidebarAction.toggle() must be called synchronously inside the click listener —
    // it consumes the user-gesture "transient activation" the same way permissions.request does
    // (see shared/permissions.ts's docblock). No `await` before this call.
    const sidebarAction = (browser as unknown as { sidebarAction?: { toggle: () => void } }).sidebarAction;
    if (sidebarAction) {
      browser.action.onClicked.addListener(() => {
        sidebarAction.toggle();
      });
    }
  }

  // --- content-script -> background messages that aren't part of the typed public bus -------
  const frameHellos = new Map<number, FrameHello[]>(); // tabId -> announcements since last OBSERVE
  const latestInputReports = new Map<number, unknown[]>(); // tabId -> recent InputChangeReport (debug only)

  browser.runtime.onMessage.addListener((message: unknown, sender, _sendResponse) => {
    if (!isRawMessage(message) || sender.tab?.id == null) return undefined;
    const tabId = sender.tab.id;

    if (message.type === 'FRAME_HELLO') {
      const list = frameHellos.get(tabId) ?? [];
      list.push({ frameId: sender.frameId ?? -1, ...(message.data as { url: string; w: number; h: number }) });
      frameHellos.set(tabId, list);
      return undefined; // no response expected
    }

    if (message.type === 'INPUT_CHANGED') {
      const list = latestInputReports.get(tabId) ?? [];
      list.push(message.data);
      if (list.length > 50) list.shift();
      latestInputReports.set(tabId, list);
      return undefined;
    }

    return undefined;
  });

  // --- per-tab state for the change detector -------------------------------------------------
  const tabState = new Map<number, TabObserveState>();
  const lastChangeByTab = new Map<number, ChangeResult>();
  const rateLimiter = new RateLimiter(AEGIS_CONFIG.CAPTURE_MAX_PER_SEC);
  const captureQueue = new CoalescingQueue<number, ObserveResult>((tabId) => runObservationPipeline(tabId));

  async function observeTab(tabId: number): Promise<ObserveResult> {
    return captureQueue.enqueue(tabId);
  }

  async function getSalt(): Promise<string> {
    const stored = await browser.storage.session.get('aegisFpSalt');
    const existing = stored['aegisFpSalt'];
    if (typeof existing === 'string' && existing.length > 0) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await browser.storage.session.set({ aegisFpSalt: salt });
    return salt;
  }

  async function sendToFrame<T>(tabId: number, msg: unknown, frameId?: number): Promise<T> {
    const envelope = (await browser.tabs.sendMessage(tabId, msg, frameId != null ? { frameId } : undefined)) as
      | { ok: true; response: T }
      | { ok: false; error: string }
      | undefined;
    if (!envelope) throw new Error('No response from content script (not injected?)');
    if (!envelope.ok) throw new Error(envelope.error);
    return envelope.response;
  }

  async function runObservationPipeline(tabId: number): Promise<ObserveResult> {
    const totalStart = performance.now();
    const tab = await browser.tabs.get(tabId);
    if (tab.windowId == null) throw new Error('Tab has no window');

    const salt = await getSalt();
    frameHellos.set(tabId, []);

    // 1. Inject (idempotent — see entrypoints/content.ts's __aegisInjected guard).
    const injectStart = performance.now();
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['/content-scripts/content.js'],
    });
    const injectMs = performance.now() - injectStart;

    let attempt = 0;
    let composedElements: RawElement[] = [];
    let composedMedia: FrameComposeInput['media'] = [];
    let composedTextBlocks: FrameComposeInput['textBlocks'] = [];
    let frameInfos: FrameInfo[] = [];
    let dialogOpen = false;
    let screenshotDataUrl = '';
    let harvestMs = 0;
    let captureMs = 0;
    let finalStateToken: StateToken | null = null;
    let finalCaptureId: string | null = null;

    while (attempt < AEGIS_CONFIG.CAPTURE_RETRIES) {
      attempt++;
      const harvestStart = performance.now();
      const harvestResponse = await sendToFrame<{
        inputs: FrameComposeInput[];
        frameInfos: FrameInfo[];
        dialogOpen: boolean;
        stateToken: StateToken;
        captureId: string;
      }>(tabId, { type: 'HARVEST_TREE', data: { salt } }, 0);
      harvestMs = performance.now() - harvestStart;

      const resolvedInputs = await resolveCrossOriginFrames(tabId, salt, harvestResponse.inputs, harvestResponse.frameInfos, frameHellos.get(tabId) ?? []);

      const wait = rateLimiter.msUntilNextSlot();
      if (wait > 0) await sleep(wait);

      await sendToFrame(tabId, { type: 'HIDE_OVERLAY' }, 0).catch(() => {});
      const captureStart = performance.now();
      const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      rateLimiter.record();
      captureMs = performance.now() - captureStart;

      const stateTokenAfter = await sendToFrame<StateToken>(tabId, { type: 'GET_STATE_TOKEN' }, 0);

      if (stateTokensEqual(harvestResponse.stateToken, stateTokenAfter)) {
        const composed = composeObservation(resolvedInputs.inputs);
        composedElements = composed.elements;
        composedMedia = composed.media;
        composedTextBlocks = composed.textBlocks;
        frameInfos = resolvedInputs.frameInfos;
        dialogOpen = harvestResponse.dialogOpen;
        screenshotDataUrl = dataUrl;
        finalStateToken = stateTokenAfter;
        finalCaptureId = harvestResponse.captureId;

        await sendToFrame(
          tabId,
          { type: 'RENDER_OVERLAY', data: { elements: composedElements, media: composedMedia } },
          0,
        ).catch(() => {});
        await sendToFrame(tabId, { type: 'SHOW_OVERLAY' }, 0).catch(() => {});
        break;
      }
      await sendToFrame(tabId, { type: 'SHOW_OVERLAY' }, 0).catch(() => {});
      // state changed mid-capture — loop and retry (Part D.1.5)
    }

    if (!screenshotDataUrl || !finalStateToken || !finalCaptureId) {
      throw new Error(`Capture did not stabilize after ${AEGIS_CONFIG.CAPTURE_RETRIES} attempts`);
    }

    // Scale mapping (Part D.4): screenshot pixel size vs CSS viewport size.
    const { pxW, pxH } = await imageSizeFromDataUrl(screenshotDataUrl);
    const viewport = {
      cssW: finalStateToken.innerWidth,
      cssH: finalStateToken.innerHeight,
      dpr: finalStateToken.dpr,
      scrollX: finalStateToken.scrollX,
      scrollY: finalStateToken.scrollY,
      zoom: 1,
      visualScale: finalStateToken.visualScale,
    };
    const scaleX = viewport.cssW > 0 ? pxW / viewport.cssW : 1;
    const scaleY = viewport.cssH > 0 ? pxH / viewport.cssH : 1;

    // Change detection (Part D.5)
    const previous = tabState.get(tabId) ?? null;
    let urlPath = '';
    let urlHash = '';
    try {
      const url = new URL(tab.url ?? '');
      urlPath = url.pathname;
      urlHash = url.hash;
    } catch {
      // tab.url can be empty (e.g. chrome://newtab in some states) — treat as a single fixed path
      // so the URL check simply never fires rather than throwing.
    }
    const diff = computeMutationDiff(previous?.marks ?? null, composedElements);

    let dhashInput;
    try {
      dhashInput = await dataUrlToGrayscale(screenshotDataUrl, AEGIS_CONFIG.DHASH_GRID_SIZE, AEGIS_CONFIG.DHASH_GRID_SIZE - 1);
    } catch {
      dhashInput = undefined;
    }

    const snapshot: ChangeSnapshot = {
      urlPath,
      urlHash,
      dialogOpen,
      mutationScore: diff.mutationScore,
      previousMarkCount: diff.previousMarkCount,
      changedMarkCount: diff.changedMarkCount,
      scrollY: viewport.scrollY,
      viewportHeight: viewport.cssH,
      dhashInput,
    };
    const change: ChangeResult = decideScreenChange(previous?.snapshot ?? null, snapshot);

    // Project down to MarkIdentity before storing — see TabObserveState's docblock. This is the
    // ONE place a "previous capture" is retained anywhere in background.ts, and it never holds a
    // full RawElement.
    tabState.set(tabId, { marks: toMarkIdentity(composedElements), snapshot });

    const totalMs = performance.now() - totalStart;

    const observation = markLocalOnly({
      capture_id: finalCaptureId,
      ts: Date.now(),
      url: tab.url ?? '',
      title: tab.title ?? '',
      viewport,
      frames: frameInfos,
      elements: composedElements,
      media: composedMedia,
      textBlocks: composedTextBlocks,
      screenshot: { dataUrl: screenshotDataUrl, pxW, pxH, scaleX, scaleY },
      timings: { injectMs, harvestMs, captureMs, totalMs },
      counts: {
        elements: composedElements.length,
        visibleElements: composedElements.filter((e) => e.visible).length,
        hiddenInteractive: composedElements.filter((e) => e.hiddenInteractive).length,
        media: composedMedia.length,
        textBlocks: composedTextBlocks.length,
        frames: frameInfos.length,
      },
    });

    lastChangeByTab.set(tabId, change);
    return { observation, change, tabId, stateToken: finalStateToken };
  }

  /** Attempts to upgrade any 'iframe-unmapped' media entries by matching a same-size FRAME_HELLO
   * announcement, then fetching that frame's own harvest via a directly-targeted message (Stage 1
   * Part C.6, third bullet: "otherwise... by matching iframe src + size from the parent frame"). */
  async function resolveCrossOriginFrames(
    tabId: number,
    salt: string,
    inputs: FrameComposeInput[],
    frameInfos: FrameInfo[],
    hellos: FrameHello[],
  ): Promise<{ inputs: FrameComposeInput[]; frameInfos: FrameInfo[] }> {
    if (hellos.length === 0) return { inputs, frameInfos };
    let nextSyntheticFrameId = Math.max(0, ...frameInfos.map((f) => f.frameId)) + 1;
    const usedHelloFrameIds = new Set<number>();
    const resultInputs = [...inputs];
    const resultFrameInfos = [...frameInfos];

    for (const input of inputs) {
      const stillUnmapped = input.media.filter((m) => m.kind === 'iframe-unmapped');
      for (const media of stillUnmapped) {
        const match = hellos.find(
          (h) =>
            !usedHelloFrameIds.has(h.frameId) &&
            Math.abs(h.w - media.bbox.width) <= 2 &&
            Math.abs(h.h - media.bbox.height) <= 2,
        );
        if (!match) continue;
        usedHelloFrameIds.add(match.frameId);
        try {
          const subtree = await sendToFrame<{
            elements: RawElement[] | Omit<RawElement, 'mark_id' | 'fpOrdinal'>[];
            media: FrameComposeInput['media'];
            textBlocks: FrameComposeInput['textBlocks'];
          }>(tabId, { type: 'HARVEST_SUBTREE', data: { salt } }, match.frameId);

          const syntheticId = nextSyntheticFrameId++;
          const idx = input.media.findIndex((m) => m === media);
          if (idx >= 0) input.media.splice(idx, 1);
          resultInputs.push({
            frameId: syntheticId,
            offsetChain: [{ x: media.bbox.x, y: media.bbox.y, scale: 1 }, ...input.offsetChain],
            elements: subtree.elements as Omit<RawElement, 'mark_id' | 'fpOrdinal'>[],
            media: subtree.media,
            textBlocks: subtree.textBlocks,
          });
          resultFrameInfos.push({ frameId: syntheticId, parentFrameId: input.frameId, url: match.url, mapping: 'src-size-match' });
        } catch {
          // Couldn't reach that frame (navigated away, no listener yet) — leave it unmapped.
        }
      }
    }

    return { inputs: resultInputs, frameInfos: resultFrameInfos };
  }
});

// ---------------------------------------------------------------------------------------------
// Local helper types
// ---------------------------------------------------------------------------------------------

interface FrameHello {
  frameId: number;
  url: string;
  w: number;
  h: number;
}

/**
 * Stage 2 Part A2 hardening: background must not cache raw observations. `marks` is a
 * deliberately narrow projection (fp/fpOrdinal/visible only — see observe/diff.ts's
 * `MarkIdentity`) of the previous capture's elements, kept only so the next capture's change
 * detector can diff against it; it carries no names, values, urls or any other page content.
 * `snapshot.dhashInput`, similarly, is a 9x8 grayscale thumbnail (72 bytes) of the previous
 * screenshot — lossy and irreversible, kept only for the perceptual-hash fallback in
 * observe/change.ts, and useless for reconstructing anything about the page. Nothing else about
 * a past Observation is retained anywhere in this file: `runObservationPipeline` returns the full
 * Observation to the caller (the side panel) and keeps no other reference to it once it returns —
 * see privacy/__tests__/backgroundNoRawCache.test.ts for the enforcement test.
 */
interface TabObserveState {
  marks: MarkIdentity[];
  snapshot: ChangeSnapshot;
}

function stateTokensEqual(a: StateToken, b: StateToken): boolean {
  return (
    a.mutationCounter === b.mutationCounter &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.dpr === b.dpr &&
    a.visualScale === b.visualScale &&
    a.innerWidth === b.innerWidth &&
    a.innerHeight === b.innerHeight
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRawMessage(message: unknown): message is { type: string; data?: unknown } {
  return typeof message === 'object' && message !== null && 'type' in message;
}
