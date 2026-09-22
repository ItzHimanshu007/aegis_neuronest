/**
 * Stage 7A — intrinsic value shapes.
 *
 * Every matcher here reads ONLY the value. No label, no attribute, no surrounding text. That is
 * the whole point: Stage 4 measured recall 1.000 on checksum-validated categories and 0.974 on
 * self-describing ones against 0.649 on label-dictionary-dependent ones, so the categories worth
 * rescuing are the ones whose values still carry some signal of their own.
 *
 * Three strengths, and the distinction is load-bearing rather than decorative:
 *
 *   self_describing — the value names its own type (an '@' with a domain, a 'Bearer ' prefix).
 *                     Safe on its own.
 *   structured      — a distinctive arrangement that is rarely accidental (a currency symbol with
 *                     a grouped decimal amount, AAA0000000). Needs a little corroboration.
 *   weak            — a bare digit run. On its own this is nothing; a 12-digit number is an
 *                     Aadhaar, a UAN, a batch number or a phone with a country code, and the
 *                     scorer must be free to say so.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not re-implement the rules that already work.
 * email, UPI, IFSC, PAN, phone, vehicle-reg, Aadhaar and card detection stay in detect/rules/ and
 * keep firing unconditionally exactly as before; Stage 7 must not change a category that Stage 4
 * measured at 1.000. The matchers below cover the shapes the rule layer could only reach THROUGH
 * A LABEL (requiresContext), plus two genuinely new credential shapes.
 */

import { isLuhnValid, isVerhoeffValid } from '../rules/checksums';
import type { ShapeHint } from './types';

/** Digits with spaces/hyphens stripped — how every Indian identifier is actually rendered. */
function digitsOf(text: string): string {
  return text.replace(/[\s-]/g, '');
}

type Matcher = (text: string) => ShapeHint[];

/**
 * 12 digits. Ambiguous BY CONSTRUCTION between Aadhaar and UAN, and the checksum is what tells
 * them apart: Aadhaar carries a Verhoeff check digit, UAN does not. A Verhoeff-VALID 12-digit run
 * is already caught unconditionally by aadhaarRule, so this matcher only reports the failing case
 * — as a weak UAN with an explicit `checksum: 'fail'`, which the scorer turns into strong
 * negative evidence against reading it as an Aadhaar.
 */
const twelveDigit: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\b(?:\d[ -]?){11}\d\b/g)) {
    const digits = digitsOf(m[0]);
    if (digits.length !== 12) continue;
    if (isVerhoeffValid(digits)) continue; // aadhaarRule owns this case, unchanged
    hits.push({ category: 'UAN', strength: 'weak', start: m.index, matchedText: m[0], checksum: 'fail' });
  }
  return hits;
};

/** 9-18 contiguous digits: a bank account number's only shape. Weak on purpose — this is also the
 * shape of an order reference, a batch number and a transaction id. */
const accountLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\b\d{9,18}\b/g)) {
    // A 12-digit run is handled by twelveDigit (Aadhaar/UAN), which is more specific.
    if (m[0].length === 12) continue;
    // 13-19 digits that pass Luhn are a card, and cardNumberRule already owns that unconditionally.
    if (m[0].length >= 13 && isLuhnValid(m[0])) continue;
    hits.push({ category: 'BANK_ACCOUNT', strength: 'weak', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/** EPIC/voter ID: three letters then seven digits. Distinctive enough to be `structured` — very
 * little else on an Indian portal page has this exact arrangement. */
const voterLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\b[A-Z]{3}\d{7}\b/g)) {
    hits.push({ category: 'VOTER_ID', strength: 'structured', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/** Indian PIN code: six digits, first digit 1-9 (no PIN code starts with 0). Weak — six digits is
 * also an OTP, a year-month, a product code. */
const pinLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\b[1-9]\d{5}\b/g)) {
    hits.push({ category: 'PIN_CODE', strength: 'weak', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/**
 * A currency amount. `structured`, not weak, because the currency SYMBOL is itself a type marker —
 * '₹18,948.52' says "this is money" without any label at all. This is the single biggest
 * label-dependent gap Stage 4 found (FINANCIAL_VALUE recall 0.333, 8 false negatives), and every
 * one of those values carried a '₹'.
 */
const currencyLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  // Grouped (18,948.52 / 1,23,456 lakh-style) or ungrouped (4533.00) — both are ordinary
  // rendering, and a negative that this missed would be passing by luck rather than by design.
  for (const m of text.matchAll(/(?:₹|Rs\.?|INR)\s?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?\b/gi)) {
    hits.push({ category: 'FINANCIAL_VALUE', strength: 'structured', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/** A calendar date. `structured` — the separators and the ranges make it distinctive, but a date
 * is only a DOB in context, so the scorer decides DOB vs DATE, not this matcher. */
const dateLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  const pattern = /\b(?:(?:0?[1-9]|[12]\d|3[01])[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:19|20)\d{2}|(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2})\b/gi;
  for (const m of text.matchAll(pattern)) {
    hits.push({ category: 'DATE', strength: 'structured', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/**
 * `Bearer <token>` — a genuinely new shape, and self-describing in the strictest sense: the word
 * 'Bearer' followed by a long opaque string is an HTTP Authorization header value and nothing
 * else. secretRule already covers JWTs and the sk-/AKIA/ghp_ prefixes unconditionally; this adds
 * the one common credential form none of those patterns reach.
 */
const bearerLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g)) {
    hits.push({ category: 'SECRET', strength: 'self_describing', start: m.index, matchedText: m[0] });
  }
  return hits;
};

/**
 * A long opaque token: >=32 chars of base64url/hex alphabet with no spaces. `structured`, and
 * deliberately NOT self-describing — a git SHA, a content hash and a CSS-in-JS class name all look
 * like this. It reaches DETECTED only when structure agrees (a password/hidden input, a bound
 * credential label), which is exactly what the scorer is for.
 */
const opaqueTokenLike: Matcher = (text) => {
  const hits: ShapeHint[] = [];
  for (const m of text.matchAll(/\b[A-Za-z0-9_-]{32,}\b/g)) {
    if (!/\d/.test(m[0]) || !/[A-Za-z]/.test(m[0])) continue; // all-digits or all-letters is not a token
    hits.push({ category: 'SECRET', strength: 'structured', start: m.index, matchedText: m[0] });
  }
  return hits;
};

const MATCHERS: Matcher[] = [
  twelveDigit,
  accountLike,
  voterLike,
  pinLike,
  currencyLike,
  dateLike,
  bearerLike,
  opaqueTokenLike,
];

/**
 * Every intrinsic shape in `text`. Overlaps are expected and are NOT resolved here — a 6-digit run
 * inside a 16-digit account number is a real ambiguity, and merge.ts (Part C.7) is where
 * overlapping detections on one target are already collapsed. Resolving it twice, in two places,
 * with two different rules is how the two drift apart.
 */
export function findShapes(text: string): ShapeHint[] {
  if (!text) return [];
  return MATCHERS.flatMap((matcher) => matcher(text));
}
