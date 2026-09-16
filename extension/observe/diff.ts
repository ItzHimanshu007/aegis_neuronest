/**
 * Diffs two consecutive harvests' elements to produce the change-detector inputs (Stage 1 Part
 * D.5): "weighted count of visible elements added or removed" and the mark-ratio numerator. Each
 * changed mark is weighted 1 (a simplification over a more elaborate size/role-based weighting —
 * documented in the Stage 1 report).
 *
 * Elements are matched by `fp` + `fpOrdinal` (the same identity `expect` checks will use in later
 * stages) rather than `mark_id`, because `mark_id` is reassigned every capture and isn't stable
 * across observations on its own.
 */

import type { RawElement } from './types';

export interface MutationDiffResult {
  mutationScore: number;
  changedMarkCount: number;
  previousMarkCount: number;
}

function markKey(el: Pick<RawElement, 'fp' | 'fpOrdinal'>): string {
  return `${el.fp}:${el.fpOrdinal}`;
}

export function computeMutationDiff(previous: RawElement[] | null, current: RawElement[]): MutationDiffResult {
  const currVisible = current.filter((e) => e.visible);
  if (!previous) {
    return { mutationScore: currVisible.length, changedMarkCount: 0, previousMarkCount: 0 };
  }
  const prevVisible = previous.filter((e) => e.visible);
  const prevKeys = new Set(prevVisible.map(markKey));
  const currKeys = new Set(currVisible.map(markKey));

  let added = 0;
  for (const k of currKeys) if (!prevKeys.has(k)) added++;
  let removed = 0;
  for (const k of prevKeys) if (!currKeys.has(k)) removed++;

  const mutationScore = added + removed;
  return { mutationScore, changedMarkCount: mutationScore, previousMarkCount: prevKeys.size };
}
