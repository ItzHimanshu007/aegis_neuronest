/**
 * The firewall is the single point where a draft payload becomes something that is allowed to
 * leave the browser (AGENTS.md invariant 2).
 *
 * `seal()` runs EVERY check below and throws `SealError` on the first failure — nothing is
 * returned, nothing is registered, and therefore nothing can be sent. The checks are deliberately
 * redundant with the layers upstream of them: detection, policy, tokenization and redaction are
 * all supposed to have already made the payload safe, and `seal()` assumes all of them are buggy.
 *
 *   1. JSON-schema validation (precompiled standalone validator — no runtime codegen)
 *   2. Rule scan over every outgoing string
 *   3. Known-value leak check against the vault and observed raw values
 *   4. Token check — every token-shaped string is one the vault actually issued
 *   5. Coverage — every non-ALLOW detection's rects are covered by manifest masks
 *   6. verifyMasks() — the pixels really are filled, and every Set-of-Marks tag names an
 *      outbound EID
 *   7. capture_id consistency, and at most one image
 *   8. Canonical serialization -> bytes -> SHA-256 digest -> registry -> SanitizedPayload
 */

import validatePayloadSchema from './generated/payloadValidator.js';
import { AEGIS_CONFIG } from '../shared/config';
import { TOKEN_PATTERN } from '../shared/schema/tokens';
import { runRules } from './detect/rules';
import { normalizeValue } from './vault';
import { verifyMasks, type RedactResult } from './redactor';
import { SOM_LABEL_PATTERN } from './som';
import type { Action, Category } from './categoryTypes';
import type { Detection } from './detect/types';
import type { DraftPayload } from './payloadBuilder';
import { registerSealed, sha256Hex, type SanitizedPayload } from './sealedRegistry';

export type SealFailureReason =
  | 'schema'
  | 'rule-scan'
  | 'known-value-leak'
  | 'unknown-token'
  | 'coverage'
  | 'mask-integrity'
  | 'capture-id-mismatch'
  | 'image-count'
  | 'som-label';

export { isRegisteredSealed, consumeSealed, sha256Hex, type SanitizedPayload } from './sealedRegistry';

export class SealError extends Error {
  constructor(
    readonly reason: SealFailureReason,
    readonly details: unknown,
  ) {
    super(`seal() refused: ${reason} — ${JSON.stringify(details)?.slice(0, 500)}`);
    this.name = 'SealError';
  }
}

export interface SealContext {
  /** Every value the vault holds, for the leak check. */
  vaultValues: Array<{ value: string; normalized: string; type: Category }>;
  /** Tokens the vault actually issued — anything token-shaped that isn't here is forged. */
  issuedTokens: Set<string>;
  /** Detections and the action each one resolved to, for the coverage check. */
  decisions: Array<{ detection: Detection; action: Action }>;
  /** The redaction result, for verifyMasks(). Omitted for text-only drafts. */
  redactResult?: RedactResult;
  /** Raw observed values of non-ALLOW detections, for the leak check. */
  observedRawValues: Array<{ value: string; category: Category }>;
}

export interface SealTimings {
  schemaMs: number;
  ruleScanMs: number;
  leakCheckMs: number;
  tokenCheckMs: number;
  coverageMs: number;
  maskIntegrityMs: number;
  serializeMs: number;
  totalMs: number;
}

export interface SealResult {
  payload: SanitizedPayload;
  timings: SealTimings;
}

/**
 * Walks every string in the draft, with a path for error reporting.
 *
 * The image data URL is excluded. It is base64-encoded BINARY, not text: substring-scanning it is
 * meaningless (any long base64 blob contains, by chance, short digit runs and letter sequences
 * that will match almost any value's normalized form), and doing so produced exactly that false
 * positive in practice — a masked Aadhaar's 4-digit tail "matching" inside the PNG bytes. The
 * image's safety is established far more meaningfully by checks 5 and 6 (every non-ALLOW
 * detection's rects are covered by a mask, and `verifyMasks()` confirms those pixels really are
 * filled at both full and downscaled resolution).
 *
 * The protocol envelope — `session`, `capture_id`, `schema`, `state_token`, `mode` — is excluded
 * for the same reason, found the same way: `capture_id` is `crypto.randomUUID()`, and its last
 * 12-hex-digit segment lands on all-digit characters (no a-f) about 0.75% of the time — a fixed
 * 12-digit run is exactly AADHAAR's shape, so a plain page reload would occasionally fail to seal
 * for a reason that has nothing to do with the page. None of these five fields is ever derived
 * from page content or task text; they are generated locally by the extension's own session,
 * capture and state-token layers, and PII shape-matching a random identifier is only ever a false
 * positive.
 *
 * `redactions[].rid`/`visual_regions[].rid` (`${capture_id}-${counter}-${suffix}`, scene/index.ts)
 * reproduced the identical failure (Stage 3B Part II, e2e/probe-fixtures.spec.ts, once in dozens
 * of runs): a rid landing on 12 consecutive digits, matching AADHAAR's shape purely by chance. Same
 * reasoning as capture_id — never derived from page content, matched by path suffix rather than one
 * exact path per array index since an array can hold any number of redactions.
 *
 * `elements[].fp` (demo-readiness session) is the same risk left unmeasured when `rid` was fixed
 * above: a 16-hex-char fingerprint (`fp_a1b2c3d4e5f60718`-shaped, `minLength: 1` in the schema, no
 * further pattern), exactly as capable of landing on an all-digit 12-character run as
 * `capture_id`/`rid` were, and just as opaque — assigned locally by the Scene Graph registry
 * (`scene/registry.ts`), never derived from page content.
 *
 * `elements[].eid` was named alongside `fp` as sharing this risk "in principle" when `rid` was
 * fixed, but on inspection it is not actually reachable: the schema pins it to `^E[0-9]{1,6}$`
 * (checked in `walkStrings` at check 1, before check 2 ever runs), so its longest possible digit
 * run is 6 — shorter than every UNCONDITIONAL_RULES pattern's own minimum length (AADHAAR 12,
 * PAN/CARD_NUMBER/IFSC 10+), and CONTEXT_ONLY_RULES (which includes the one 6-digit rule, PIN_CODE)
 * never fire here because `runRules(scannable, {})` passes no `fieldCategory` and every
 * context-gated rule requires one. `eid` is excluded anyway, for the same reason `capture_id` and
 * `rid` are unconditionally excluded regardless of today's rule lengths: it is structurally
 * impossible for it to be page content, so a future shorter rule colliding with it would be a
 * false positive by the same argument, not a real leak.
 */
const PROTOCOL_ENVELOPE_PATHS = new Set(['$.session', '$.capture_id', '$.schema', '$.state_token', '$.mode']);
const OPAQUE_ID_SUFFIX = /\.(rid|fp|eid)$/;
/**
 * `redactions[].type|kind|reason` are LOCALLY-GENERATED CLOSED VOCABULARIES, excluded for the same
 * structural reason as `rid`/`fp`/`eid` above: it is impossible for them to carry page data, so any
 * match on them is a false positive by construction rather than a leak.
 *
 * All three are written at exactly one place, `scene/index.ts`:
 *   `redactions.push({ rid, eid, kind, type: detection.category, reason: `${sources} -> ${action}` })`
 * `type` is a `Category` (a closed TS union of 38 fixed names), `kind` is a schema `enum`
 * (FILL/LABELLED_FILL/BLUR/FILL_REGION), and `reason` is built from the detection-source and action
 * vocabularies. None is derived from the page.
 *
 * Found by the Stage 4 held-out corpus, and reachable on a REAL page. The leak check compares every
 * observed raw value against every payload string with a 4-character floor (`LEAK_MIN_LEN`), and
 * `orderIdRule` is context-gated but very broad — `[A-Za-z0-9][A-Za-z0-9-]{4,24}`. On a checkout
 * page with a field labelled "Order number" it matches the bare word `number` and records it as an
 * observed ORDER_ID value. If that same page also carries a card field, `redactions[].type` is the
 * literal string `CARD_NUMBER`, which CONTAINS `number` — so `seal()` threw `known-value-leak` and
 * refused a payload that leaked nothing at all. `kind` carries the same latent collision against a
 * 4-character page word such as `fill`.
 *
 * This narrows only WHERE the check looks, never WHAT it looks for. Every page-derived string in the
 * payload — element labels, text blocks, task text, field hints, visual regions — is still scanned
 * exactly as before, and `extension/privacy/__tests__/firewall.localVocabulary.test.ts` pins both
 * halves of that. A stronger form of this guarantee would enum-constrain `redaction.type` in
 * `shared/schema/payload.v2.schema.json` so the closed vocabulary is provable rather than a
 * convention; that is a schema change with a Pydantic mirror, and is left for a later stage.
 */
const LOCAL_VOCABULARY_PATH = /^\$\.redactions\[\d+\]\.(type|kind|reason)$/;
function* walkStrings(value: unknown, path = '$'): Generator<{ path: string; value: string }> {
  if (typeof value === 'string') {
    if (
      path === '$.image' ||
      PROTOCOL_ENVELOPE_PATHS.has(path) ||
      OPAQUE_ID_SUFFIX.test(path) ||
      LOCAL_VOCABULARY_PATH.test(path)
    )
      return;
    yield { path, value };
  } else if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* walkStrings(item, `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) yield* walkStrings(item, `${path}.${key}`);
  }
}

const TOKEN_GLOBAL = new RegExp(TOKEN_PATTERN.source, 'g');

/** Strips every token from a string, so rule/leak checks don't trip over token contents. */
function withoutTokens(text: string): string {
  return text.replace(TOKEN_GLOBAL, ' ');
}

function rectsCover(outer: Array<{ x: number; y: number; width: number; height: number }>, inner: { x: number; y: number; width: number; height: number }): boolean {
  // A rect is covered if every one of its corners falls inside at least one mask rect. Masks are
  // already padded, so this tolerates sub-pixel differences without being loose about it.
  const corners = [
    { x: inner.x, y: inner.y },
    { x: inner.x + inner.width, y: inner.y },
    { x: inner.x, y: inner.y + inner.height },
    { x: inner.x + inner.width, y: inner.y + inner.height },
  ];
  return corners.every((corner) => outer.some((o) => corner.x >= o.x - 1 && corner.x <= o.x + o.width + 1 && corner.y >= o.y - 1 && corner.y <= o.y + o.height + 1));
}

/** Returns the overlap of two rects, or null when they don't intersect at all. */
function intersectRect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Canonical JSON: object keys sorted, no whitespace. Two structurally identical payloads always
 * serialize to identical bytes, so the digest is stable and verifiable on the server. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

const NON_ALLOW_ACTIONS: Action[] = ['TOKEN', 'TOKEN_WITH_APPROVAL', 'FILL', 'FILL_REGION', 'BLUR', 'USER_ENTERS', 'USER_PROVIDED_ORIGIN_BOUND'];

export async function seal(draft: DraftPayload, ctx: SealContext): Promise<SealResult> {
  const totalStart = performance.now();

  // --- 1. schema -------------------------------------------------------------------------------
  // Precompiled at build time by `pnpm gen:validator` — ajv's runtime `compile()` generates code
  // and evaluates it with `new Function`, which the extension CSP blocks and AGENTS.md invariant 7
  // forbids outright. See scripts/gen-validator.mjs.
  let t = performance.now();
  if (!validatePayloadSchema(draft)) {
    throw new SealError('schema', validatePayloadSchema.errors);
  }
  const schemaMs = performance.now() - t;

  const strings = Array.from(walkStrings(draft));

  // --- 2. rule scan ----------------------------------------------------------------------------
  t = performance.now();
  const allowedCategories = new Set<Category>(
    ctx.decisions.filter((d) => d.action === 'ALLOW').map((d) => d.detection.category),
  );
  for (const { path, value } of strings) {
    const scannable = withoutTokens(value);
    for (const match of runRules(scannable, {})) {
      if (allowedCategories.has(match.category)) continue;
      throw new SealError('rule-scan', { path, category: match.category });
    }
  }
  const ruleScanMs = performance.now() - t;

  // --- 3. known-value leak check ---------------------------------------------------------------
  t = performance.now();
  const nonAllowValues = [
    ...ctx.vaultValues.map((v) => ({ value: v.value, normalized: v.normalized, category: v.type })),
    ...ctx.observedRawValues.map((v) => ({ value: v.value, normalized: normalizeValue(v.category, v.value), category: v.category })),
  ];
  const haystacks = strings.map((s) => ({ path: s.path, text: withoutTokens(s.value), lower: withoutTokens(s.value).toLowerCase(), digits: withoutTokens(s.value).replace(/\D/g, '') }));

  for (const known of nonAllowValues) {
    // A candidate that is ALL DIGITS is held to the stricter digit floor, not the textual one.
    // Normalizing a partially-masked value ("XXXX XXXX 0124") strips the mask and leaves a short
    // digit run, which then collides with any text containing those same digits — including the
    // page's own full, correctly-tokenized Aadhaar. Short digit runs are not identifying, and
    // treating them as leaks blocks payloads that contain no leak at all.
    const candidates = [known.value, known.normalized].filter((v) => {
      const floor = /^\d+$/.test(v) ? AEGIS_CONFIG.LEAK_MIN_DIGITS : AEGIS_CONFIG.LEAK_MIN_LEN;
      return v.length >= floor;
    });
    const digitsOnly = known.value.replace(/\D/g, '');
    for (const haystack of haystacks) {
      for (const candidate of candidates) {
        if (haystack.lower.includes(candidate.toLowerCase())) {
          throw new SealError('known-value-leak', { path: haystack.path, category: known.category, length: candidate.length });
        }
      }
      // Digits-only comparison needs a HIGHER floor than the textual one: a 4-digit run appears
      // by coincidence in almost any numeric string, so matching on it flags noise rather than
      // leaks. LEAK_MIN_DIGITS is the separate, stricter threshold for this form.
      if (digitsOnly.length >= AEGIS_CONFIG.LEAK_MIN_DIGITS && haystack.digits.includes(digitsOnly)) {
        throw new SealError('known-value-leak', { path: haystack.path, category: known.category, form: 'digits-only', length: digitsOnly.length });
      }
    }
  }
  const leakCheckMs = performance.now() - t;

  // --- 4. token check --------------------------------------------------------------------------
  t = performance.now();
  for (const { path, value } of strings) {
    for (const match of value.matchAll(TOKEN_GLOBAL)) {
      if (!ctx.issuedTokens.has(match[0])) {
        throw new SealError('unknown-token', { path, token: match[0] });
      }
    }
    // Loose look-alikes must already have been neutralized upstream.
    if (/\[\s*\[\s*P\s*I\s*I\s*:/i.test(value) && !TOKEN_GLOBAL.test(value)) {
      TOKEN_GLOBAL.lastIndex = 0;
      if (!new RegExp(TOKEN_PATTERN.source).test(value)) {
        throw new SealError('unknown-token', { path, reason: 'un-neutralized token look-alike' });
      }
    }
    TOKEN_GLOBAL.lastIndex = 0;
  }
  const tokenCheckMs = performance.now() - t;

  // --- 5. coverage -----------------------------------------------------------------------------
  t = performance.now();
  const maskRects = (ctx.redactResult?.image.masks ?? []).map((m) => m.pxRect);
  for (const { detection, action } of ctx.decisions) {
    // DOM-only observations have no outbound pixels; text checks above still run.
    if (draft.image === undefined && !ctx.redactResult) continue;
    if (!NON_ALLOW_ACTIONS.includes(action)) continue;
    if (detection.rects.length === 0) continue; // side-channel/task detections have no geometry
    if (!ctx.redactResult) {
      throw new SealError('coverage', { detectionId: detection.id, reason: 'no redaction result for a detection with rects' });
    }
    const imageW = ctx.redactResult.fullResolution.pxW;
    const imageH = ctx.redactResult.fullResolution.pxH;
    for (const rect of detection.rects) {
      const pxRect = {
        x: rect.x * ctx.redactResult.scaleX,
        y: rect.y * ctx.redactResult.scaleY,
        width: rect.width * ctx.redactResult.scaleX,
        height: rect.height * ctx.redactResult.scaleY,
      };

      // Clip to the captured image. A detection can legitimately sit outside the viewport — the
      // page scrolls, the capture doesn't — and a region that isn't in the image has no pixels to
      // redact, so demanding a mask for it would fail on something that cannot leak through the
      // image in the first place. (Its TEXT is still governed independently by the rule scan,
      // leak check and token check, which do not care about geometry.)
      const visible = intersectRect(pxRect, { x: 0, y: 0, width: imageW, height: imageH });
      if (!visible) continue;

      if (!rectsCover(maskRects, visible)) {
        throw new SealError('coverage', { detectionId: detection.id, category: detection.category, rect });
      }
    }
  }
  const coverageMs = performance.now() - t;

  // --- 6. mask integrity -----------------------------------------------------------------------
  t = performance.now();
  if (ctx.redactResult) {
    const verification = await verifyMasks(ctx.redactResult);
    if (!verification.ok) {
      throw new SealError('mask-integrity', verification.failures);
    }
  }
  // Every mark drawn on the image must be an EID the server is actually receiving. A tag naming
  // anything else would be either an unactionable instruction or a channel for text we never
  // checked (AGENTS.md invariant 12; Stage 3A Part B).
  if (ctx.redactResult && draft.image !== undefined) {
    const outboundEids = new Set(draft.elements.map((el) => el.eid));
    for (const label of ctx.redactResult.image.somLabels) {
      if (!SOM_LABEL_PATTERN.test(label.eid)) {
        throw new SealError('som-label', { label: label.eid, reason: 'not an EID' });
      }
      if (!outboundEids.has(label.eid)) {
        throw new SealError('som-label', { label: label.eid, reason: 'not an outbound element' });
      }
    }
  }
  const maskIntegrityMs = performance.now() - t;

  // --- 7. capture_id consistency and image count -----------------------------------------------
  if (ctx.redactResult && ctx.redactResult.image.capture_id !== draft.capture_id) {
    throw new SealError('capture-id-mismatch', { draft: draft.capture_id, image: ctx.redactResult.image.capture_id });
  }
  if (draft.image !== undefined && !ctx.redactResult) {
    throw new SealError('image-count', { reason: 'draft has an image but no redaction result to verify it' });
  }

  // --- 8. canonical serialization, digest, registry --------------------------------------------
  t = performance.now();
  const canonical = canonicalize(draft);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await sha256Hex(bytes);
  const serializeMs = performance.now() - t;

  const payload = {
    bytes,
    digest,
    capture_id: draft.capture_id,
    state_token: draft.state_token,
    size: bytes.byteLength,
  } as SanitizedPayload;

  registerSealed(payload);

  return {
    payload,
    timings: {
      schemaMs,
      ruleScanMs,
      leakCheckMs,
      tokenCheckMs,
      coverageMs,
      maskIntegrityMs,
      serializeMs,
      totalMs: performance.now() - totalStart,
    },
  };
}
