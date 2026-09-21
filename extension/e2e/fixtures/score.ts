import type { Page } from '@playwright/test';
import type { ObserveResult } from '../../shared/messages';
import type { ProcessResult } from '../../agentHost';

/**
 * Shared TP/FP/FN scoring for the detection-accuracy evals.
 *
 * Lifted VERBATIM out of `baseline.spec.ts` in Stage 4 so that the authored-page baseline and the
 * held-out run score through byte-identical code. If the two evals scored through separate copies,
 * the authored-vs-held-out delta in `eval/reports/stage4-heldout.md` would partly measure the
 * difference between the two scorers rather than generalization, which is the one thing that
 * comparison must not do.
 *
 * The matching rule is unchanged and is restated in both reports:
 *   target EID geometry for fields/media; block geometry plus exact normalized span/value
 *   containment for text; each (annotation index, category) counted once across captures; a wrong
 *   category is both an FP for that category and an FN for the expected one; detections outside
 *   annotated regions are excluded.
 */

export interface GroundTruthItem {
  category: string;
  value: string;
}

export interface Annotation {
  index: number;
  value: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface Metric {
  tp: number;
  fp: number;
  fn: number;
  precision: string;
  recall: string;
}

/** Per-annotation-index set of categories detected on it, accumulated across captures. */
export type HitMap = Map<number, Set<string>>;

/**
 * Reads the `[data-gt]` annotations with their current viewport geometry.
 *
 * Must stay in the same document order as `readGroundTruth()` in `sanitize.ts`: the two are joined
 * by array index, so any reordering or lazily-injected annotated node between the two calls would
 * silently mis-score every row after it.
 */
export async function readAnnotations(targetPage: Page): Promise<Annotation[]> {
  return targetPage.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-gt]')).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        value: el instanceof HTMLInputElement ? el.value : (el.textContent ?? '').trim(),
        bbox: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    }),
  );
}

/**
 * Joins detections to annotations INSIDE THE PANEL DOCUMENT only. What crosses back to the test is
 * annotation indices and detection indices — never raw text, screenshots, or a guessed TP count.
 * Geometry is what separates repeated values.
 */
export async function matchDetections(
  panelPage: Page,
  annotations: Annotation[],
): Promise<Array<{ index: number; detection: number }>> {
  return panelPage.evaluate((gt) => {
    const w = window as unknown as {
      __aegisLastObserveResult: ObserveResult;
      __aegisLastProcessResult: ProcessResult;
    };
    const o = w.__aegisLastObserveResult.observation;
    const r = w.__aegisLastProcessResult;
    const payload = JSON.parse(r.preview.draftJson) as {
      elements: Array<{ eid: string; fp: string; bbox: number[] }>;
    };
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const overlaps = (
      a: { x: number; y: number; width: number; height: number },
      b: typeof a,
    ) =>
      Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
      Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
    return r.preview.detections.flatMap((d, di) => {
      let box;
      let text: string | undefined;
      if (d.targetKind === 'element') {
        const e = payload.elements.find((e) => e.eid === d.targetRef);
        if (e) box = { x: e.bbox[0]!, y: e.bbox[1]!, width: e.bbox[2]!, height: e.bbox[3]! };
      } else if (d.targetKind === 'text_span') {
        const b = o.textBlocks.find((b) => b.blockRef === d.targetRef);
        box = b?.bbox;
        text = b && (d.span ? b.text.slice(d.span.start, d.span.end) : b.text);
      } else if (d.targetKind === 'media') {
        box = o.media[Number(d.targetRef.replace('media-', ''))]?.bbox;
      }
      if (!box) return [];
      return gt
        .filter(
          (g) =>
            g.bbox.y + g.bbox.height > 0 &&
            g.bbox.y < o.viewport.cssH &&
            overlaps(box!, g.bbox) &&
            (text === undefined ||
              (norm(g.value).length > 0 &&
                (norm(text).includes(norm(g.value)) || norm(g.value).includes(norm(text))))),
        )
        .map((g) => ({ index: g.index, detection: di }));
    });
  }, annotations);
}

/** Records one detected category against one annotation index. */
export function addHit(map: HitMap, index: number, category: string): void {
  const set = map.get(index) ?? new Set<string>();
  set.add(category);
  map.set(index, set);
}

/**
 * TP/FP/FN for one category, or overall when `category` is omitted.
 *
 * A wrong category is counted BOTH as a false positive for the category that fired and as a false
 * negative for the one that was expected. Precision and recall are fixed to three decimals, with
 * an em dash for a zero denominator.
 */
export function metric(truth: GroundTruthItem[], map: HitMap, category?: string): Metric {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  truth.forEach((g, i) => {
    if (g.category !== 'NONE' && (!category || g.category === category) && !map.get(i)?.has(g.category)) fn++;
    for (const detected of map.get(i) ?? []) {
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

/** The union of annotated positive categories and any category ever detected on an annotation. */
export function scoredCategories(truth: GroundTruthItem[], hits: HitMap): string[] {
  return [
    ...new Set([
      ...truth.filter((g) => g.category !== 'NONE').map((g) => g.category),
      ...[...hits.values()].flatMap((s) => [...s]),
    ]),
  ].sort();
}

/** One bullet per annotation whose detected set is not exactly the expected category. */
export function errorBullets(truth: GroundTruthItem[], hits: HitMap, label = 'Annotation'): string[] {
  return truth.flatMap((g, i) => {
    const actual = [...(hits.get(i) ?? [])];
    if ((g.category === 'NONE' && !actual.length) || (actual.length === 1 && actual[0] === g.category)) return [];
    return [`- ${label} ${i}: expected ${g.category}; detected ${actual.join(', ') || 'none'}.`];
  });
}

/** Signed delta in percentage points, one decimal, explicit sign. '—' if either side is undefined. */
export function deltaPp(authored: string, heldout: string): string {
  if (authored === '—' || heldout === '—') return '—';
  const d = (Number(heldout) - Number(authored)) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
}
