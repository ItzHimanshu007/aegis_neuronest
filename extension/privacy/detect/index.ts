import { EIDRegistry } from '../../scene/registry';
/**
 * The detection cascade (Stage 2 Part C). Runs the layers cheapest-first over one Observation:
 *
 *   1. privacy tags (tags.ts)            — the site's own "this is sensitive" markers
 *   2. autocomplete tokens (autocomplete.ts)
 *   3. rules + checksums (rules/)        — over element values, text blocks, title, URL, task
 *   4. field context (fieldContext.ts)   — label/name/key-value/nearest-label -> category
 *   5. unscanned media (unscannedMedia.ts) — fail-closed default until Stage 6 vision
 *   6. hooks (hooks.ts)                  — visual/NER/OCR, all `[]` until Stages 6/7
 *   7. merge (merge.ts)                  — overlapping detections on one target collapse
 *
 * Deliberately synchronous and pure for layers 1-5: text-span detections come back with
 * `rects: []` plus a matching entry in `spanLookups`, which the caller resolves in ONE batched
 * SPAN_RECTS message (Part C.7's "one batched call per capture") via `applySpanRects` below. That
 * split keeps those layers unit-testable without any browser messaging.
 *
 * The one exception is `visualDetect` (layer 6, Stage 5A): local vision inference is
 * unavoidably async (ONNX Runtime Web's `session.run` and the canvas crop it needs both are), so
 * the cascade itself is `async` and awaits it — every other layer is still synchronous underneath.
 */

import { findKnownValues, type KnownDetectionValue } from './knownValues';
import { classifyFill } from './fillState';
import { detectFromTags, GENERIC_PRIVACY_ATTRS } from './tags';
import { detectFromAutocomplete } from './autocomplete';
import { detectUnscannedMedia } from './unscannedMedia';
import { nerDetect, ocrDetect, visualDetect } from './hooks';
import { findNearestLabelCategory, getElementFieldContext, getKeyValueKeyContext, pairDtDd } from './fieldContext';
import { mergeDetections, type MergedDetection } from './merge';
import { runRules } from './rules';
import { markLocalOnlyValue, type Detection } from './types';
import type { Category } from '../categoryTypes';
import type { Observation } from '../../observe/types';

export interface SpanLookupRequest {
  detectionId: string;
  blockRef: string;
  start: number;
  end: number;
}

export interface CascadeResult {
  detections: MergedDetection[];
  spanLookups: SpanLookupRequest[];
}

export interface CascadeInput {
  observation: Observation;
  /** The user's task text, scanned for PII the same way page content is (Part F.1 tokenizes it
   * with `source: 'task'`). */
  task?: string;
  registry?: EIDRegistry;
  knownValues?: KnownDetectionValue[];
}

export async function runDetectionCascade(input: CascadeInput): Promise<CascadeResult> {
  const { observation, task } = input;
  const registry = input.registry ?? new EIDRegistry();
  registry.reconcile(observation);
  const captureId = observation.capture_id;
  let counter = 0;
  const idFor = (suffix: string) => `${captureId}-${counter++}-${suffix}`;

  const raw: Detection[] = [];
  const spanLookups: SpanLookupRequest[] = [];

  // --- 1/2/3/4: per-element -------------------------------------------------------------------
  for (const el of observation.elements) {
    // Empty fields contribute Scene Graph hints, never masks or vault values.
    if (!el.hasValue) continue;
    const eid = registry.identity(el).eid;
    raw.push(...detectFromTags(el, captureId, idFor, eid));
    raw.push(...detectFromAutocomplete(el, captureId, idFor, eid));

    const fieldCategory = getElementFieldContext(el);
    if (fieldCategory) {
      raw.push({
        id: idFor('field-context'),
        capture_id: captureId,
        source: 'field_context',
        category: fieldCategory,
        // A label alone is a hint, not proof — but it applies even to an EMPTY field, which is
        // exactly what later stages need for re-hydration checks.
        confidence: 0.7,
        target: { kind: 'element', ref: eid },
        rects: [el.bbox],
        rawValue: el.value !== undefined ? markLocalOnlyValue(el.value) : undefined,
      });
    }

    // Rules over the element's own value (absent entirely for secret fields — see Part A1).
    if (el.value) {
      for (const match of [...runRules(el.value, { fieldCategory }).map(m => ({ ...m, known: false })), ...findKnownValues(el.value, input.knownValues ?? []).map(m => ({ ...m, confidence: 1, known: true }))]) {
        raw.push({
          id: idFor(`rule-${match.category}`),
          capture_id: captureId,
          source: match.known ? 'vault' : 'rule',
          category: match.category,
          confidence: match.confidence,
          target: { kind: 'element', ref: eid },
          span: { start: match.start, end: match.start + match.matchedText.length },
          rawValue: markLocalOnlyValue(match.matchedText),
          // An input's value occupies the whole control visually — masking the element's box is
          // both correct and simpler than trying to find the sub-rect of a substring inside a
          // rendered <input>, whose internal text layout the DOM does not expose.
          rects: [el.bbox],
        });
      }
    }
  }

  // --- 3/4: text blocks -----------------------------------------------------------------------
  const dtDdContext = pairDtDd(observation.textBlocks);
  for (const block of observation.textBlocks) {
    const keyValue = getKeyValueKeyContext(block.text);
    const blockCategory: Category | undefined =
      keyValue?.category ?? dtDdContext.get(block.blockRef) ?? findNearestLabelCategory(block.bbox, observation.textBlocks);

    for (const match of [...runRules(block.text, { fieldCategory: blockCategory }).map(m => ({ ...m, known: false })), ...findKnownValues(block.text, input.knownValues ?? []).map(m => ({ ...m, confidence: 1, known: true }))]) {
      const id = idFor(`rule-${match.category}`);
      const start = match.start;
      const end = match.start + match.matchedText.length;
      raw.push({
        id,
        capture_id: captureId,
        source: match.known ? 'vault' : 'rule',
        category: match.category,
        confidence: match.confidence,
        target: { kind: 'text_span', ref: block.blockRef },
        span: { start, end },
        rawValue: markLocalOnlyValue(match.matchedText),
        rects: [], // filled by applySpanRects() after the batched SPAN_RECTS call
      });
      spanLookups.push({ detectionId: id, blockRef: block.blockRef, start, end });
    }

    // A labelled value that matched no rule is still sensitive, because the LABEL says so:
    // "Employer: Acme Industries" and a <dt>Blood group</dt><dd>O positive</dd> pair both name
    // their own category, and no regex will ever match the value. Two sources of that label:
    // a "Key: value" prefix inside the block, and a term/definition or row-header/cell pairing
    // with the block before it. A nearest-label *spatial* guess is deliberately NOT enough here —
    // it feeds the rules as context, but on its own it would redact half the page.
    const labelled = keyValue
      ? { category: keyValue.category, valueStart: keyValue.valueStart }
      : dtDdContext.has(block.blockRef)
        ? { category: dtDdContext.get(block.blockRef)!, valueStart: 0 }
        : undefined;

    if (labelled) {
      const valueText = block.text.slice(labelled.valueStart);
      const alreadyCovered = raw.some(
        (d) => d.target.kind === 'text_span' && d.target.ref === block.blockRef && d.span && d.span.start >= labelled.valueStart,
      );
      if (!alreadyCovered && valueText.trim().length > 0) {
        const id = idFor('field-context-value');
        raw.push({
          id,
          capture_id: captureId,
          source: 'field_context',
          category: labelled.category,
          confidence: 0.65,
          target: { kind: 'text_span', ref: block.blockRef },
          span: { start: labelled.valueStart, end: block.text.length },
          rawValue: markLocalOnlyValue(valueText),
          rects: [],
        });
        spanLookups.push({ detectionId: id, blockRef: block.blockRef, start: labelled.valueStart, end: block.text.length });
      }
    }

    // The site's own privacy markers (`data-private`, `rr-mask`, ...) on a block or any ancestor.
    // They say "sensitive" without saying what, so merge.ts upgrades the category if anything
    // more specific lands on the same block.
    if (block.privacyAttrs.some((attr) => GENERIC_PRIVACY_ATTRS.has(attr))) {
      raw.push({
        id: idFor('tag-generic-block'),
        capture_id: captureId,
        source: 'tag',
        category: 'PRIVATE_GENERIC',
        confidence: 0.5,
        target: { kind: 'text_span', ref: block.blockRef },
        rawValue: markLocalOnlyValue(block.text),
        rects: [block.bbox],
      });
    }
  }

  // --- 3: side channels (url/title) and the task ----------------------------------------------
  for (const [ref, text] of [
    ['url', observation.url],
    ['title', observation.title],
  ] as const) {
    for (const match of runRules(text, {})) {
      raw.push({
        id: idFor(`side-${ref}`),
        capture_id: captureId,
        source: 'rule',
        category: match.category,
        confidence: match.confidence,
        target: { kind: 'side_channel', ref },
        span: { start: match.start, end: match.start + match.matchedText.length },
        rawValue: markLocalOnlyValue(match.matchedText),
        rects: [], // side channels have no on-screen geometry of their own
      });
    }
  }

  if (task) {
    for (const match of runRules(task, {})) {
      raw.push({
        id: idFor('task'),
        capture_id: captureId,
        source: 'rule',
        category: match.category,
        confidence: match.confidence,
        target: { kind: 'task', ref: 'task' },
        span: { start: match.start, end: match.start + match.matchedText.length },
        rawValue: markLocalOnlyValue(match.matchedText),
        rects: [],
      });
    }
  }

  // --- 5/6: media and later-stage hooks -------------------------------------------------------
  raw.push(...detectUnscannedMedia(observation.media, captureId, idFor));
  raw.push(...(await visualDetect(observation, captureId)));
  raw.push(...nerDetect(observation, captureId));
  raw.push(...ocrDetect(observation, captureId));

  // --- 7: merge -------------------------------------------------------------------------------
  const detections = mergeDetections(raw).map(d => {
    const el = d.target.kind === 'element' ? observation.elements.find(e => registry.identity(e).eid === d.target.ref) : undefined;
    return el ? { ...d, fill: classifyFill(el, d.category) } : d;
  });
  return { detections, spanLookups };
}

export interface SpanRectsResponse {
  stale: boolean;
  results?: Array<{ blockRef: string; rects: Array<{ x: number; y: number; width: number; height: number }>; notFound?: boolean }>;
}

/**
 * Applies the result of ONE batched SPAN_RECTS call back onto the detections that needed rects.
 *
 * Fail-closed (Stage 2 Part A3): if the page reported STALE — or a specific block couldn't be
 * found — the affected detections fall back to masking the WHOLE text block rather than a
 * substring, and the reason is recorded so the Privacy Preview can show it.
 */
export function applySpanRects(
  detections: MergedDetection[],
  spanLookups: SpanLookupRequest[],
  response: SpanRectsResponse,
  blockBboxes: Map<string, { x: number; y: number; width: number; height: number }>,
): { detections: MergedDetection[]; fallbacks: Array<{ detectionId: string; reason: string }> } {
  const fallbacks: Array<{ detectionId: string; reason: string }> = [];
  const lookupByDetection = new Map(spanLookups.map((l) => [l.detectionId, l]));
  const rectsByBlock = new Map((response.results ?? []).map((r) => [r.blockRef, r]));

  const updated = detections.map((detection) => {
    const lookup = lookupByDetection.get(detection.id);
    if (!lookup) return detection;

    const wholeBlockRect = blockBboxes.get(lookup.blockRef);
    const fallbackToWholeBlock = (reason: string) => {
      fallbacks.push({ detectionId: detection.id, reason });
      return { ...detection, rects: wholeBlockRect ? [wholeBlockRect] : detection.rects };
    };

    if (response.stale) return fallbackToWholeBlock('stale-capture');

    const result = rectsByBlock.get(lookup.blockRef);
    if (!result || result.notFound) return fallbackToWholeBlock('block-not-found');
    if (result.rects.length === 0) return fallbackToWholeBlock('no-rects-returned');

    return { ...detection, rects: result.rects };
  });

  return { detections: updated, fallbacks };
}
