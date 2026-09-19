import { useMemo, useState } from 'react';
import type { ProcessResult } from '../../agentHost';
import type { Category } from '../../privacy/categoryTypes';
import { isLockedCategory } from '../../privacy/policy';
import { severityClass } from './PrivacyPreview';
import { TOKEN_PATTERN } from '../../shared/schema/tokens';

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

export function PrivacyReceipt({ result }: { result: ProcessResult }) {
  const [showJson, setShowJson] = useState(false);
  const { draftJson, size, detections, rawImageDataUrl } = result.preview;

  const sealed = useMemo(() => parseSealed(draftJson), [draftJson]);
  const tokenCount = useMemo(() => countTokens(draftJson), [draftJson]);
  const categoryCounts = useMemo(() => tallyCategories(detections), [detections]);
  const layerCounts = useMemo(() => tallyLayers(detections), [detections]);

  if (!sealed) {
    return (
      <section className="receipt" aria-label="Privacy receipt">
        <label>Privacy receipt</label>
        <p className="error">Could not parse this step's sealed payload for display.</p>
      </section>
    );
  }

  return (
    <section className="receipt" aria-label="Privacy receipt">
      <label>Privacy receipt — this step</label>

      <div className="image-compare">
        <figure>
          <figcaption>What you see — never leaves the browser</figcaption>
          {rawImageDataUrl ? <img src={rawImageDataUrl} alt="the live page, as captured locally" /> : <p>no capture</p>}
        </figure>
        <figure>
          <figcaption>What the server received — the exact sealed bytes</figcaption>
          {sealed.image ? <img src={sealed.image} alt="sealed, redacted page sent to the server" /> : <p>no image in this payload</p>}
        </figure>
      </div>

      <div className="receipt-counters">
        <span>
          <b>{size}</b> bytes sealed
        </span>
        <span>
          <b>{tokenCount}</b> token{tokenCount === 1 ? '' : 's'}
        </span>
        <span>
          <b>{sealed.redactions.length}</b> redaction{sealed.redactions.length === 1 ? '' : 's'}
        </span>
        <span>
          <b>{sealed.elements.length}</b> element{sealed.elements.length === 1 ? '' : 's'}
        </span>
      </div>

      <label>Categories redacted this step</label>
      <div className="receipt-tags">
        {categoryCounts.length === 0 && <span className="hint">Nothing sensitive this step.</span>}
        {categoryCounts.map(([category, count]) => (
          <span key={category} className={`receipt-tag ${severityClass(category, 'FILL')}`}>
            {category}
            {isLockedCategory(category) ? ' 🔒' : ''} × {count}
          </span>
        ))}
      </div>

      <label>Which layer produced each redaction</label>
      <div className="receipt-tags">
        {layerCounts.length === 0 && <span className="hint">Nothing sensitive this step.</span>}
        {layerCounts.map(([source, count]) => (
          <span key={source} className="receipt-tag sev-allow">
            {source} × {count}
          </span>
        ))}
      </div>

      <label>Redaction manifest ({sealed.redactions.length})</label>
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

      <label>Elements the server can see ({sealed.elements.length})</label>
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
        Sealed payload{' '}
        <button className="action" onClick={() => setShowJson((v) => !v)}>
          {showJson ? 'hide' : 'show'}
        </button>
      </label>
      {showJson && <pre className="payload-json">{JSON.stringify(JSON.parse(draftJson), null, 2)}</pre>}
    </section>
  );
}
