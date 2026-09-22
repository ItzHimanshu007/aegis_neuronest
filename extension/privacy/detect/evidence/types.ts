/**
 * Stage 7 evidence layer — shared types.
 *
 * The layer answers a different question from the rest of the cascade. Layers 1-4 ask "does a
 * label, tag or self-describing pattern name this value's category?". This layer asks "what does
 * the value itself, and the structure around it, say — with no label required?", and it answers
 * with a SCORE rather than a verdict, so that a weak answer can be handled as weak (UNCERTAIN)
 * instead of being rounded up to a claim or down to nothing.
 *
 * Nothing here is sent anywhere. `Candidate.value` is the raw page string; it lives only long
 * enough to be scored, and only the resulting `Detection` (whose `rawValue` is already branded
 * LocalOnly by the cascade) survives.
 */

import type { Category } from '../../categoryTypes';

/** Every signal the scorer understands. String-named so `Detection.evidence` is readable in the
 * panel (Stage 7H) without a second lookup table, and so a test can assert on exact reasoning. */
export type SignalName =
  // positive
  | 'checksum_pass'
  | 'self_describing_shape'
  | 'structured_shape'
  | 'inline_label_bound'
  | 'autocomplete_match'
  | 'input_semantics'
  | 'length_constraint_match'
  | 'container_label'
  | 'weak_shape'
  | 'page_context'
  // negative
  | 'checksum_fail_definitional'
  | 'non_pii_container'
  | 'non_pii_shape'
  | 'repeated_across_page'
  | 'in_search_scope'
  | 'generic_username_shape';

export interface EvidenceSignal {
  name: SignalName;
  /** Signed points. The scorer owns the value; a signal never carries its own weight so that the
   * whole point table is readable in one place (evidence/score.ts). */
  points: number;
}

/** How strong a value's intrinsic shape is on its own, before any structure is considered. */
export type ShapeStrength = 'self_describing' | 'structured' | 'weak';

export interface ShapeHint {
  category: Category;
  strength: ShapeStrength;
  /** Offset of the matched substring within the text the matcher was given. */
  start: number;
  matchedText: string;
  /**
   * For shapes whose checksum is definitional (Aadhaar/Verhoeff, card/Luhn): whether it passed.
   * `undefined` means the shape has no checksum to check, which is NOT the same as failing — a
   * 6-digit PIN code has no check digit and must not be penalised for it.
   */
  checksum?: 'pass' | 'fail';
}

/** Structural facts about a candidate's surroundings, already extracted from the DOM by
 * structure.ts / binder.ts. Deliberately a flat value object: the scorer must be a pure function
 * of this, so scoring is unit-testable with no Observation and no browser. */
export interface CandidateContext {
  /** Category implied by an `autocomplete` token on the candidate's element, if any. */
  autocompleteCategory?: Category;
  /** The element's `type` attribute (`email`, `tel`, `number`, `date`, `password`, ...). */
  inputType?: string;
  /** Category implied by a bound inline label (binder.ts) — a real dictionary phrase, bound to
   * THIS value rather than to the block it happens to sit in. */
  boundLabelCategory?: Category;
  /** Category implied by an enclosing container: a <fieldset><legend>, a <th scope=col>, or the
   * nearest section heading. Weaker than a bound label, stronger than nothing. */
  containerCategory?: Category;
  /** True when maxlength/minlength/pattern are consistent with the proposed shape. */
  lengthConstraintAgrees?: boolean;
  /** The container text that negative evidence is judged against (heading/legend/header). */
  containerText?: string;
  /** The element is a search box, or sits inside <search>/[role=search]. */
  inSearchScope?: boolean;
  /** How many distinct targets in this capture carry this same normalized value. */
  repeatCount?: number;
  /** An identity category has already been seen on this origin during this task. */
  identitySeenOnOrigin?: boolean;
}

export interface Candidate {
  /** The exact substring being judged. */
  value: string;
  shape: ShapeHint;
  context: CandidateContext;
}

export type Verdict = 'DETECTED' | 'UNCERTAIN' | 'NOT_DETECTED';

export interface EvidenceVerdict {
  verdict: Verdict;
  category: Category;
  score: number;
  signals: EvidenceSignal[];
  /** 0..1, derived from `score` purely so the rest of the pipeline (merge, IDENTITY_MIN_CONF,
   * the panel) keeps working on one scale. Never used to make the DETECTED/UNCERTAIN decision —
   * that is the integer score's job, so the threshold stays readable. */
  confidence: number;
}
