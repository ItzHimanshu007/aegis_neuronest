/**
 * The detection cascade's output type (Stage 2 Part C). A `Detection` is evidence that a category
 * of PII is present somewhere in the observation — the policy engine (privacy/policy.ts) later
 * turns each one into an action. Nothing here is sent anywhere on its own; `rawValue` is branded
 * `LocalOnly` and only the payload builder (via the vault/redactor) ever consumes it.
 */

import type { LocalOnly } from '../../observe/types';
import type { Category } from '../categoryTypes';

export type DetectionSource = 'tag' | 'autocomplete' | 'rule' | 'field_context' | 'unscanned' | 'vault' | 'visual' | 'ner' | 'ocr' | 'evidence';

/**
 * Stage 7J. How sure the cascade is that this detection is a real instance of its category.
 *
 * `'detected'` is the historical behaviour and the default everywhere: absent means detected, so
 * every pre-Stage-7 source keeps its exact semantics without being touched.
 *
 * `'uncertain'` is emitted only by the evidence layer, for a candidate that cleared
 * EVIDENCE_UNCERTAIN_MIN but not EVIDENCE_DETECT_MIN. It is fail-closed, not permissive: policy
 * forces it to its class's `not_needed` action (a solid mask), it is never tokenized or vaulted,
 * and it never marks an origin identity-seen or counts toward linkability. The value is hidden
 * from the model without the cascade claiming to know what it is.
 */
export type Certainty = 'detected' | 'uncertain';

export type DetectionTargetKind = 'element' | 'text_span' | 'media' | 'side_channel' | 'task';

export interface DetectionTarget {
  kind: DetectionTargetKind;
  /** Meaning depends on `kind`: element `eid`, text block `blockRef`, media `rid`,
   * side_channel `'url' | 'title'`, or `'task'` itself. */
  ref: string;
}

export interface DetectionSpan {
  /** Character offsets into the target's text (element value, or text block's joined text). */
  start: number;
  end: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  capture_id: string;
  source: DetectionSource;
  category: Category;
  /** 0..1. Rule hits with a checksum start high (0.9+); context-only rules and bare field-context
   * matches start lower; merging multiple sources for the same target raises confidence. */
  confidence: number;
  fill?: import('./fillState').FillState;
  /** Stage 7J. Absent means `'detected'` — see `Certainty`. */
  certainty?: Certainty;
  /**
   * Stage 7H. Why this detection fired, as a list of signal names from evidence/score.ts
   * (e.g. `['checksum_pass', 'autocomplete_match']`). Local only: the panel may render it so a
   * user can see the reasoning, but it is never put in a payload and the server never sees it —
   * exposing which signals fired would tell a hostile page how to evade them.
   */
  evidence?: string[];
  target: DetectionTarget;
  span?: DetectionSpan;
  /** LocalOnly, never serialized — see privacy/firewall.ts for the one place anything derived
   * from this is allowed to leave the browser (as a token, never as this string). */
  rawValue?: LocalOnly<string>;
  /** Top-level CSS-px rects this detection covers — what the redactor masks. */
  rects: Rect[];
}

export function markLocalOnlyValue(value: string): LocalOnly<string> {
  return value as LocalOnly<string>;
}
