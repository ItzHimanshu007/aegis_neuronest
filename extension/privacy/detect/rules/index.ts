/**
 * Rule registry (Stage 2 Part C.3). `runRules()` applies every unconditional rule to a string,
 * then every context-only rule (which self-filter on `ctx.fieldCategory`), and returns the
 * combined, still-possibly-overlapping match list — `merge.ts` (Part C.7) resolves overlaps.
 */

import { aadhaarRule } from './aadhaar';
import { panRule } from './pan';
import { cardNumberRule } from './cardNumber';
import { emailRule } from './email';
import { upiIdRule } from './upiId';
import { phoneRule } from './phone';
import { ifscRule } from './ifsc';
import { vehicleRegRule } from './vehicleReg';
import { secretRule } from './secret';
import { CONTEXT_ONLY_RULES } from './contextOnly';
import type { Rule, RuleContext, RuleMatch } from './types';

export const UNCONDITIONAL_RULES: Rule[] = [aadhaarRule, panRule, cardNumberRule, emailRule, upiIdRule, phoneRule, ifscRule, vehicleRegRule, secretRule];

export const ALL_RULES: Rule[] = [...UNCONDITIONAL_RULES, ...CONTEXT_ONLY_RULES];

export function runRules(value: string, ctx: RuleContext): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of ALL_RULES) {
    if (rule.requiresContext && rule.category !== ctx.fieldCategory) continue;
    matches.push(...rule.find(value, ctx));
  }
  return matches;
}

export * from './checksums';
export * from './types';
export {
  aadhaarRule,
  panRule,
  cardNumberRule,
  emailRule,
  upiIdRule,
  phoneRule,
  ifscRule,
  vehicleRegRule,
  secretRule,
  CONTEXT_ONLY_RULES,
};
