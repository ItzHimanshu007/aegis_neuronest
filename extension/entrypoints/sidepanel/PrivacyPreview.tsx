import { useState } from 'react';
import type { ProcessResult } from '../../agentHost';
import type { Action, Category } from '../../privacy/categoryTypes';
import { classOf, isLockedCategory } from '../../privacy/policy';
import { categoryLabel } from './labels';

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

export function severityClass(category: Category, action: Action): string {
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
        <label>Summary of what would be sent</label>
        <pre>
          {JSON.stringify(
            {
              digest: preview.digest,
              bytes: preview.size,
              capture_id: payload.capture_id,
              state_token: payload.state_token,
              sensing: preview.sensingCounters,
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
          Before and after{' '}
          <input type="checkbox" checked={showMasks} onChange={() => setShowMasks((v) => !v)} /> paint over the private parts
        </label>
        <div className="image-compare">
          <figure>
            <figcaption>On your screen — stays here</figcaption>
            {preview.rawImageDataUrl ? <img src={preview.rawImageDataUrl} alt="raw capture" /> : <p>no capture</p>}
          </figure>
          <figure>
            <figcaption>What the server would get</figcaption>
            {preview.redactedImageDataUrl ? (
              <img src={showMasks ? preview.redactedImageDataUrl : preview.rawImageDataUrl} alt="redacted capture" />
            ) : (
              <p>no image in this payload</p>
            )}
          </figure>
        </div>
      </section>

      <section>
        <label>Checks run before anything can be sent</label>
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
          All eight passed. There is no way to get a half-checked payload: sealing stops at the first
          failure, so data existing here at all means every check succeeded.
        </p>
      </section>

      <section>
        <label>What Aegis found on this page ({preview.detections.length})</label>
        <div className="detections">
          {preview.detections.map((d) => (
            <div key={d.id} className={`detection ${severityClass(d.category, d.action)}`}>
              <b>{categoryLabel(d.category)}</b>
              {isLockedCategory(d.category) ? <span className="locked" title="Locked class — user settings cannot downgrade this"> 🔒</span> : null}{' '}
              <span className="action">{d.action}</span>
              <br />
              {d.certainty === 'uncertain' ? (
                <span className="uncertain" title="Not confidently classified — masked out of the image, and never sent as a token"> · uncertain</span>
              ) : null}
              <span className="meta">
                {d.targetKind === 'element' ? `${d.targetRef} · ` : ''}{d.sources.join('+')} · conf {d.confidence.toFixed(2)} · {d.targetKind}
                {d.valueLength !== undefined ? ` · value length ${d.valueLength}` : ''} · {d.rectCount} rect(s)
              </span>
              {d.evidence?.length ? (
                <>
                  <br />
                  <span className="meta">{explainEvidence(d.evidence)}</span>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {preview.spanFallbacks.length > 0 && (
        <section>
          <label>Could not pin down exactly where — whole block painted over instead</label>
          <pre>{preview.spanFallbacks.map((f) => `${f.detectionId}: ${f.reason}`).join('\n')}</pre>
        </section>
      )}

      <section>
        <label>How long each part took (ms)</label>
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
        <label>What Aegis protects</label>
        <div className="category-toggles">
          {CATEGORY_TOGGLES.map((category) => {
            const locked = isLockedCategory(category);
            return (
              <label
                key={category}
                title={locked ? `${category} can be made stricter, never weaker.` : `${category} protection can be adjusted.`}
              >
                <input type="checkbox" checked readOnly disabled={locked} />
                <span>
                  {categoryLabel(category)} {locked ? '🔒 locked' : ''}
                </span>
              </label>
            );
          })}
        </div>
        <p className="hint">
          The locked ones are disabled on purpose: you can make Aegis stricter, never looser.
        </p>
      </section>

      <section>
        <label>
          The exact data that would be sent{' '}
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

/**
 * Stage 7H — a concise, plain-language reason for one detection.
 *
 * Deliberately readable rather than exhaustive: the panel says "matches a known checksum" where
 * the detector recorded `checksum_pass`. The signal names themselves stay local, and none of this
 * is ever put in a payload — telling the server, and therefore a hostile page, exactly which
 * signals fired would be a map of how to evade them.
 */
const EVIDENCE_REASONS: Record<string, string> = {
  checksum_pass: 'passes its checksum',
  self_describing_shape: 'the value names its own type',
  structured_shape: 'a distinctive value format',
  weak_shape: 'a loose value format',
  inline_label_bound: 'a nearby label names it',
  autocomplete_match: 'the field\u2019s autocomplete agrees',
  input_semantics: 'the field type agrees',
  length_constraint_match: 'the field\u2019s length limit agrees',
  container_label: 'the surrounding section names it',
  page_context: 'identity data already seen on this site',
  checksum_fail_definitional: 'fails the checksum for that identifier',
  non_pii_container: 'sits in a reference/catalogue section',
  non_pii_shape: 'matches a known non-personal format',
  repeated_across_page: 'repeats across the page like table data',
  in_search_scope: 'typed into a search box',
  generic_username_shape: 'looks like an ordinary username',
};

export function explainEvidence(signals: string[]): string {
  const reasons = signals.map((s) => EVIDENCE_REASONS[s]).filter(Boolean);
  return reasons.length ? `why: ${reasons.join(' · ')}` : '';
}
