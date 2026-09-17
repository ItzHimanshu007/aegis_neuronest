import { useState } from 'react';
import type { ProcessResult } from '../../agentHost';
import type { Action, Category } from '../../privacy/categoryTypes';
import { classOf, isLockedCategory } from '../../privacy/policy';

/**
 * Privacy Preview (Stage 2 Part G) — the seed of Judge Mode. Shows exactly what would leave the
 * device, and what was removed before it could.
 *
 * Hard rule: this UI never renders a raw value. Detections show category, source, confidence,
 * decision and value LENGTH only. There is deliberately no "show values" control anywhere.
 */

const SEVERITY_CLASS: Record<string, string> = {
  never_automated: 'sev-high',
  credential: 'sev-high',
  high: 'sev-high',
  biometric: 'sev-high',
  documents: 'sev-high',
  medium: 'sev-medium',
  quasi: 'sev-quasi',
  non_pii: 'sev-allow',
};

function severityClass(category: Category, action: Action): string {
  if (action === 'ALLOW') return 'sev-allow';
  return SEVERITY_CLASS[classOf(category)] ?? 'sev-allow';
}

/** A representative category per class, so the toggle list shows the locked/unlocked boundary
 * without becoming a wall of 30 checkboxes. */
const CATEGORY_TOGGLES: Category[] = ['OTP', 'PASSWORD', 'AADHAAR', 'CARD_NUMBER', 'FACE', 'ID_DOCUMENT', 'NAME', 'EMAIL', 'PHONE', 'CITY', 'ORDER_ID'];

export function PrivacyPreview({ result }: { result: ProcessResult }) {
  const [showMasks, setShowMasks] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const { preview, payload } = result;

  const maskedCount = preview.detections.filter((d) => d.action !== 'ALLOW').length;

  return (
    <div className="preview">
      <section>
        <label>What left the device</label>
        <pre>
          {JSON.stringify(
            {
              digest: preview.digest,
              bytes: preview.size,
              capture_id: payload.capture_id,
              detections: preview.detections.length,
              masked: maskedCount,
              neutralizedTokenLikeStrings: preview.neutralizedCount,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section>
        <label>
          Raw (local only) vs redacted{' '}
          <input type="checkbox" checked={showMasks} onChange={() => setShowMasks((v) => !v)} /> show masks
        </label>
        <div className="image-compare">
          <figure>
            <figcaption>Raw — never leaves the browser</figcaption>
            {preview.rawImageDataUrl ? <img src={preview.rawImageDataUrl} alt="raw capture" /> : <p>no capture</p>}
          </figure>
          <figure>
            <figcaption>Redacted — what the server would see</figcaption>
            {preview.redactedImageDataUrl ? (
              <img src={showMasks ? preview.redactedImageDataUrl : preview.rawImageDataUrl} alt="redacted capture" />
            ) : (
              <p>no image in this payload</p>
            )}
          </figure>
        </div>
      </section>

      <section>
        <label>Seal checks</label>
        <pre>
          {[
            '1 schema                 PASS',
            '2 rule scan              PASS',
            '3 known-value leak       PASS',
            '4 issued-token check     PASS',
            '5 mask coverage          PASS',
            '6 mask integrity         PASS',
            '7 capture_id consistency PASS',
            '8 canonical + digest     PASS',
            '',
            `digest ${preview.digest}`,
            `bytes  ${preview.size}`,
          ].join('\n')}
        </pre>
        <p className="hint">
          All eight checks passed — `seal()` throws on the first failure, so a payload existing at all
          means every check succeeded.
        </p>
      </section>

      <section>
        <label>Detections ({preview.detections.length})</label>
        <div className="detections">
          {preview.detections.map((d) => (
            <div key={d.id} className={`detection ${severityClass(d.category, d.action)}`}>
              <b>{d.category}</b>
              {isLockedCategory(d.category) ? <span className="locked" title="Locked class — user settings cannot downgrade this"> 🔒</span> : null}{' '}
              <span className="action">{d.action}</span>
              <br />
              <span className="meta">
                {d.sources.join('+')} · conf {d.confidence.toFixed(2)} · {d.targetKind}
                {d.valueLength !== undefined ? ` · value length ${d.valueLength}` : ''} · {d.rectCount} rect(s)
              </span>
            </div>
          ))}
        </div>
      </section>

      {preview.spanFallbacks.length > 0 && (
        <section>
          <label>Span-rect fallbacks (whole block masked instead)</label>
          <pre>{preview.spanFallbacks.map((f) => `${f.detectionId}: ${f.reason}`).join('\n')}</pre>
        </section>
      )}

      <section>
        <label>Timings (ms)</label>
        <pre>
          {JSON.stringify(
            {
              detect: Math.round(preview.timings.detectMs),
              policy: Math.round(preview.timings.policyMs),
              redact: Math.round(preview.timings.redactMs),
              seal: Math.round(preview.timings.sealMs),
              sealBreakdown: {
                schema: Math.round(preview.sealTimings.schemaMs),
                ruleScan: Math.round(preview.sealTimings.ruleScanMs),
                leakCheck: Math.round(preview.sealTimings.leakCheckMs),
                tokenCheck: Math.round(preview.sealTimings.tokenCheckMs),
                coverage: Math.round(preview.sealTimings.coverageMs),
                maskIntegrity: Math.round(preview.sealTimings.maskIntegrityMs),
                serialize: Math.round(preview.sealTimings.serializeMs),
              },
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section>
        <label>Category settings</label>
        <div className="category-toggles">
          {CATEGORY_TOGGLES.map((category) => {
            const locked = isLockedCategory(category);
            return (
              <label
                key={category}
                title={locked ? `${category} is in a locked class (${classOf(category)}) — its protection can be made stricter, never weaker.` : `${category} protection can be adjusted.`}
              >
                <input type="checkbox" checked readOnly disabled={locked} />
                <span>
                  {category} {locked ? '🔒 locked' : ''}
                </span>
              </label>
            );
          })}
        </div>
        <p className="hint">
          Locked categories are shown disabled on purpose: a user can make Aegis stricter, never looser
          (docs/policy.yaml). Editing the unlocked ones lands with the consent screen in Stage 3.
        </p>
      </section>

      <section>
        <label>
          Sealed payload{' '}
          <button className="action" onClick={() => setShowJson((v) => !v)}>
            {showJson ? 'hide' : 'show'}
          </button>
        </label>
        {showJson && <pre className="payload-json">{prettyPrint(preview.draftJson)}</pre>}
      </section>
    </div>
  );
}

function prettyPrint(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
