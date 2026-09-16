/**
 * Screen-change detector (Stage 1 Part D.5). Decides NEW_SCREEN vs SAME_SCREEN between two
 * consecutive observations of the same tab. A pure function over small summaries of each
 * observation (not the full Observation) so it's cheap to call and easy to unit test.
 */

import { AEGIS_CONFIG } from '../shared/config';
import { computeDHash, hammingDistance, type GrayscaleImage } from './dhash';

export type ChangeDecision = 'NEW_SCREEN' | 'SAME_SCREEN';

export type ChangeReason =
  | 'first-observation'
  | 'url-path-change'
  | 'dialog-appeared'
  | 'dialog-disappeared'
  | 'mutation-score'
  | 'mark-ratio'
  | 'scroll-displacement'
  | 'perceptual-hash'
  | 'no-change';

export interface ChangeResult {
  decision: ChangeDecision;
  reason: ChangeReason;
  detail?: Record<string, number | string | boolean>;
}

/** The minimal per-observation summary the detector needs. Deliberately doesn't take a full
 * Observation so this module has zero dependency on observe/types.ts and stays trivially
 * testable. */
export interface ChangeSnapshot {
  urlPath: string;
  urlHash: string;
  dialogOpen: boolean;
  /** Weighted count of visible marks added/removed since the previous observation. */
  mutationScore: number;
  /** Total marks in the previous observation (for the ratio check). */
  previousMarkCount: number;
  /** How many of those marks are no longer present, or are new, in this observation. */
  changedMarkCount: number;
  scrollY: number;
  viewportHeight: number;
  dhashInput?: GrayscaleImage;
}

export function decideScreenChange(
  previous: ChangeSnapshot | null,
  current: ChangeSnapshot,
  config = AEGIS_CONFIG,
): ChangeResult {
  if (!previous) {
    return { decision: 'NEW_SCREEN', reason: 'first-observation' };
  }

  if (previous.urlPath !== current.urlPath || previous.urlHash !== current.urlHash) {
    return {
      decision: 'NEW_SCREEN',
      reason: 'url-path-change',
      detail: { from: previous.urlPath + previous.urlHash, to: current.urlPath + current.urlHash },
    };
  }

  if (!previous.dialogOpen && current.dialogOpen) {
    return { decision: 'NEW_SCREEN', reason: 'dialog-appeared' };
  }
  if (previous.dialogOpen && !current.dialogOpen) {
    return { decision: 'NEW_SCREEN', reason: 'dialog-disappeared' };
  }

  if (current.mutationScore >= config.CHANGE_MUTATION_SCORE) {
    return {
      decision: 'NEW_SCREEN',
      reason: 'mutation-score',
      detail: { mutationScore: current.mutationScore, threshold: config.CHANGE_MUTATION_SCORE },
    };
  }

  const markRatio = previous.previousMarkCount > 0 ? current.changedMarkCount / previous.previousMarkCount : 0;
  if (markRatio >= config.CHANGE_MARK_RATIO) {
    return {
      decision: 'NEW_SCREEN',
      reason: 'mark-ratio',
      detail: { markRatio, threshold: config.CHANGE_MARK_RATIO },
    };
  }

  const scrollDelta = Math.abs(current.scrollY - previous.scrollY);
  const scrollRatio = current.viewportHeight > 0 ? scrollDelta / current.viewportHeight : 0;
  if (scrollRatio >= config.CHANGE_SCROLL_RATIO) {
    return {
      decision: 'NEW_SCREEN',
      reason: 'scroll-displacement',
      detail: { scrollRatio, threshold: config.CHANGE_SCROLL_RATIO },
    };
  }

  // Secondary check: the primary rules say SAME_SCREEN, but there was still meaningful mutation
  // activity — fall back to a perceptual diff of the screenshots rather than trusting the DOM
  // signal alone.
  if (current.mutationScore >= config.CHANGE_AMBIGUOUS_SCORE && previous.dhashInput && current.dhashInput) {
    const prevHash = computeDHash(previous.dhashInput);
    const currHash = computeDHash(current.dhashInput);
    const distance = hammingDistance(prevHash, currHash);
    if (distance > config.CHANGE_DHASH_BITS) {
      return {
        decision: 'NEW_SCREEN',
        reason: 'perceptual-hash',
        detail: { distance, threshold: config.CHANGE_DHASH_BITS },
      };
    }
  }

  return { decision: 'SAME_SCREEN', reason: 'no-change' };
}
