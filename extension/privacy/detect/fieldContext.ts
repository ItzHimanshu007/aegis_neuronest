/**
 * Field-context detection (Stage 2 Part C.4). Maps an element or a piece of read-only text to a
 * `Category` using, in priority order:
 *   1. label text / accessible name (the LABEL_DICTIONARY match)
 *   2. `name`/`id` attribute hints (same dictionary, applied to the attribute value — local only,
 *      never sent anywhere; this is a detection *input*, not something that reaches the payload)
 *   3. key-value pairing inside a single text block ("Label: value", or a `<dt>`/`<dd>` pair)
 *   4. nearest label block to the left (same row) or above (same column) within
 *      `FIELD_CONTEXT_MAX_PX`, e.g. a table's "Balance" header over a value cell.
 *
 * A field-context category applies to a field EVEN WHEN EMPTY (needed for re-hydration checks in
 * later stages — the policy engine needs to know "this is a PASSWORD field" before it has a
 * value) — callers should call `getElementFieldContext` regardless of `hasValue`.
 */

import { categoryFromAutocomplete } from './autocomplete';
import { matchLabelCategories } from './labels';
import type { Category } from '../categoryTypes';
import type { CssRect, RawElement, RawTextBlock } from '../../observe/types';
import { AEGIS_CONFIG } from '../../shared/config';

/** Element label/name/id-based context. Tries the accessible name first (usually the richest
 * signal), then the explicit label text, then the `name`/`id` attributes as a last resort (sites
 * that skip visible labels but keep semantic `name="email"` attributes). */
export function getElementFieldContext(el: Pick<RawElement, 'name' | 'labelText' | 'nameAttr' | 'inputType' | 'autocomplete'>): Category | undefined {
  if (el.inputType === 'password') return 'PASSWORD';
  const ac = categoryFromAutocomplete(el.autocomplete);
  if (ac === 'PIN_CODE') return ac;

  const sources = [el.name, el.labelText, el.nameAttr].filter((s): s is string => Boolean(s));
  for (const source of sources) {
    const matches = matchLabelCategories(source);
    if (matches.length > 0) return matches[0];
  }
  return ac;
}

const KEY_VALUE_PATTERN = /^([^:：]{2,40})[:：]\s*(.+)$/;

export interface KeyValueMatch {
  category: Category;
  /** Offset in the block's text where the value part begins. */
  valueStart: number;
}

/** Matches a "Label: value" pattern within a single text block's joined text (Stage 2 Part C.4:
 * "key-value pairing in text blocks"). Also handles a `<dt>`/`<dd>` pair, which the harvester
 * reports as two separate text blocks — see `pairDtDd` below for that case. */
export function getKeyValueKeyContext(blockText: string): KeyValueMatch | undefined {
  const m = KEY_VALUE_PATTERN.exec(blockText);
  if (!m) return undefined;
  const [, key] = m;
  const matches = matchLabelCategories(key!);
  if (matches.length === 0) return undefined;
  const valueStart = m[0].length - m[2]!.length;
  return { category: matches[0]!, valueStart };
}

/** True if `a` sits close enough above-or-left of `b` (within `maxPx`) to plausibly be its label
 * — e.g. a table header row above a value cell, or a left-hand label next to a right-hand value. */
function isNearbyLabelPosition(a: CssRect, b: CssRect, maxPx: number): boolean {
  const sameRowLeft = a.x + a.width <= b.x && b.x - (a.x + a.width) <= maxPx && Math.abs(a.y - b.y) < Math.max(a.height, b.height);
  const sameColumnAbove = a.y + a.height <= b.y && b.y - (a.y + a.height) <= maxPx && a.x < b.x + b.width && a.x + a.width > b.x;
  return sameRowLeft || sameColumnAbove;
}

/** Finds the category of the nearest label-shaped text block to `targetBbox` — to its left on
 * the same row, or directly above in the same column — within `FIELD_CONTEXT_MAX_PX`. */
export function findNearestLabelCategory(
  targetBbox: CssRect,
  candidateBlocks: RawTextBlock[],
  maxPx: number = AEGIS_CONFIG.FIELD_CONTEXT_MAX_PX,
): Category | undefined {
  let best: { category: Category; distance: number } | undefined;
  for (const block of candidateBlocks) {
    if (!isNearbyLabelPosition(block.bbox, targetBbox, maxPx)) continue;
    const matches = matchLabelCategories(block.text);
    if (matches.length === 0) continue;
    const distance = Math.hypot(targetBbox.x - block.bbox.x, targetBbox.y - block.bbox.y);
    if (!best || distance < best.distance) {
      best = { category: matches[0]!, distance };
    }
  }
  return best?.category;
}

const LABEL_ROLES = new Set(['term', 'rowheader', 'columnheader']);
const VALUE_ROLES = new Set(['definition', 'cell', 'gridcell']);

/**
 * Pairs a label block with the value block that follows it in document order, for the two markups
 * that carry their own label without a colon: `<dt>Aadhaar</dt><dd>1234...</dd>` (roles
 * 'term'/'definition') and `<tr><th scope="row">City</th><td>Bengaluru</td></tr>` (roles
 * 'rowheader'/'cell'). Both give the value block its category even though the value itself
 * contains no clue.
 */
export function pairDtDd(blocks: RawTextBlock[]): Map<string, Category> {
  const result = new Map<string, Category>();
  for (let i = 0; i < blocks.length - 1; i++) {
    const label = blocks[i]!;
    const value = blocks[i + 1]!;
    if (!LABEL_ROLES.has(label.role) || !VALUE_ROLES.has(value.role)) continue;
    const matches = matchLabelCategories(label.text);
    if (matches.length > 0) result.set(value.blockRef, matches[0]!);
  }
  return result;
}
