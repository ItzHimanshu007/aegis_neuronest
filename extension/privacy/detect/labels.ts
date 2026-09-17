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
  // "account holder" and friends name a PERSON, not an account. Without them a
  // `<th>Account holder</th><td>Asha Verma</td>` row carries no category at all, so the
  // labelled-value fallback never fires and the name goes out in the clear — the one false
  // negative in the Stage 2.5 baseline (Stage 3A Part A4).
  { category: 'NAME', phrases: ['name', 'full name', "father's name", 'account holder', 'accountholder', 'cardholder', 'card holder', 'beneficiary', 'नाम', 'पिता का नाम', 'खाताधारक'] },
  { category: 'EMAIL', phrases: ['email', 'e-mail', 'email address', 'ई-मेल', 'ईमेल'] },
  { category: 'PHONE', phrases: ['mobile', 'phone', 'phone number', 'contact number', 'मोबाइल', 'फ़ोन', 'फोन'] },
  { category: 'DOB', phrases: ['date of birth', 'dob', 'birth date', 'जन्म तिथि'] },
  { category: 'ADDRESS', phrases: ['address', 'street address', 'पता'] },
  { category: 'CITY', phrases: ['city', 'town', 'शहर'] },
  { category: 'PIN_CODE', phrases: ['pin code', 'pincode', 'postal pin', 'postal code', 'zip code', 'पिन कोड'] },
  { category: 'AADHAAR', phrases: ['aadhaar', 'aadhar', 'आधार'] },
  { category: 'PAN', phrases: ['pan', 'pan number', 'permanent account number'] },
  { category: 'CARD_NUMBER', phrases: ['card number', 'credit card', 'debit card', 'कार्ड नंबर'] },
  { category: 'BANK_ACCOUNT', phrases: ['account number', 'bank account', 'खाता संख्या'] },
  { category: 'IFSC', phrases: ['ifsc', 'ifsc code'] },
  { category: 'UPI_ID', phrases: ['upi id', 'upi', 'vpa'] },
  { category: 'FINANCIAL_VALUE', phrases: ['balance', 'शेष राशि', 'salary', 'amount due'] },
  { category: 'EMPLOYER', phrases: ['employer', 'company name', 'नियोक्ता'] },
  { category: 'OTP', phrases: ['otp', 'one time password', 'one-time password', 'verification code'] },
  { category: 'CVV', phrases: ['cvv', 'cvc', 'card verification value', 'security code'] },
  { category: 'UPI_PIN', phrases: ['upi pin', 'mpin', 'm-pin'] },
  { category: 'VOTER_ID', phrases: ['voter id', 'epic', 'मतदाता पहचान पत्र'] },
  { category: 'PASSPORT', phrases: ['passport', 'पासपोर्ट'] },
  { category: 'DRIVING_LICENCE', phrases: ['driving licence', 'driving license', 'ड्राइविंग लाइसेंस'] },
  { category: 'ABHA', phrases: ['abha', 'ayushman bharat health account', 'आभा', 'आयुष्मान भारत स्वास्थ्य खाता'] },
  { category: 'UAN', phrases: ['uan', 'universal account number', 'यूनिवर्सल खाता संख्या', 'यू ए एन'] },
  { category: 'TRACKING_ID', phrases: ['tracking id', 'tracking number', 'awb', 'consignment', 'खेप संख्या'] },
  { category: 'PRIVATE_GENERIC', phrases: ['gift message', 'personal note', 'निजी संदेश'] },
  { category: 'PASSWORD', phrases: ['password', 'पासवर्ड'] },
  { category: 'HEALTH', phrases: ['blood group', 'diagnosis', 'medical condition', 'health condition'] },
  { category: 'VEHICLE_REG', phrases: ['vehicle number', 'registration number', 'vehicle reg'] },
  { category: 'ORDER_ID', phrases: ['order id', 'order number', 'order no'] },
  { category: 'SECRET', phrases: ['api key', 'secret key', 'access token', 'auth token', 'token', 'secret', 'pin', 'atm pin', 'card pin', 'security pin', 'digit pin', 'पिन'] },
];

/** Whole-word-boundary categories that MUST NOT partial-match inside a longer word (Stage 2 Part
 * A1 needs this to be conservative: catching "otp" inside an unrelated word would over-trigger
 * the never-read-value guard). */
const SECRET_CATEGORIES: Category[] = ['PASSWORD', 'OTP', 'CVV', 'UPI_PIN', 'SECRET'];

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
 * descending specificity order; explicit overrides break equal-length ties. */
export function matchLabelCategories(label: string): Category[] {
  const normalized = normalizeLabel(label);
  if (!normalized) return [];
  const hits = LABEL_DICTIONARY.flatMap(entry => entry.phrases
    .filter(phrase => containsPhrase(normalized, phrase))
    .map(phrase => ({ category: entry.category, length: normalizeLabel(phrase).length })));
  const overrides = Object.entries(LABEL_OVERRIDES).filter(([phrase]) => containsPhrase(normalized, phrase))
    .map(([phrase, category]) => ({ category, length: normalizeLabel(phrase).length }));
  hits.unshift(...overrides);
  hits.sort((a, b) => b.length - a.length);
  return [...new Set(hits.map(hit => hit.category))];
}

/** True if `label` matches OTP, CVV or UPI_PIN — the categories whose raw value the harvester
 * must never read in the first place (Stage 2 Part A1). */
export function isSecretLabel(label: string, autocomplete?: string): boolean {
  if (autocomplete?.toLowerCase().split(/\s+/).includes('postal-code')) return false;
  const category = matchLabelCategories(label)[0];
  return category !== undefined && SECRET_CATEGORIES.includes(category);
}

/** Explicit specificity overrides documented for reviewers and table tests. */
export const LABEL_OVERRIDES = { 'company name': 'EMPLOYER', 'pin code': 'PIN_CODE', 'security code': 'CVV' } as const;
