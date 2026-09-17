/**
 * The rule interface every regex+checksum rule in privacy/detect/rules/ implements (Stage 2 Part
 * C.3). Each rule scans a plain string and returns zero or more non-overlapping matches — most
 * text a rule sees is a single field value, but rules also run over free-text blocks that may
 * contain several matches (e.g. a paragraph mentioning both an email and a phone number).
 */

import type { Category } from '../../categoryTypes';

export interface RuleMatch {
  category: Category;
  /** 0..1. */
  confidence: number;
  /** The exact substring that matched, for span/rect computation by the caller. */
  matchedText: string;
  /** Offset of `matchedText` within the string the rule was given. */
  start: number;
}

export interface RuleContext {
  /** The category field-context detection already assigned to this value's field/block, if any —
   * context-only rules (BANK_ACCOUNT, OTP, PIN_CODE, ORDER_ID, FINANCIAL_VALUE) require this to
   * match their own category before firing at all. */
  fieldCategory?: Category;
}

export interface Rule {
  name: string;
  category: Category;
  /** True for rules that only fire when `ctx.fieldCategory` already indicates this exact
   * category — Stage 2 Part C.3's "context-only rules". */
  requiresContext?: boolean;
  find(value: string, ctx: RuleContext): RuleMatch[];
}
