/**
 * Bilingual (English + Hindi) field-label dictionary (Stage 2 Part C.4). Used two ways:
 *
 * 1. `fieldContext.ts` maps a label/accessible-name to a `Category` for detection.
 * 2. `observe/harvester.ts` uses the OTP/CVV/UPI_PIN subset directly (via `isSecretLabel`) to
 *    decide *not to read* a field's raw value at all (Stage 2 Part A1) — before any detection
 *    cascade runs, before the value would ever exist as a JS string anywhere in the extension.
 *
 * Matching is case-, whitespace- and punctuation-insensitive: `normalizeLabel()` lowercases,
 * strips punctuation, and collapses whitespace before comparison, and Hindi entries are matched
 * against the NFC-normalized label the same way.
 */

import type { Category } from '../categoryTypes';

export interface LabelEntry {
  category: Category;
  /** English and Hindi phrases/words that indicate this category. Matched as whole-word
   * substrings of the normalized label (so "Father's Name" matches "name" too, deliberately —
   * field-context is a hint, not proof, and the detection cascade's other layers corroborate it). */
  phrases: string[];
}

export const LABEL_DICTIONARY: LabelEntry[] = [
  { category: 'NAME', phrases: ['name', 'full name', "father's name", 'नाम', 'पिता का नाम'] },
  { category: 'EMAIL', phrases: ['email', 'e-mail', 'email address', 'ई-मेल', 'ईमेल'] },
  { category: 'PHONE', phrases: ['mobile', 'phone', 'phone number', 'contact number', 'मोबाइल', 'फ़ोन', 'फोन'] },
  { category: 'DOB', phrases: ['date of birth', 'dob', 'birth date', 'जन्म तिथि'] },
  { category: 'ADDRESS', phrases: ['address', 'street address', 'पता'] },
  { category: 'CITY', phrases: ['city', 'town', 'शहर'] },
  { category: 'PIN_CODE', phrases: ['pin code', 'pincode', 'postal code', 'zip code', 'पिन कोड'] },
  { category: 'AADHAAR', phrases: ['aadhaar', 'aadhar', 'आधार'] },
  { category: 'PAN', phrases: ['pan', 'pan number', 'permanent account number'] },
  { category: 'BANK_ACCOUNT', phrases: ['account number', 'bank account', 'खाता संख्या'] },
  { category: 'IFSC', phrases: ['ifsc', 'ifsc code'] },
  { category: 'UPI_ID', phrases: ['upi id', 'upi', 'vpa'] },
  { category: 'FINANCIAL_VALUE', phrases: ['balance', 'शेष राशि', 'salary', 'amount due'] },
  { category: 'EMPLOYER', phrases: ['employer', 'company name', 'नियोक्ता'] },
  { category: 'OTP', phrases: ['otp', 'one time password', 'one-time password', 'verification code'] },
  { category: 'CVV', phrases: ['cvv', 'cvc', 'card verification value', 'security code'] },
  { category: 'UPI_PIN', phrases: ['upi pin', 'mpin', 'm-pin'] },
  { category: 'PASSWORD', phrases: ['password', 'पासवर्ड'] },
  { category: 'HEALTH', phrases: ['blood group', 'diagnosis', 'medical condition', 'health condition'] },
  { category: 'VEHICLE_REG', phrases: ['vehicle number', 'registration number', 'vehicle reg'] },
  { category: 'ORDER_ID', phrases: ['order id', 'order number', 'order no'] },
  { category: 'SECRET', phrases: ['api key', 'secret key', 'access token', 'auth token', 'token', 'secret'] },
];

/** Whole-word-boundary categories that MUST NOT partial-match inside a longer word (Stage 2 Part
 * A1 needs this to be conservative: catching "otp" inside an unrelated word would over-trigger
 * the never-read-value guard). */
const SECRET_CATEGORIES: Category[] = ['OTP', 'CVV', 'UPI_PIN'];

export function normalizeLabel(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}/\\_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(normalized: string, phrase: string): boolean {
  const normalizedPhrase = normalizeLabel(phrase);
  if (!normalizedPhrase) return false;
  // Word-boundary match for latin phrases; substring match for Devanagari (no \b word-boundary
  // semantics in the same way, and these strings are short/specific enough not to over-match).
  if (/^[a-z0-9 ]+$/.test(normalizedPhrase)) {
    const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normalized);
  }
  return normalized.includes(normalizedPhrase);
}

/** Finds every category whose dictionary phrase appears in `label`. Returns categories in
 * dictionary declaration order (most-specific-first is the caller's job if it matters). */
export function matchLabelCategories(label: string): Category[] {
  const normalized = normalizeLabel(label);
  if (!normalized) return [];
  const found: Category[] = [];
  for (const entry of LABEL_DICTIONARY) {
    if (entry.phrases.some((phrase) => containsPhrase(normalized, phrase))) {
      found.push(entry.category);
    }
  }
  return found;
}

/** True if `label` matches OTP, CVV or UPI_PIN — the categories whose raw value the harvester
 * must never read in the first place (Stage 2 Part A1). */
export function isSecretLabel(label: string): boolean {
  const categories = matchLabelCategories(label);
  return categories.some((c) => SECRET_CATEGORIES.includes(c));
}
