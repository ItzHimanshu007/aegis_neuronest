import type { Category } from '../categoryTypes';
import type { RawElement } from '../../observe/types';

export type FillState = 'empty' | 'partial' | 'filled';
/** Minimum complete lengths; variable-length categories use the input watcher's typing signal.
 * These are fill hints, never validity checks: a mistyped labelled value is still sensitive. */
export const EXPECTED_LENGTH: Partial<Record<Category, number>> = {
  AADHAAR: 12, PAN: 10, CARD_NUMBER: 13, IFSC: 11, PHONE: 10, PIN_CODE: 6,
  VOTER_ID: 10, PASSPORT: 8, ABHA: 14, UAN: 12,
};
export function classifyFill(el: Pick<RawElement, 'hasValue' | 'value' | 'beingTyped'>, category: Category): FillState {
  if (!el.hasValue) return 'empty';
  if (el.beingTyped) return 'partial';
  const expected = EXPECTED_LENGTH[category];
  if (expected && el.value !== undefined && el.value.replace(/[\s-]/g, '').length < expected) return 'partial';
  // Never inspect an unavailable secret value to infer length.
  return 'filled';
}
