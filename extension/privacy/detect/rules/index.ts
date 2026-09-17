/**
 * Rule registry (Stage 2 Part C.3). `runRules()` applies every unconditional rule to a string,
 * then every context-only rule (which self-filter on `ctx.fieldCategory`), and returns the
 * combined, still-possibly-overlapping match list — `merge.ts` (Part C.7) resolves overlaps.
 */

import { INDIAN_IDENTIFIER_RULES } from './indianIdentifiers';
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

export const ALL_RULES: Rule[] = [...UNCONDITIONAL_RULES, ...CONTEXT_ONLY_RULES, ...INDIAN_IDENTIFIER_RULES];

export function runRules(value: string, ctx: RuleContext): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of ALL_RULES) {
    if (rule.requiresContext && rule.category !== ctx.fieldCategory) continue;
    const found = rule.find(value, ctx);
    // An explicit ID label outranks a competing checksum/shape (e.g. UAN vs Aadhaar).
    const ids = ['AADHAAR', 'PAN', 'BANK_ACCOUNT', 'CARD_NUMBER', 'UPI_ID', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENCE', 'ABHA', 'UAN', 'TRACKING_ID'];
    if (ctx.fieldCategory && ids.includes(ctx.fieldCategory)) {
      matches.push(...found.map(m => ({ ...m, category: ctx.fieldCategory! })));
    } else matches.push(...found);
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
