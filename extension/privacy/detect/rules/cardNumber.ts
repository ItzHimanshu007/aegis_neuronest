/**
 * Card number rule (Stage 2 Part C.3): 13-19 digits with optional separators, Luhn-valid, and a
 * known IIN (Issuer Identification Number) prefix — the combination is what keeps this from
 * matching arbitrary long Luhn-valid numbers (order ids, tracking numbers) that aren't cards.
 */

import { isLuhnValid } from './checksums';
import type { Rule, RuleMatch } from './types';

// Candidate: digit groups separated by spaces/hyphens, or one unbroken run, 13-19 digits total.
const CANDIDATE_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

function matchesKnownIin(digits: string): boolean {
  if (/^4/.test(digits)) return true; // Visa
  if (/^5[1-5]/.test(digits)) return true; // Mastercard (old range)
  if (/^2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(digits)) return true; // Mastercard (2-series)
  if (/^3[47]/.test(digits)) return true; // Amex
  if (/^(60|65|81|82|508)/.test(digits)) return true; // RuPay
  if (/^353/.test(digits) || /^356/.test(digits)) return true; // RuPay (JCB-co-badge ranges used in India)
  if (/^6011/.test(digits) || /^64[4-9]/.test(digits) || /^65/.test(digits)) return true; // Discover
  if (/^3(0[0-5]|[68])/.test(digits)) return true; // Diners Club
  return false;
}

export const cardNumberRule: Rule = {
  name: 'cardNumber',
  category: 'CARD_NUMBER',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(CANDIDATE_PATTERN)) {
      const digits = m[0].replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      if (!isLuhnValid(digits)) continue;
      if (!matchesKnownIin(digits)) continue;
      matches.push({ category: 'CARD_NUMBER', confidence: 0.92, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
