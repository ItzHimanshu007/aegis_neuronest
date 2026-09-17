/**
 * Autocomplete-token detection (Stage 2 Part C.2). Maps the standard HTML `autocomplete` tokens
 * (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill) to a
 * Category. Checked in order — an autocomplete value can carry multiple space-separated tokens
 * (e.g. "shipping tel"), so we scan all of them and take the first that maps.
 */

import type { RawElement } from '../../observe/types';
import type { Category } from '../categoryTypes';
import type { Detection } from './types';

const TOKEN_TO_CATEGORY: Record<string, Category> = {
  'given-name': 'NAME',
  'family-name': 'NAME',
  'additional-name': 'NAME',
  name: 'NAME',
  email: 'EMAIL',
  tel: 'PHONE',
  'tel-national': 'PHONE',
  'tel-local': 'PHONE',
  'street-address': 'ADDRESS',
  'address-line1': 'ADDRESS',
  'address-line2': 'ADDRESS',
  'address-line3': 'ADDRESS',
  'postal-code': 'PIN_CODE',
  bday: 'DOB',
  'bday-day': 'DOB',
  'bday-month': 'DOB',
  'bday-year': 'DOB',
  'cc-number': 'CARD_NUMBER',
  'cc-csc': 'CVV',
  'one-time-code': 'OTP',
  organization: 'EMPLOYER',
  'address-level2': 'CITY',
};

export function categoryFromAutocomplete(autocomplete: string | undefined): Category | undefined {
  if (!autocomplete) return undefined;
  const tokens = autocomplete.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    const category = TOKEN_TO_CATEGORY[token];
    if (category) return category;
  }
  return undefined;
}

export function detectFromAutocomplete(el: RawElement, captureId: string, idFor: (suffix: string) => string, eid: import('../../scene/registry').EID): Detection[] {
  const category = categoryFromAutocomplete(el.autocomplete);
  if (!category) return [];
  return [
    {
      id: idFor('autocomplete'),
      capture_id: captureId,
      source: 'autocomplete',
      category,
      confidence: 0.85,
      target: { kind: 'element', ref: eid },
      rects: [el.bbox],
    },
  ];
}
