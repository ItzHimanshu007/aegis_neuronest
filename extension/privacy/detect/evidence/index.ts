/**
 * Stage 7 — the evidence layer, run as cascade layer 4.5.
 *
 * Placed AFTER the rule and field-context layers and BEFORE merge, for one reason: it must not be
 * able to weaken anything that already worked. Every pre-Stage-7 detection is produced exactly as
 * before and enters merge.ts exactly as before; this layer only ever ADDS candidates, and
 * merge.ts's existing risk ordering decides what wins when two layers land on the same target.
 * Stage 4 measured checksum recall at 1.000 and shape recall at 0.974 — those paths are untouched.
 *
 * Fail-closed, in the specific sense Stage 7J asks for: a candidate that scores between the two
 * thresholds is emitted with `certainty: 'uncertain'`, which policy turns into a mask rather than
 * a token. Low confidence never means "send it and hope"; it means "hide it without claiming to
 * know what it is".
 */

import { bindingAt, findInlineKeyValues } from './binder';
import { isEvidenceLayerEnabled } from './flag';
import { scoreCandidate } from './score';
import { findShapes } from './shapes';
import { contextForElement, contextForTextBlock } from './structure';
import { markLocalOnlyValue, type Detection } from '../types';
import type { EIDRegistry } from '../../../scene/registry';
import type { Observation, RawElement } from '../../../observe/types';
import type { CandidateContext, ShapeHint } from './types';

export interface EvidenceLayerInput {
  observation: Observation;
  captureId: string;
  idFor: (suffix: string) => string;
  registry: EIDRegistry;
  /** True when an identity category has already been seen on this origin during this task. */
  identitySeenOnOrigin?: boolean;
  /** Overrides AEGIS_CONFIG.EVIDENCE_LAYER_ENABLED for this call — see CascadeInput. */
  enabled?: boolean;
}

export interface EvidenceSpanLookup {
  detectionId: string;
  blockRef: string;
  start: number;
  end: number;
}

export interface EvidenceLayerResult {
  detections: Detection[];
  spanLookups: EvidenceSpanLookup[];
  /** Stage 7M/7O counters. Local measurement only; never sent. */
  stats: { candidates: number; detected: number; uncertain: number; ms: number };
}

/** Normalized form used only to count repeats within one capture (negative evidence). */
function normalizeForRepeat(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * Counts how many distinct targets carry each value in this capture. A price repeated down a
 * product table is furniture; the same shape appearing once beside an account number is not.
 */
function buildRepeatIndex(observation: Observation): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const record = (targetKey: string, text: string) => {
    for (const shape of findShapes(text)) {
      const key = normalizeForRepeat(shape.matchedText);
      const pair = `${key}@${targetKey}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  };
  observation.elements.forEach((el, i) => el.value && record(`e${i}`, el.value));
  observation.textBlocks.forEach((block) => record(`b${block.blockRef}`, block.text));
  return counts;
}

export function runEvidenceLayer(input: EvidenceLayerInput): EvidenceLayerResult {
  const started = performance.now();
  const empty: EvidenceLayerResult = { detections: [], spanLookups: [], stats: { candidates: 0, detected: 0, uncertain: 0, ms: 0 } };
  if (!(input.enabled ?? isEvidenceLayerEnabled())) return empty;

  const { observation, captureId, idFor, registry, identitySeenOnOrigin } = input;
  const detections: Detection[] = [];
  const spanLookups: EvidenceSpanLookup[] = [];
  const repeats = buildRepeatIndex(observation);
  let candidates = 0;
  let detected = 0;
  let uncertain = 0;

  const judge = (shape: ShapeHint, context: CandidateContext) => {
    candidates += 1;
    return scoreCandidate({
      value: shape.matchedText,
      shape,
      context: { ...context, repeatCount: repeats.get(normalizeForRepeat(shape.matchedText)), identitySeenOnOrigin },
    });
  };

  const emit = (verdictCategory: ReturnType<typeof scoreCandidate>) => {
    if (verdictCategory.verdict === 'DETECTED') detected += 1;
    else uncertain += 1;
  };

  // --- elements -------------------------------------------------------------------------------
  for (const el of observation.elements as RawElement[]) {
    if (!el.hasValue || !el.value) continue;
    const eid = registry.identity(el).eid;
    for (const shape of findShapes(el.value)) {
      const result = judge(shape, contextForElement(el, shape));
      if (result.verdict === 'NOT_DETECTED') continue;
      emit(result);
      detections.push({
        id: idFor(`evidence-${result.category}`),
        capture_id: captureId,
        source: 'evidence',
        category: result.category,
        confidence: result.confidence,
        certainty: result.verdict === 'UNCERTAIN' ? 'uncertain' : 'detected',
        evidence: result.signals.map((signal) => signal.name),
        target: { kind: 'element', ref: eid },
        span: { start: shape.start, end: shape.start + shape.matchedText.length },
        rawValue: markLocalOnlyValue(shape.matchedText),
        // An input's value occupies the whole control visually — same reasoning as the rule layer.
        rects: [el.bbox],
      });
    }
  }

  // --- text blocks ----------------------------------------------------------------------------
  for (const block of observation.textBlocks) {
    const bindings = findInlineKeyValues(block.text);
    for (const shape of findShapes(block.text)) {
      const binding = bindingAt(bindings, shape.start);
      const result = judge(shape, contextForTextBlock(block, { boundLabelCategory: binding?.category }));
      if (result.verdict === 'NOT_DETECTED') continue;
      emit(result);
      const id = idFor(`evidence-${result.category}`);
      const start = shape.start;
      const end = shape.start + shape.matchedText.length;
      detections.push({
        id,
        capture_id: captureId,
        source: 'evidence',
        category: result.category,
        confidence: result.confidence,
        certainty: result.verdict === 'UNCERTAIN' ? 'uncertain' : 'detected',
        evidence: result.signals.map((signal) => signal.name),
        target: { kind: 'text_span', ref: block.blockRef },
        span: { start, end },
        rawValue: markLocalOnlyValue(shape.matchedText),
        rects: [], // filled by applySpanRects() after the batched SPAN_RECTS call
      });
      spanLookups.push({ detectionId: id, blockRef: block.blockRef, start, end });
    }
  }

  return { detections, spanLookups, stats: { candidates, detected, uncertain, ms: performance.now() - started } };
}

export { findInlineKeyValues, bindingAt } from './binder';
export { findShapes } from './shapes';
export { isEvidenceLayerEnabled, setEvidenceLayerEnabled, withEvidenceLayer } from './flag';
export { scoreCandidate, verdictFor } from './score';
export * from './types';
