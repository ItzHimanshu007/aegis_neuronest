/**
 * Secret rule (Stage 2 Part C.3): common API-key prefixes, JWT shape, and high-entropy strings —
 * the last of which only fires when a key/token/secret field-context label already applies
 * (`requiresContext`), since a bare high-entropy heuristic on unlabelled text would false-positive
 * constantly (hashes, ids, hex colors, etc. all look "random").
 */

import type { Rule, RuleContext, RuleMatch } from './types';

const PREFIXED_KEY_PATTERN = /\b(sk-[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{12,}|ghp_[A-Za-z0-9]{20,})\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const HIGH_ENTROPY_CANDIDATE = /\b[A-Za-z0-9_\-+/=]{20,}\b/g;
const ENTROPY_THRESHOLD = 3.5; // bits/char; random base64/hex easily clears this, English text doesn't
const MIN_ENTROPY_LENGTH = 20;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export const secretRule: Rule = {
  name: 'secret',
  category: 'SECRET',
  find(value: string, ctx: RuleContext): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const m of value.matchAll(PREFIXED_KEY_PATTERN)) {
      matches.push({ category: 'SECRET', confidence: 0.95, matchedText: m[0], start: m.index });
    }
    for (const m of value.matchAll(JWT_PATTERN)) {
      matches.push({ category: 'SECRET', confidence: 0.9, matchedText: m[0], start: m.index });
    }

    if (ctx.fieldCategory === 'SECRET') {
      for (const m of value.matchAll(HIGH_ENTROPY_CANDIDATE)) {
        if (m[0].length < MIN_ENTROPY_LENGTH) continue;
        if (matches.some((existing) => existing.start <= m.index && m.index < existing.start + existing.matchedText.length)) continue;
        if (shannonEntropy(m[0]) >= ENTROPY_THRESHOLD) {
          matches.push({ category: 'SECRET', confidence: 0.7, matchedText: m[0], start: m.index });
        }
      }
    }

    return matches;
  },
};
