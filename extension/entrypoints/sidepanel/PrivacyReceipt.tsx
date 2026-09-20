import { useEffect, useMemo, useState } from 'react';
import type { ProcessResult } from '../../agentHost';
import type { Category } from '../../privacy/categoryTypes';
import { isLockedCategory } from '../../privacy/policy';
import { severityClass } from './PrivacyPreview';
import { TOKEN_PATTERN } from '../../shared/schema/tokens';
import { openReceiptTab, publishReceipt } from '../../shared/receiptBridge';
import { categoryLabel, groupDigits, layerLabel } from './labels';

/**
 * The privacy receipt (demo-readiness session, Part B): side by side, for the CURRENT step —
 * LEFT the live page as the user sees it, RIGHT the exact sealed bytes the server received.
 *
 * `result.preview.draftJson` (built in agentHost/index.ts as
 * `new TextDecoder().decode(payload.bytes)`) IS the literal canonical bytes `verifyMasks()`
 * verified and `seal()` hashed and shipped — not a re-serialization, not a pre-redaction copy.
 * Every field this view renders (the image, the element list, the redaction manifest) is read
 * from that parsed JSON directly, so what's on screen is defensibly the same bytes by
 * construction, never a value that merely happens to match.
 *
 * Same hard rule as PrivacyPreview: never render a raw value. `elements[].label` is already the
 * SANITIZED accessible name (schema: "may contain tokens; never raw PII"), so showing it verbatim
 * is exactly what the server sees, not a leak.
 */

interface SealedElement {
  eid: string;
  role: string;
  label: string;
}

interface SealedRedaction {
  rid: string;
  kind: string;
  type: string;
  eid?: string;
}

interface SealedPayload {
  image?: string;
  elements: SealedElement[];
  redactions: SealedRedaction[];
}

const TOKEN_GLOBAL = new RegExp(TOKEN_PATTERN.source, 'g');

/** Parses the exact sealed bytes (`preview.draftJson`) back into an object for display. Pure and
 * DOM-free, so it's covered directly in Vitest (`__tests__/PrivacyReceipt.test.ts`) — rendering
 * itself is exercised by the Playwright e2e demo path, matching this repo's existing split between
 * pure logic (Vitest) and canvas/DOM-dependent behavior (e2e), e.g. `redactor.ts`/`faceModel.ts`. */
export function parseSealed(draftJson: string): SealedPayload | null {
  try {
    const parsed = JSON.parse(draftJson) as Partial<SealedPayload>;
    return { image: parsed.image, elements: parsed.elements ?? [], redactions: parsed.redactions ?? [] };
  } catch {
    return null;
  }
}

export function countTokens(draftJson: string): number {
  return (draftJson.match(TOKEN_GLOBAL) ?? []).length;
}

type PreviewDetections = ProcessResult['preview']['detections'];

/** Tallies non-ALLOW detections by category, most-frequent first. */
export function tallyCategories(detections: PreviewDetections): Array<[Category, number]> {
  const counts = new Map<Category, number>();
  for (const d of detections) {
    if (d.action === 'ALLOW') continue;
    counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Tallies non-ALLOW detections by the layer(s) that produced them (rule/checksum/field_context/
 * autocomplete/tag/visual/...), most-frequent first. */
export function tallyLayers(detections: PreviewDetections): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const d of detections) {
    if (d.action === 'ALLOW') continue;
    for (const source of d.sources) counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Accepts anything with a `.preview` — the full ProcessResult (side panel) or just the preview
 * bundle on its own (the full-page tab, which never sees a `SanitizedPayload`; see
 * extension/entrypoints/receipt/App.tsx and shared/receiptBridge.ts). */
export function PrivacyReceipt({ result, expanded = false }: { result: Pick<ProcessResult, 'preview'>; expanded?: boolean }) {
  const [showJson, setShowJson] = useState(false);
  const { draftJson, size, detections, rawImageDataUrl } = result.preview;

  const sealed = useMemo(() => parseSealed(draftJson), [draftJson]);
  const tokenCount = useMemo(() => countTokens(draftJson), [draftJson]);
  const categoryCounts = useMemo(() => tallyCategories(detections), [detections]);
  const layerCounts = useMemo(() => tallyLayers(detections), [detections]);

  // Pushes this step's receipt to the full-page tab if one is open, and answers it directly if it
  // asks (e.g. on its own mount). Local-only, in-memory (AGENTS.md invariant 8) — see
  // shared/receiptBridge.ts's docblock for why this isn't chrome.storage.
  useEffect(() => {
    publishReceipt(result.preview);
  }, [result.preview]);

  if (!sealed) {
    return (
      <section className="receipt" aria-label="Privacy receipt">
        <label>What left this device</label>
        <p className="error">This step&rsquo;s sent data could not be read back for display.</p>
      </section>
    );
  }

  return (
    <section className="receipt" aria-label="Privacy receipt">
      <div className="receipt-header">
        <label>What left this device, this step</label>
        <button className="btn btn-neutral btn-sm" onClick={() => void openReceiptTab()}>
          Open full view ↗
        </button>
      </div>

      {/* The one strip that is always on screen. Everything on it changes every step; anything
        * constant or historical lives in the expander below (Part B2's rule). Bytes sealed leads
        * because it is the literal measure of what left the device. */}
      <div className="receipt-counters">
        <span className="counter-lead" title="The exact size of the data sent to the server for this step">
          <b>{groupDigits(size)}</b> <small>bytes sealed</small>
        </span>
        <span title="Private values swapped for a placeholder before sending">
          <b>{tokenCount}</b> <small>token{tokenCount === 1 ? '' : 's'}</small>
        </span>
        <span title="Areas painted over in the image before sending">
          <b>{sealed.redactions.length}</b> <small>redaction{sealed.redactions.length === 1 ? '' : 's'}</small>
        </span>
        <span title="How many things on the page the server can see at all">
          <b>{sealed.elements.length}</b> <small>elements the server sees</small>
        </span>
      </div>

      <div className="image-compare">
        <figure>
          <figcaption>On your screen — stays here</figcaption>
          {rawImageDataUrl ? <img src={rawImageDataUrl} alt="the live page, as captured locally" /> : <p className="image-missing">Nothing captured this step</p>}
        </figure>
        <figure>
          <figcaption>Sent to the server — exactly this</figcaption>
          {sealed.image ? <img src={sealed.image} alt="sealed, redacted page sent to the server" /> : <p className="image-missing">No picture sent this step — the page had not changed</p>}
        </figure>
      </div>

      <label>Hidden from the server this step</label>
      <div className="receipt-tags">
        {categoryCounts.length === 0 && <span className="hint">Nothing private on this screen.</span>}
        {categoryCounts.map(([category, count]) => (
          <span key={category} className={`receipt-tag ${severityClass(category, 'FILL')}`}>
            {categoryLabel(category)}
            {isLockedCategory(category) ? ' 🔒' : ''} × {count}
          </span>
        ))}
      </div>

      {/* One click away, per Part B2: which layer caught what, the full manifest, and the sealed
        * bytes themselves. Open by default in the full-page view, which has the room for it. */}
      <details className="receipt-detail" open={expanded}>
        <summary>How Aegis worked this out</summary>

        <label>What spotted each one</label>
        <div className="receipt-tags">
          {layerCounts.length === 0 && <span className="hint">Nothing private on this screen.</span>}
          {layerCounts.map(([source, count]) => (
            <span key={source} className="receipt-tag sev-allow">
              {layerLabel(source)} × {count}
            </span>
          ))}
        </div>

        {/* Deliberately the raw `type` and `kind` from the sealed bytes, not a friendly rename:
          * this list's whole claim is that it mirrors what was sent, field for field. */}
        <label>Everything painted over ({sealed.redactions.length})</label>
        <div className="detections">
          {sealed.redactions.map((r) => (
            <div key={r.rid} className={`detection ${severityClass(r.type as Category, 'FILL')}`}>
              <b>{r.type}</b> <span className="action">{r.kind}</span>
              <br />
              <span className="meta">
                {r.rid}
                {r.eid ? ` · ${r.eid}` : ''}
              </span>
            </div>
          ))}
        </div>

        <label>Everything the server can see ({sealed.elements.length})</label>
        <div className="detections">
          {sealed.elements.map((el) => (
            <div key={el.eid} className="detection sev-allow">
              <b>{el.eid}</b> <span className="action">{el.role}</span>
              <br />
              <span className="meta">&quot;{el.label || '(no label)'}&quot;</span>
            </div>
          ))}
        </div>

        <label>
          The exact data sent{' '}
          <button className="action" onClick={() => setShowJson((v) => !v)}>
            {showJson ? 'hide' : 'show'}
          </button>
        </label>
        {showJson && <pre className="payload-json">{JSON.stringify(JSON.parse(draftJson), null, 2)}</pre>}
      </details>
    </section>
  );
}
