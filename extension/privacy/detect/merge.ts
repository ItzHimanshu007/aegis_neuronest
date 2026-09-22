/**
 * Merge logic (Stage 2 Part C.7): combines overlapping detections on the same target. "Same
 * target" means the same element/media ref, or the same text block with overlapping character
 * spans. The highest-risk category wins (by policy-class severity, not just confidence — a
 * low-confidence AADHAAR match must still outrank a high-confidence PRIVATE_GENERIC one); all
 * contributing sources are kept on the merged result for the Privacy Preview panel (Part G).
 */

import { CATEGORY_TO_CLASS } from '../policyData';
import type { PolicyClass } from '../categoryTypes';
import type { Detection, DetectionSource } from './types';

/** Most restrictive first. Mirrors docs/policy.yaml's `locked` ordering, with the two unlocked
 * classes appended by how much latitude they give the page ("quasi" being the least sensitive of
 * the PII classes, then non_pii). */
const CLASS_RISK_ORDER: PolicyClass[] = ['never_automated', 'credential', 'high', 'biometric', 'documents', 'medium', 'quasi', 'non_pii'];

function classOf(category: Detection['category']): PolicyClass {
  return CATEGORY_TO_CLASS[category] ?? 'non_pii';
}

function riskRank(category: Detection['category']): number {
  const index = CLASS_RISK_ORDER.indexOf(classOf(category));
  return index === -1 ? CLASS_RISK_ORDER.length : index;
}

export interface MergedDetection extends Detection {
  /** Every source that independently detected this same target, deduplicated. `source` (from the
   * base Detection type) is set to whichever contributing detection had the winning category. */
  sources: DetectionSource[];
}

function targetKey(d: Detection): string {
  if (d.target.kind === 'text_span' && d.span) {
    return `${d.target.kind}:${d.target.ref}`; // grouped further by overlap below, not just key equality
  }
  return `${d.target.kind}:${d.target.ref}`;
}

function spansOverlap(a: Detection, b: Detection): boolean {
  if (!a.span || !b.span) return true; // no span info -> whole-target overlap (element/media)
  return a.span.start < b.span.end && b.span.start < a.span.end;
}

/** Merges a flat list of detections. Detections with different `target.kind`/`target.ref` never
 * merge; among those that share a target, only ones with overlapping spans (or no span at all —
 * i.e. whole-element/media detections) are combined into one group. */
export function mergeDetections(detections: Detection[]): MergedDetection[] {
  const byTarget = new Map<string, Detection[]>();
  for (const d of detections) {
    const key = targetKey(d);
    const list = byTarget.get(key) ?? [];
    list.push(d);
    byTarget.set(key, list);
  }

  const merged: MergedDetection[] = [];
  for (const group of byTarget.values()) {
    // Within a target, cluster by span overlap (so two non-overlapping spans in the same text
    // block — e.g. an email in one sentence and a phone number in the next — stay separate).
    const clusters: Detection[][] = [];
    for (const d of group) {
      const cluster = clusters.find((c) => c.some((existing) => spansOverlap(existing, d)));
      if (cluster) cluster.push(d);
      else clusters.push([d]);
    }

    for (const cluster of clusters) {
      /**
       * Stage 7J. Certainty is decided by the CLUSTER, not by whichever member won the category
       * arbitration below. A cluster is uncertain only when every member of it is uncertain.
       *
       * Getting this backwards would be a real regression: an uncertain evidence candidate
       * overlapping a confident rule hit could win the risk ordering (a low-confidence AADHAAR
       * outranks a confident EMAIL by design) and drag the whole cluster down to `uncertain`,
       * which forces it to the `not_needed` branch and silently stops a value that WAS confidently
       * detected from being tokenized. Confident evidence must always dominate.
       */
      const anyConfident = cluster.some(d => d.certainty !== 'uncertain');
      const certainty: Detection['certainty'] = anyConfident ? 'detected' : 'uncertain';
      // Only confident members may win the category, for the same reason.
      const eligible = anyConfident ? cluster.filter(d => d.certainty !== 'uncertain') : cluster;
      const explicit = eligible.find(d => d.source === 'field_context' && d.category !== 'PRIVATE_GENERIC');
      const secret = eligible.find(d => ['PASSWORD', 'OTP', 'CVV', 'UPI_PIN', 'SECRET'].includes(d.category));
      const winner = secret ?? explicit ?? eligible.reduce((best, current) => (riskRank(current.category) < riskRank(best.category) ? current : best));
      const sources = Array.from(new Set(cluster.map((d) => d.source)));
      // Only the members that could win contribute confidence; an uncertain candidate must not
      // inflate a cluster it was not allowed to name.
      const confidences = eligible.map((d) => d.confidence);
      // Combine confidences as "probability at least one source is right" (1 - product of misses)
      // — multiple independent sources agreeing should never end up LESS confident than the best
      // single source alone.
      const combinedMiss = confidences.reduce((acc, c) => acc * (1 - c), 1);
      const confidence = Math.max(...confidences, 1 - combinedMiss);
      const rects = cluster.flatMap((d) => d.rects);

      // Stage 7H: keep every contributing signal name, deduplicated, for the panel's reasoning.
      const evidence = Array.from(new Set(cluster.flatMap((d) => d.evidence ?? [])));

      merged.push({
        ...winner,
        certainty,
        evidence: evidence.length > 0 ? evidence : undefined,
        confidence: Math.min(1, confidence),
        sources,
        rects,
      });
    }
  }

  return merged;
}
