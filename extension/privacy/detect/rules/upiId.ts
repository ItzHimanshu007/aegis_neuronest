/**
 * UPI ID rule (Stage 2 Part C.3): `handle@psp` where the PSP part has NO dot — that's the one
 * structural fact that keeps this from stealing every email address (`user@example.com` has a dot
 * in the domain; `user@oksbi` does not). Confidence is boosted when the PSP part is a known
 * handle.
 */

import type { Rule, RuleMatch } from './types';

// Known PSP (Payment Service Provider) handles, kept here rather than in shared/config.ts since
// this is detection-specific data, not a tuning threshold.
const KNOWN_PSP_HANDLES = new Set([
  'okaxis',
  'okhdfcbank',
  'oksbi',
  'okicici',
  'okbizaxis',
  'ybl', // PhonePe
  'paytm',
  'apl', // Amazon Pay
  'ibl', // ICICI
  'axl', // Axis
  'axisbank',
  'jio',
  'rzp', // Razorpay
  'freecharge',
  'idfcbank',
  'kotak',
  'upi',
]);

const UPI_PATTERN = /\b([a-zA-Z0-9.\-_]{2,256})@([a-zA-Z][a-zA-Z0-9]{1,64})\b/g;

export const upiIdRule: Rule = {
  name: 'upiId',
  category: 'UPI_ID',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(UPI_PATTERN)) {
      const psp = m[2]!.toLowerCase();
      // No dot in the PSP segment, AND the character right after the match isn't a dot either —
      // that second check is what actually keeps this from stealing "user@example.com" (the bare
      // regex would otherwise match "user@example" and only see "example", which has no dot of
      // its own; checking the next character catches that it's really the first label of a
      // multi-label email domain).
      const nextChar = value[m.index + m[0].length];
      if (psp.includes('.') || nextChar === '.') continue;
      const confidence = KNOWN_PSP_HANDLES.has(psp) ? 0.9 : 0.55;
      matches.push({ category: 'UPI_ID', confidence, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
