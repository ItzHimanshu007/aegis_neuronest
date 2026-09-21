import type { Observation } from '../observe/types';
import { runDetectionCascade } from '../privacy/detect';

/**
 * Stage 4 Part D — eval-mode replay scoring.
 *
 * Recomputes detection accuracy from a RECORDED run, with no browser and no model call. This is
 * the regression tracker for the detection cascade: when a future stage changes a rule, the
 * replay test moves and says by how much, without a 60-minute Playwright run.
 *
 * WHAT IT COVERS
 *   - the detection cascade itself (rules, checksums, field context, merge), re-run over the
 *     recorded `Observation` via the real `runDetectionCascade`;
 *   - precision/recall arithmetic against the recorded ground truth.
 *
 * WHAT IT DOES NOT COVER — the observation is frozen input, so a regression in any of these is
 * invisible here and still needs the Playwright run:
 *   - capture, DOM harvesting, visibility, bbox geometry, EID assignment;
 *   - span-rect resolution (`applySpanRects`) and mask coverage;
 *   - screenshot cropping and the face detector — replay bundles carry no pixels by design;
 *   - the executor, the Authority Gate, and `verify()`.
 *
 * SAFETY. Bundles are written only for `eval/page_factory` synthetic pages and carry
 * `synthetic: true`; `loadBundle` refuses anything else. An `Observation` contains raw page text,
 * so pointing this at a real page would put real page content on disk — which invariant 1 forbids.
 */

export interface ReplayObservationBundle {
  schema: 'aegis-eval-replay-observation/1';
  synthetic: true;
  page: string;
  template: string;
  observation: Observation;
  detections: Array<{ category: string; targetKind: string; targetRef: string }>;
}

export interface ReplayScoreBundle {
  schema: 'aegis-eval-replay/1';
  synthetic: true;
  truth: Array<{ category: string; value: string }>;
  hits: Array<{ index: number; categories: string[] }>;
  overall: { tp: number; fp: number; fn: number; precision: string; recall: string };
  perCategory: Record<string, { tp: number; fp: number; fn: number; precision: string; recall: string }>;
}

export class NotSyntheticError extends Error {
  constructor(page: string) {
    super(
      `Refusing to replay ${page}: bundle is not marked synthetic. Eval replay is only ever ` +
        'pointed at eval/page_factory output — an Observation carries raw page text.',
    );
    this.name = 'NotSyntheticError';
  }
}

export function assertSynthetic(bundle: { synthetic?: boolean; page?: string }): void {
  if (bundle.synthetic !== true) throw new NotSyntheticError(bundle.page ?? '<unknown>');
}

/** Category multiset of a detection list, sorted — the comparison unit for cascade drift. */
export function categoryMultiset(detections: Array<{ category: string }>): string[] {
  return detections.map((d) => d.category).sort();
}

/** Re-runs the real cascade over a recorded observation. No browser, no network, no model. */
export async function replayDetections(bundle: ReplayObservationBundle): Promise<string[]> {
  assertSynthetic(bundle);
  const result = await runDetectionCascade({ observation: bundle.observation });
  return categoryMultiset(result.detections);
}

/** Recomputes precision/recall from recorded ground truth and recorded hits. */
export function rescore(bundle: ReplayScoreBundle, category?: string) {
  assertSynthetic(bundle);
  const hits = new Map(bundle.hits.map((h) => [h.index, new Set(h.categories)]));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  bundle.truth.forEach((g, i) => {
    if (g.category !== 'NONE' && (!category || g.category === category) && !hits.get(i)?.has(g.category)) fn++;
    for (const detected of hits.get(i) ?? []) {
      if (category && detected !== category) continue;
      if (detected === g.category) tp++;
      else fp++;
    }
  });
  return {
    tp,
    fp,
    fn,
    precision: tp + fp ? (tp / (tp + fp)).toFixed(3) : '—',
    recall: tp + fn ? (tp / (tp + fn)).toFixed(3) : '—',
  };
}

/** False-success rate over recorded impossible-task runs. Exact counts; N is never hidden. */
export interface RecordedRun {
  taskId: string;
  kind: 'impossible' | 'possible';
  impossibility: string | null;
  falseSuccess: boolean;
}

export function falseSuccessRate(runs: RecordedRun[]): {
  n: number;
  falseSuccesses: number;
  rate: string;
  byCategory: Record<string, { n: number; falseSuccesses: number }>;
} {
  const impossible = runs.filter((r) => r.kind === 'impossible');
  const byCategory: Record<string, { n: number; falseSuccesses: number }> = {};
  for (const run of impossible) {
    const key = run.impossibility ?? 'unspecified';
    byCategory[key] ??= { n: 0, falseSuccesses: 0 };
    byCategory[key].n++;
    if (run.falseSuccess) byCategory[key].falseSuccesses++;
  }
  const falseSuccesses = impossible.filter((r) => r.falseSuccess).length;
  return {
    n: impossible.length,
    falseSuccesses,
    // Exact counts are authoritative. A rounded percentage can hide a single miss, which is
    // exactly the failure this number exists to surface.
    rate: impossible.length ? `${falseSuccesses}/${impossible.length}` : '—',
    byCategory,
  };
}
