/**
 * Indian mobile phone rule (Stage 2 Part C.3): optional +91/0 prefix, first digit 6-9, 10 digits,
 * common spacing (`98765 43210`, `9876543210`, `+91 98765-43210`).
 */

import type { Rule, RuleMatch } from './types';

const PHONE_PATTERN = /(?:\+91[ -]?|0)?\b([6-9]\d{4})[ -]?(\d{5})\b/g;

export const phoneRule: Rule = {
  name: 'phone',
  category: 'PHONE',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(PHONE_PATTERN)) {
      matches.push({ category: 'PHONE', confidence: 0.75, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
