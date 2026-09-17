import { executeLocal, hasValidationError, type ExecutionRequest } from '../agent/executor';
import { reacquire } from '../agent/reacquire';
import { harvestFrame } from '../observe/harvester';
import { debugOverlay, type OverlayElement } from '../observe/overlay';
import { waitForSettle } from '../observe/settle';
import { InputWatcher } from '../observe/inputWatcher';
import { computeSpanRects, getTextParts } from '../observe/spanRects';
import { AEGIS_CONFIG } from '../shared/config';
import type { StateToken } from '../shared/messages';
import type { FrameComposeInput } from '../observe/compose';
import { composeToTopLevel, type FrameOffset } from '../observe/frames';
import type { FrameInfo, RawElement, RawMedia } from '../observe/types';

/**
 * The harvester content script (Stage 1). Registered with `registration: 'runtime'` (see F2 in
 * wxt.config.ts) — it is never listed in the manifest, and is injected on demand by
 * entrypoints/background.ts only after the user has granted access to the tab's origin. It is
 * idempotent: `scripting.executeScript` re-runs this whole file every time it's called, so the
 * very first thing it does is check a global guard and bail out if it's already registered.
 *
 * All of this is LOCAL ONLY (see observe/types.ts LocalOnly<T> and AGENTS.md invariant 1) — the
 * messages this file sends go to the background script, never to net/network.ts.
 */
export default defineContentScript({
  // No `matches` — see F2 in wxt.config.ts: manifest registration is skipped entirely
  // (registration: 'runtime'), so this never adds a required host_permissions entry. `allFrames`
  // is likewise irrelevant here; entrypoints/background.ts controls which frames get this script
  // via its own `scripting.executeScript({ target: { allFrames: true } })` call.
  registration: 'runtime',
  main() {
    const globalGuard = window as typeof window & { __aegisInjected?: boolean };
    if (globalGuard.__aegisInjected) return;
    globalGuard.__aegisInjected = true;

    ensureMutationCounter();
    let executionSalt = "";
    const executions = new Map<string, AbortController>();
    const cancelled = new Set<string>();

    // Local per-frame state. `fpMap` lets the input watcher translate a live DOM element back to
    // the `fp` it had at the last harvest, without re-deriving a fingerprint from scratch.
    const fpMap = new WeakMap<Element, string>();
    // Stage 2 Part A3: state from the most recent HARVEST_TREE call, kept so SPAN_RECTS can
    // re-locate a text block and verify the capture is still fresh before computing rects. All of
    // this is local-only DOM state — Elements are never serialized or sent anywhere.
    let lastCaptureId: string | null = null;
    let lastHarvestStateToken: StateToken | null = null;
    let lastBlockElements: Map<string, Element> = new Map();
    let lastFrameOffsets: Map<number, FrameOffset[]> = new Map();

    // Announce this frame to background (fire-and-forget) so cross-origin iframes can be matched
    // by size — see entrypoints/background.ts's FRAME_HELLO handling and Stage 1 Part C.6.
    void browser.runtime
      .sendMessage({
        type: 'FRAME_HELLO',
        data: { url: location.href, w: window.innerWidth, h: window.innerHeight },
      })
      .catch(() => {
        // Background may not be listening yet on the very first tick; harmless if this is lost —
        // the frame will simply stay 'iframe-unmapped' if it was needed and never got picked up.
      });

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message === 'object' && message !== null && 'type' in message) {
        const command = message as { type: string; session?: string; request?: ExecutionRequest };
        if (['EXECUTE_ACTION', 'PREPARE_ACTION', 'CANCEL_TASK'].includes(command.type)) {
          if (_sender.id !== browser.runtime.id || !command.session) return undefined;
          if (command.type === 'CANCEL_TASK') {
            cancelled.add(command.session); executions.get(command.session)?.abort();
            if (cancelled.size > 100) cancelled.delete(cancelled.values().next().value!);
            sendResponse({ ok: true }); return false;
          }
          const controller = executions.get(command.session) ?? new AbortController();
          executions.set(command.session, controller);
          if (cancelled.has(command.session)) controller.abort();
          void (async () => {
            try {
              controller.signal.throwIfAborted();
              if (!executionSalt || !command.request) throw new Error('TARGET_MISSING');
              if (command.type === 'PREPARE_ACTION') {
                const found = command.request.target ? reacquire(command.request.target, executionSalt) : undefined;
                sendResponse({ ok: true, validationError: hasValidationError(found?.element.ownerDocument ?? document, found?.element) });
              } else sendResponse(await executeLocal(command.request, executionSalt, controller.signal));
            } catch (error) {
              const code = error instanceof Error ? error.message : 'EXEC_FAILED';
              const allowed = ['TARGET_MISSING','FP_MISMATCH','AMBIGUOUS_TARGET','NOT_VISIBLE','NOT_HITTABLE','DISABLED','NEW_SCREEN','TOKEN_TYPE_MISMATCH','CONSENT_DENIED'];
              sendResponse({ ok: false, code: allowed.includes(code) ? code : 'EXEC_FAILED' });
            }
          })();
          return true;
        }
      }
      if (!isAegisMessage(message)) return undefined;

      if (message.type === 'HARVEST_TREE') {
        executionSalt = message.data.salt;
        void (async () => {
          try {
            await waitForSettle(document, {
              quietMs: AEGIS_CONFIG.SETTLE_QUIET_MS,
              maxMs: AEGIS_CONFIG.SETTLE_MAX_MS,
            });
            const stateTokenBefore = readStateToken();
            const { inputs, frameInfos, dialogOpen, blockElements, frameOffsets } = harvestDocumentTree(
              document,
              window,
              0,
              null,
              message.data.salt,
              fpMap,
              makeFrameIdAllocator(),
            );
            // Generated here (not by background) so it can double as the freshness key
            // SPAN_RECTS checks against — background reuses this same id as the Observation's
            // capture_id instead of minting its own (Stage 2 Part A3).
            const captureId = crypto.randomUUID();
            lastCaptureId = captureId;
            lastHarvestStateToken = stateTokenBefore;
            lastBlockElements = blockElements;
            lastFrameOffsets = frameOffsets;
            sendResponse({ ok: true, response: { inputs, frameInfos, dialogOpen, stateToken: stateTokenBefore, captureId } });
          } catch (err) {
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        })();
        return true;
      }

      if (message.type === 'SPAN_RECTS') {
        try {
          const { capture_id, stateToken, spans } = message.data;
          const isStale = capture_id !== lastCaptureId || !stateTokensEqual(stateToken, lastHarvestStateToken);
          if (isStale) {
            sendResponse({ ok: true, response: { stale: true } });
            return false;
          }
          const results = spans.map((span) => {
            const el = lastBlockElements.get(span.blockRef);
            if (!el) return { blockRef: span.blockRef, rects: [], notFound: true };
            const captured = new Set<Element>(); // text blocks never include captured-interactive text by construction
            const index = getTextParts(el, (candidate) => captured.has(candidate));
            const localRects = computeSpanRects(index, span.start, span.end);
            const offsetChain = lastFrameOffsets.get(getFrameIdFromBlockRef(span.blockRef)) ?? [];
            const rects = localRects.map((r) => composeToTopLevel(r, offsetChain));
            return { blockRef: span.blockRef, rects };
          });
          sendResponse({ ok: true, response: { stale: false, results } });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return false;
      }

      if (message.type === 'HARVEST_SUBTREE') {
        executionSalt = message.data.salt;
        // Used by background to resolve one specific cross-origin/independently-injected frame it
        // matched via FRAME_HELLO. This runs in THAT frame's own content script instance.
        try {
          const result = harvestFrame({ salt: message.data.salt, frameId: 0, doc: document, win: window });
          sendResponse({ ok: true, response: result });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return false;
      }

      if (message.type === 'GET_STATE_TOKEN') {
        sendResponse({ ok: true, response: readStateToken() });
        return false;
      }

      if (message.type === 'HIDE_OVERLAY') {
        debugOverlay.hideForCapture();
        // `tabs.captureVisibleTab` captures the last *composited* frame, so simply setting
        // display:none isn't enough — without waiting for the browser to actually paint the
        // hidden state, the capture can still contain the overlay. Two rAFs guarantee we're past
        // a real paint before background.ts proceeds to capture. (Caught by
        // e2e/overlay-and-throttle.spec.ts, which samples the pixel where a mark border would be.)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => sendResponse({ ok: true, response: undefined }));
        });
        return true; // async response
      }

      if (message.type === 'SHOW_OVERLAY') {
        debugOverlay.restoreAfterCapture();
        sendResponse({ ok: true, response: undefined });
        return false;
      }

      if (message.type === 'RENDER_OVERLAY') {
        debugOverlay.render(document, message.data.elements, message.data.media, []);
        sendResponse({ ok: true, response: undefined });
        return false;
      }

      return undefined;
    });

    const inputWatcher = new InputWatcher(
      (el) => fpMap.get(el),
      (report) => {
        void browser.runtime.sendMessage({ type: 'INPUT_CHANGED', data: report }).catch(() => {});
      },
    );
    inputWatcher.attach(document);
  },
});

// ---------------------------------------------------------------------------------------------
// Same-origin recursive harvesting
// ---------------------------------------------------------------------------------------------

function makeFrameIdAllocator(): () => number {
  let next = 1; // 0 is reserved for the top/root of whatever tree we're harvesting.
  return () => next++;
}

/** `iframeEl.contentDocument` throws (in some engines) or is null for a cross-origin frame — this
 * is the one place that distinction is made. */
function getSameOriginContentDocument(iframeEl: HTMLIFrameElement): Document | null {
  try {
    return iframeEl.contentDocument;
  } catch {
    return null;
  }
}

function rectsClose(a: RawMedia['bbox'], b: RawMedia['bbox']): boolean {
  const eps = 1;
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.width - b.width) <= eps && Math.abs(a.height - b.height) <= eps;
}

export interface HarvestTreeResult {
  inputs: FrameComposeInput[];
  frameInfos: FrameInfo[];
  dialogOpen: boolean;
  /** blockRef -> the live Element it came from, frame-local (not yet offset-composed). */
  blockElements: Map<string, Element>;
  /** frameId -> the offset chain that composes that frame's *local* coordinates into top-level
   * coordinates — the same chain `inputs[].offsetChain` carries, indexed by frame instead, so the
   * SPAN_RECTS handler can compose a freshly-computed local rect without re-walking the tree. */
  frameOffsets: Map<number, FrameOffset[]>;
}

/**
 * Harvests `doc` and recursively descends into every same-origin `<iframe>` it contains (Stage 1
 * Part C.6: "same-origin: via frameElement in the child"). We implement this from the parent's
 * side instead — `iframeEl.contentDocument` is already a same-origin-only accessor, so if it
 * succeeds we have full, direct access to the child document without any message round trip; if
 * it throws or is null, the frame is cross-origin (or otherwise inaccessible) and is left as an
 * `iframe-unmapped` RawMedia entry for background.ts to try to resolve via FRAME_HELLO/size
 * matching, or for Stage 6 vision to cover directly.
 *
 * Returns a flat, ordered list of per-frame results with `offsetChain` already composed relative
 * to `doc` — feed `inputs` directly into observe/compose.ts's `composeObservation()`.
 */
export function harvestDocumentTree(
  doc: Document,
  win: Window,
  frameId: number,
  parentFrameId: number | null,
  salt: string,
  fpMap: WeakMap<Element, string>,
  nextFrameId: () => number,
): HarvestTreeResult {
  const blockRefMap = new Map<string, Element>();
  const frameResult = harvestFrame({ salt, frameId, doc, win, blockRefMap });
  for (const el of collectMarkedElements(doc, frameResult.elements)) {
    fpMap.set(el.element, el.fp);
  }

  const media = [...frameResult.media];
  const inputs: FrameComposeInput[] = [
    { frameId, offsetChain: [], elements: frameResult.elements, media, textBlocks: frameResult.textBlocks },
  ];
  const frameInfos: FrameInfo[] = [
    { frameId, parentFrameId, documentPath: [], url: doc.location?.href ?? win.location.href, mapping: parentFrameId === null ? 'top' : 'same-origin' },
  ];
  const blockElements = new Map<string, Element>(blockRefMap);
  const frameOffsets = new Map<number, FrameOffset[]>([[frameId, []]]);
  let dialogOpenAggregate = frameResult.dialogOpen;

  const iframeEls = Array.from(doc.querySelectorAll('iframe')) as HTMLIFrameElement[];
  for (const iframeEl of iframeEls) {
    const childDoc = getSameOriginContentDocument(iframeEl);
    if (!childDoc || !childDoc.defaultView) continue;

    const rect = iframeEl.getBoundingClientRect();
    const rectPlain = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const mediaIndex = media.findIndex((m) => m.kind === 'iframe-unmapped' && rectsClose(m.bbox, rectPlain));
    if (mediaIndex >= 0) media.splice(mediaIndex, 1);

    const childFrameId = nextFrameId();
    const child = harvestDocumentTree(childDoc, childDoc.defaultView, childFrameId, frameId, salt, fpMap, nextFrameId);
    const prefix: FrameOffset = { x: rectPlain.x, y: rectPlain.y, scale: 1 };
    for (const input of child.inputs) {
      input.offsetChain = [prefix, ...input.offsetChain];
    }
    for (const [childFrameIdKey, chain] of child.frameOffsets) {
      frameOffsets.set(childFrameIdKey, [prefix, ...chain]);
    }
    for (const [ref, el] of child.blockElements) {
      blockElements.set(ref, el);
    }
    inputs.push(...child.inputs);
    for (const info of child.frameInfos) info.documentPath = [iframeEls.indexOf(iframeEl), ...(info.documentPath ?? [])];
    frameInfos.push(...child.frameInfos);
    dialogOpenAggregate = dialogOpenAggregate || child.dialogOpen;
  }

  return { inputs, frameInfos, dialogOpen: dialogOpenAggregate, blockElements, frameOffsets };
}

/** harvestFrame() doesn't return live Element references (RawElement is plain, serializable
 * data) — for the fpMap we need those references too, so this re-walks just far enough to pair
 * each RawElement back up with its source Element via bbox+fp identity. Cheap: only interactive
 * candidates, not the whole tree. */
function collectMarkedElements(doc: Document, elements: Omit<RawElement, 'eid' | 'fpOrdinal'>[]): { element: Element; fp: string }[] {
  if (elements.length === 0) return [];
  const byFp = new Map<string, Omit<RawElement, 'eid' | 'fpOrdinal'>[]>();
  for (const el of elements) {
    const list = byFp.get(el.fp) ?? [];
    list.push(el);
    byFp.set(el.fp, list);
  }
  const found: { element: Element; fp: string }[] = [];
  const candidates = doc.querySelectorAll('a[href], button, input, select, textarea, summary, [contenteditable], [tabindex], [role]');
  for (const candidate of Array.from(candidates)) {
    const rect = candidate.getBoundingClientRect();
    for (const [fp, list] of byFp) {
      const match = list.find((r) => Math.abs(r.bbox.x - rect.x) < 1 && Math.abs(r.bbox.y - rect.y) < 1 && Math.abs(r.bbox.width - rect.width) < 1);
      if (match) {
        found.push({ element: candidate, fp });
        break;
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// State token (Stage 1 Part D.1.3-5)
// ---------------------------------------------------------------------------------------------

let mutationCounter = 0;
let mutationObserverInstalled = false;

/** Called from main() only — never at module top level. WXT's `wxt prepare` statically imports
 * every entrypoint module in a plain Node context (no DOM) to analyze it, so anything that
 * touches `MutationObserver`/`document` at import time breaks that step. */
function ensureMutationCounter(): void {
  if (mutationObserverInstalled) return;
  mutationObserverInstalled = true;
  const observer = new MutationObserver((records) => {
    // Aegis's own debug overlay mutates the page (its host element's `style.display` is toggled
    // by hideForCapture()/restoreAfterCapture() around every capture). Counting those would make
    // the stateToken differ between the pre-harvest and post-capture reads on every observation
    // after the first, so the capture would never stabilise and the pipeline would exhaust its
    // retries. Ignore anything originating inside the overlay host.
    mutationCounter += records.filter((record) => !isInsideAegisOverlay(record.target)).length;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
}

function isInsideAegisOverlay(node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element && current.hasAttribute('data-aegis-overlay')) return true;
    current = current.parentNode;
  }
  return false;
}

function readStateToken(): StateToken {
  return {
    mutationCounter,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    dpr: window.devicePixelRatio,
    visualScale: window.visualViewport?.scale ?? 1,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
}

function stateTokensEqual(a: StateToken | null, b: StateToken | null): boolean {
  if (!a || !b) return false;
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

/** blockRef is always `${frameId}:${localIndex}` — see observe/types.ts's RawTextBlock docblock. */
function getFrameIdFromBlockRef(blockRef: string): number {
  const [frameIdStr] = blockRef.split(':');
  const frameId = Number(frameIdStr);
  return Number.isFinite(frameId) ? frameId : 0;
}

// ---------------------------------------------------------------------------------------------
// Message typing helpers (kept local to this file — these are internal content<->background
// messages, distinct from the public shared/messages.ts bus used by the side panel).
// ---------------------------------------------------------------------------------------------

interface SpanRequest {
  blockRef: string;
  start: number;
  end: number;
}

type AegisContentMessage =
  | { type: 'HARVEST_TREE'; data: { salt: string } }
  | { type: 'HARVEST_SUBTREE'; data: { salt: string } }
  | { type: 'GET_STATE_TOKEN' }
  | { type: 'HIDE_OVERLAY' }
  | { type: 'SHOW_OVERLAY' }
  | { type: 'RENDER_OVERLAY'; data: { elements: OverlayElement[]; media: RawMedia[] } }
  | { type: 'SPAN_RECTS'; data: { capture_id: string; stateToken: StateToken; spans: SpanRequest[] } };

function isAegisMessage(message: unknown): message is AegisContentMessage {
  return typeof message === 'object' && message !== null && 'type' in message && typeof (message as { type: unknown }).type === 'string';
}
