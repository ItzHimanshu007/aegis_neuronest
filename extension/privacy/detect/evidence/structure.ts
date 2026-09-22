/**
 * Stage 7B — structural evidence.
 *
 * Turns the DOM facts around a candidate into the flat `CandidateContext` the scorer consumes.
 * The scorer must stay a pure function of that object, so every DOM-shaped decision happens here
 * and nothing below this file knows what an element is.
 *
 * "These signals should become evidence, not unconditional classification." That is exactly the
 * split: this file never decides anything. It reports that a container is called "Account
 * summary", or that a field has `maxlength="12"` and `inputmode="numeric"`; score.ts decides what
 * that is worth, and negative.ts is free to argue the other way from the same facts.
 */

import { categoryFromAutocomplete } from '../autocomplete';
import { matchLabelCategories } from '../labels';
import type { Category } from '../../categoryTypes';
import type { RawElement, RawTextBlock } from '../../../observe/types';
import type { CandidateContext, ShapeHint } from './types';

/** Expected value length for shapes whose length is fixed or tightly bounded. Used only to check
 * a field's own maxlength/minlength against the shape — never to detect anything by itself. */
const EXPECTED_DIGITS: Partial<Record<Category, number>> = {
  AADHAAR: 12,
  UAN: 12,
  ABHA: 14,
  PIN_CODE: 6,
  VOTER_ID: 10,
  IFSC: 11,
  PAN: 10,
};

/**
 * True when the field's own length/pattern constraints are consistent with the proposed shape.
 *
 * Consistency, not proof: `maxlength="12"` on a 12-digit run agrees; `maxlength="200"` on a
 * free-text field says nothing either way and returns false rather than pretending to agree.
 */
export function lengthConstraintAgrees(structure: RawElement['structure'], shape: ShapeHint): boolean {
  if (!structure) return false;
  const digits = shape.matchedText.replace(/\D/g, '').length;
  const expected = EXPECTED_DIGITS[shape.category];

  if (structure.pattern && expected !== undefined) {
    // A pattern that pins the same digit count is strong agreement.
    if (new RegExp(`\\{${expected}\\}`).test(structure.pattern)) return true;
  }
  if (structure.maxLength !== undefined) {
    const max = structure.maxLength;
    // A tight cap that exactly admits this value, and little more.
    if (max > 0 && max <= 24 && shape.matchedText.length <= max && max - shape.matchedText.length <= 2) return true;
    if (expected !== undefined && (max === expected || max === expected + 2)) return true;
  }
  if (structure.minLength !== undefined && expected !== undefined && structure.minLength === expected) return true;
  if (structure.inputMode === 'numeric' && digits === shape.matchedText.replace(/[\s-]/g, '').length && digits >= 6) return true;
  return false;
}

/** The container text a candidate is judged against: the most specific enclosing description
 * available. A column header beats a legend beats a section heading, because that is their order
 * of proximity to the value. */
export function containerTextFor(structure: RawElement['structure']): string | undefined {
  return structure?.columnHeaderText ?? structure?.legendText ?? structure?.sectionHeading;
}

function categoryOf(text: string | undefined): Category | undefined {
  if (!text) return undefined;
  return matchLabelCategories(text)[0];
}

/** Structural context for a candidate found inside an ELEMENT's value. */
export function contextForElement(el: RawElement, shape: ShapeHint, extra: Partial<CandidateContext> = {}): CandidateContext {
  const containerText = containerTextFor(el.structure);
  return {
    autocompleteCategory: categoryFromAutocomplete(el.autocomplete),
    inputType: el.inputType,
    containerCategory: categoryOf(containerText) ?? categoryOf(el.structure?.placeholder),
    containerText,
    lengthConstraintAgrees: lengthConstraintAgrees(el.structure, shape),
    inSearchScope: el.inSearchScope,
    ...extra,
  };
}

/** Structural context for a candidate found inside a TEXT BLOCK. A block has no attributes of its
 * own, so its container is its section heading and its role within a table/definition list. */
export function contextForTextBlock(block: RawTextBlock, extra: Partial<CandidateContext> = {}): CandidateContext {
  return {
    containerCategory: categoryOf(block.sectionHeading),
    containerText: block.sectionHeading,
    ...extra,
  };
}
