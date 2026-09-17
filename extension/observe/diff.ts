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

/**
 * The only fields this diff ever needs. Typed narrowly (rather than accepting `RawElement[]`) so
 * that whoever stores a "previous" snapshot for later diffing — entrypoints/background.ts, in
 * particular — is type-checked into keeping only this non-PII projection (fingerprint, ordinal,
 * visibility) rather than retaining full elements with raw names/values across captures. See
 * AGENTS.md invariant 1 and the Stage 2 Part A2 hardening note in background.ts.
 */
export type MarkIdentity = Pick<RawElement, 'fp' | 'fpOrdinal' | 'visible'>;

/** The one sanctioned way to build a MarkIdentity[] from a full elements array — used by
 * background.ts before storing "previous capture" state, so that operation is a single,
 * independently-testable function rather than an inline object literal that could silently grow
 * extra (PII-carrying) fields over time. */
export function toMarkIdentity(elements: RawElement[]): MarkIdentity[] {
  return elements.map((e) => ({ fp: e.fp, fpOrdinal: e.fpOrdinal, visible: e.visible }));
}

function markKey(el: MarkIdentity): string {
  return `${el.fp}:${el.fpOrdinal}`;
}

export function computeMutationDiff(previous: MarkIdentity[] | null, current: MarkIdentity[]): MutationDiffResult {
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
