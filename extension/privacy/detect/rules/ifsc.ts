/** IFSC code rule (Stage 2 Part C.3): `^[A-Z]{4}0[A-Z0-9]{6}$` — 4-letter bank code, literal '0',
 * 6-character branch code. */

import type { Rule, RuleMatch } from './types';

const IFSC_PATTERN = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;

export const ifscRule: Rule = {
  name: 'ifsc',
  category: 'IFSC',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(IFSC_PATTERN)) {
      matches.push({ category: 'IFSC', confidence: 0.9, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
