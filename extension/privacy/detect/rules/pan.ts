/**
 * PAN (Permanent Account Number) rule (Stage 2 Part C.3): `[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]`
 * — 10 characters, no separators. The 4th character encodes holder type (P=individual,
 * C=company, H=HUF, F=firm, A=AOP, T=trust, B=body of individuals, L=local authority, J=artificial
 * juridical person, G=government).
 */

import type { Rule, RuleMatch } from './types';

const PAN_PATTERN = /\b[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]\b/g;

export const panRule: Rule = {
  name: 'pan',
  category: 'PAN',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(PAN_PATTERN)) {
      matches.push({ category: 'PAN', confidence: 0.9, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
