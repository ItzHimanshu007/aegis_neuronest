/**
 * Vehicle registration rule (Stage 2 Part C.3): the standard state-code format
 * (`KA 05 MH 1234`) and the newer BH-series format (`23 BH 1234 AB`).
 */

import type { Rule, RuleMatch } from './types';

const STATE_CODE_PATTERN = /\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g;
const BH_SERIES_PATTERN = /\b\d{2}[ -]?BH[ -]?\d{4}[ -]?[A-Z]{1,2}\b/g;

export const vehicleRegRule: Rule = {
  name: 'vehicleReg',
  category: 'VEHICLE_REG',
  find(value: string): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const m of value.matchAll(BH_SERIES_PATTERN)) {
      matches.push({ category: 'VEHICLE_REG', confidence: 0.85, matchedText: m[0], start: m.index });
    }
    for (const m of value.matchAll(STATE_CODE_PATTERN)) {
      // Skip anything already claimed by the BH-series pattern (its 2-digit + "BH" prefix can
      // otherwise also loosely match the state-code shape).
      if (/BH/i.test(m[0])) continue;
      matches.push({ category: 'VEHICLE_REG', confidence: 0.7, matchedText: m[0], start: m.index });
    }
    return matches;
  },
};
