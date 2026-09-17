/**
 * Email rule (Stage 2 Part C.3): a pragmatic RFC-5322-ish pattern — not a full grammar (no one
 * needs quoted-string local parts here), but deliberately structured so `upiId.ts`'s "no dot in
 * the handle" rule and this one never both fire on the same string.
 */

import type { Rule, RuleMatch } from './types';

const EMAIL_PATTERN = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

export const emailRule: Rule = {
  name: 'email',
  category: 'EMAIL',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(EMAIL_PATTERN)) {
      matches.push({ category: 'EMAIL', confidence: 0.95, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
