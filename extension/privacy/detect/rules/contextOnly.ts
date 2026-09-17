/**
 * Context-only rules (Stage 2 Part C.3): patterns too generic to fire on their own — a bare
 * 6-digit number could be a PIN code, an OTP fragment, or nothing at all — so each of these only
 * matches when field-context detection has already labelled the surrounding field/block with the
 * SAME category. `requiresContext: true` signals this to the cascade orchestrator (index.ts),
 * which is expected to skip calling these rules at all unless `ctx.fieldCategory` is set.
 */

import type { Rule, RuleContext, RuleMatch } from './types';

function contextGated(name: string, category: RuleMatch['category'], pattern: RegExp, confidence: number): Rule {
  return {
    name,
    category,
    requiresContext: true,
    find(value: string, ctx: RuleContext): RuleMatch[] {
      if (ctx.fieldCategory !== category) return [];
      const matches: RuleMatch[] = [];
      for (const m of value.matchAll(pattern)) {
        matches.push({ category, confidence, matchedText: m[0], start: m.index });
      }
      return matches;
    },
  };
}

export const bankAccountRule = contextGated('bankAccount', 'BANK_ACCOUNT', /\b\d{9,18}\b/g, 0.6);
export const otpRule = contextGated('otp', 'OTP', /\b\d{4,8}\b/g, 0.6);
export const pinCodeRule = contextGated('pinCode', 'PIN_CODE', /\b\d{6}\b/g, 0.65);
export const orderIdRule = contextGated('orderId', 'ORDER_ID', /\b[A-Za-z0-9][A-Za-z0-9-]{4,24}\b/g, 0.5);

const DATE_PATTERN = /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi;
export const dateRule: Rule = {
  name: 'date',
  category: 'DATE',
  requiresContext: true,
  find(value: string, ctx: RuleContext): RuleMatch[] {
    if (ctx.fieldCategory !== 'DATE' && ctx.fieldCategory !== 'DOB') return [];
    const category = ctx.fieldCategory;
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(DATE_PATTERN)) {
      matches.push({ category, confidence: 0.7, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};

const FINANCIAL_VALUE_PATTERN = /(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{1,2})?/g;
export const financialValueRule: Rule = {
  name: 'financialValue',
  category: 'FINANCIAL_VALUE',
  requiresContext: true,
  find(value: string, ctx: RuleContext): RuleMatch[] {
    if (ctx.fieldCategory !== 'FINANCIAL_VALUE') return [];
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(FINANCIAL_VALUE_PATTERN)) {
      matches.push({ category: 'FINANCIAL_VALUE', confidence: 0.75, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};

export const CONTEXT_ONLY_RULES: Rule[] = [bankAccountRule, otpRule, pinCodeRule, orderIdRule, dateRule, financialValueRule];
