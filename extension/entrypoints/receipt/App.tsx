import { useEffect, useState } from 'react';
import { PrivacyReceipt } from '../sidepanel/PrivacyReceipt';
import type { ReceiptDataMessage, ReceiptRequestMessage, ReceiptViewData } from '../../shared/receiptBridge';

/**
 * The full-page Privacy Receipt (UI legibility pass, demo-recording session). Same component,
 * same classes, same sealed bytes as the in-panel view (PrivacyReceipt.tsx) — this page only
 * widens the layout and raises the type scale via the `.receipt-fullpage` CSS scope (see
 * sidepanel/style.css). It never re-serializes or re-renders the payload: the data it receives
 * IS `ProcessResult.preview` from the side panel, unchanged.
 *
 * Data arrives over `shared/receiptBridge.ts`'s messaging, never via storage — see that file's
 * docblock. If no side panel is open to answer, this shows its own empty state rather than
 * failing silently.
 */
export default function App() {
  const [preview, setPreview] = useState<ReceiptViewData | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const onMessage = (message: Partial<ReceiptDataMessage>) => {
      if (message?.type === 'RECEIPT_DATA' && message.data) setPreview(message.data);
    };
    browser.runtime.onMessage.addListener(onMessage);
    browser.runtime
      .sendMessage({ type: 'RECEIPT_REQUEST' } satisfies ReceiptRequestMessage)
      .then((data: ReceiptViewData | undefined) => {
        if (data) setPreview(data);
      })
      .catch(() => {
        /* no side panel open to answer — the empty state below explains this */
      })
      .finally(() => setAsked(true));
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  return (
    <main className="receipt-fullpage">
      <h1>Aegis — Privacy Receipt</h1>
      {preview ? (
        <PrivacyReceipt result={{ preview }} />
      ) : (
        <p className="hint">
          {asked
            ? 'No receipt available. Open the Aegis side panel, run a task step, then use “Open full view” again.'
            : 'Loading…'}
        </p>
      )}
    </main>
  );
}
