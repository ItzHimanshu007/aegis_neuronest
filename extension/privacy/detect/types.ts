/**
 * The detection cascade's output type (Stage 2 Part C). A `Detection` is evidence that a category
 * of PII is present somewhere in the observation — the policy engine (privacy/policy.ts) later
 * turns each one into an action. Nothing here is sent anywhere on its own; `rawValue` is branded
 * `LocalOnly` and only the payload builder (via the vault/redactor) ever consumes it.
 */

import type { LocalOnly } from '../../observe/types';
import type { Category } from '../categoryTypes';

export type DetectionSource = 'tag' | 'autocomplete' | 'rule' | 'field_context' | 'unscanned' | 'visual' | 'ner' | 'ocr';

export type DetectionTargetKind = 'element' | 'text_span' | 'media' | 'side_channel' | 'task';

export interface DetectionTarget {
  kind: DetectionTargetKind;
  /** Meaning depends on `kind`: element `fp`, text block `blockRef`, media `rid`,
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
