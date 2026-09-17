/**
 * Aadhaar rule (Stage 2 Part C.3): 12 digits, first digit 2-9, optional space/hyphen groups of 4,
 * Verhoeff-valid. Masked forms like "XXXX XXXX 1234" are recognized at lower confidence — they
 * can't be checksum-verified (most digits are masked), but the shape is distinctive enough to
 * still fire.
 */

import { isVerhoeffValid } from './checksums';
import type { Rule, RuleMatch } from './types';

const FULL_PATTERN = /\b([2-9]\d{3})[ -]?(\d{4})[ -]?(\d{4})\b/g;
const MASKED_PATTERN = /\b[Xx*]{4}[ -]?[Xx*]{4}[ -]?(\d{4})\b/g;

export const aadhaarRule: Rule = {
  name: 'aadhaar',
  category: 'AADHAAR',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const m of value.matchAll(FULL_PATTERN)) {
      const digits = `${m[1]}${m[2]}${m[3]}`;
      if (isVerhoeffValid(digits)) {
        matches.push({ category: 'AADHAAR', confidence: 0.95, matchedText: m[0], start: m.index });
      }
    }

    for (const m of value.matchAll(MASKED_PATTERN)) {
      matches.push({ category: 'AADHAAR', confidence: 0.6, matchedText: m[0], start: m.index });
    }

    return matches;
  },
};
