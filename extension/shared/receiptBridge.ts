import type { ProcessResult } from '../agentHost';

/**
 * Cross-context bridge for the full-page Privacy Receipt view (UI legibility pass, demo-recording
 * session). The receipt's data (`ProcessResult['preview']`) lives only in the side panel
 * document's React state — same rule as the token vault and session key (AGENTS.md invariant 8:
 * secrets are in-memory only, never written to any `chrome.storage` area or disk). Opening a
 * second extension page (`entrypoints/receipt/`) to show the same data at a readable size means
 * handing it across documents without ever touching storage: the receipt tab asks for it over
 * `browser.runtime.sendMessage` the instant it mounts, and the side panel — the only context that
 * ever calls `publishReceipt()` — answers directly from whatever it currently holds in memory. If
 * no side panel is open, there is nothing to answer with, and the tab shows its own empty state.
 *
 * This is deliberately NOT part of `shared/messages.ts`'s MessageMap: that bus is background <->
 * side panel only (see its own docblock). This is side panel <-> an ordinary extension tab, the
 * same kind of ad hoc, locally-typed messaging `RENDER_OVERLAY`/`SPAN_RECTS` already use for
 * side panel <-> content script.
 */

export type ReceiptViewData = ProcessResult['preview'];

interface ReceiptRequestMessage {
  type: 'RECEIPT_REQUEST';
}
interface ReceiptDataMessage {
  type: 'RECEIPT_DATA';
  data: ReceiptViewData;
}

let current: ReceiptViewData | null = null;
let openTabId: number | null = null;
let responderInstalled = false;

function installResponder(): void {
  if (responderInstalled) return;
  responderInstalled = true;
  browser.runtime.onMessage.addListener((message: Partial<ReceiptRequestMessage>) => {
    if (message?.type !== 'RECEIPT_REQUEST') return undefined; // not ours — let other listeners handle it
    return Promise.resolve(current);
  });
}

/** Side-panel-only. Called whenever a new step's receipt is available (PrivacyReceipt's own
 * effect). Updates what a fresh `RECEIPT_REQUEST` will be answered with, and, best-effort, pushes
 * straight to an already-open receipt tab so it updates live across steps rather than freezing on
 * the step it was opened for. */
export function publishReceipt(data: ReceiptViewData): void {
  current = data;
  installResponder();
  if (openTabId !== null) {
    browser.tabs.sendMessage(openTabId, { type: 'RECEIPT_DATA', data } satisfies ReceiptDataMessage).catch(() => {
      openTabId = null; // tab closed or navigated away; stop pushing to it
    });
  }
}

/** Side-panel-only. Opens the full-page receipt tab, or focuses it if already open. */
export async function openReceiptTab(): Promise<void> {
  installResponder();
  if (openTabId !== null) {
    try {
      await browser.tabs.update(openTabId, { active: true });
      return;
    } catch {
      openTabId = null; // stale id from a tab that's since been closed
    }
  }
  const tab = await browser.tabs.create({ url: browser.runtime.getURL('/receipt.html') });
  openTabId = tab.id ?? null;
}

export type { ReceiptRequestMessage, ReceiptDataMessage };
