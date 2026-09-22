/**
 * Stage 7E — inline key-value binding and context windows.
 *
 * THE DEFECT THIS FIXES. `fieldContext.ts`'s KEY_VALUE_PATTERN is `/^([^:：]{2,40})[:：]\s*(.+)$/`
 * — anchored at `^`, and single-match. It binds "Aadhaar: 1234 5678 9012" perfectly and binds
 * nothing at all in running prose, because a paragraph begins with prose:
 *
 *   "Thank you for your request. Our records currently show Account number for credit:
 *    5853936029031980, and Registered name: Joseph Bose. Please contact the branch..."
 *
 * The 54-character lead pushes every pair past the `^` anchor and past the 40-character key
 * budget, so `blockCategory` is undefined for the whole paragraph. That one anchor disables, in
 * running text: all six context-only rules (bank account, OTP, PIN code, order id, date,
 * financial value), all six INDIAN_IDENTIFIER_RULES, and the labelled-value fallback in
 * detect/index.ts. In the Stage 4 held-out corpus, `prose` accounts for 31 of the 63 false
 * negatives, and for 23 of them the label was IN the dictionary the whole time.
 *
 * So this is not a new heuristic and not a new vocabulary. It supplies `ctx.fieldCategory` in a
 * construct where it was always undefined, re-enabling twelve rules that already demanded a label.
 * We change WHERE we look for the label, never WHAT counts as one: a binding is accepted only if
 * `matchLabelCategories` — the existing dictionary, unmodified — recognises the key.
 *
 * BOUNDING, because an unanchored scan of page text is how a detector starts reading the whole
 * page. A key is at most EVIDENCE_KEY_MAX_WORDS words immediately before the colon, so the prose
 * lead can never be swallowed into it. A value region ends at the first clause boundary or after
 * EVIDENCE_VALUE_WINDOW_CHARS characters, whichever comes first. Nothing outside a bound region is
 * retained.
 */

import { AEGIS_CONFIG } from '../../../shared/config';
import { matchLabels } from '../labels';
import type { Category } from '../../categoryTypes';

export interface InlineBinding {
  category: Category;
  /** The key text that matched, for tests and for Stage 7H reasoning. Local only. */
  phrase: string;
  /** Offsets into the block text the binder was given. */
  keyStart: number;
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
}

/** Clause boundaries that end a value region. ", and " is listed because it is how the page
 * factory's prose renderer joins successive pairs, and it is ordinary English besides. */
const CLAUSE_END = /(?:,\s+and\s+|[;.]\s+|\.$|;$)/g;

/**
 * The word offsets, right to left, where a key could start: one word before the colon, two words
 * before, and so on up to EVIDENCE_KEY_MAX_WORDS. Stops early at any character that cannot occur
 * inside a field label, so a sentence boundary always terminates the search.
 */
function keyStartCandidates(text: string, colonIndex: number): number[] {
  const starts: number[] = [];
  let index = colonIndex;
  let inWord = false;

  while (index > 0 && starts.length < AEGIS_CONFIG.EVIDENCE_KEY_MAX_WORDS) {
    const ch = text[index - 1]!;
    if (ch === '.' || ch === ',' || ch === ';' || ch === ':' || ch === '：' || ch === '\n') break;
    if (/\s/.test(ch)) {
      if (inWord) {
        starts.push(index);
        inWord = false;
      }
    } else {
      inWord = true;
    }
    index -= 1;
  }
  if (inWord && starts.length < AEGIS_CONFIG.EVIDENCE_KEY_MAX_WORDS) starts.push(index);
  return starts;
}

/**
 * Picks the key for one colon: the word-suffix before it whose dictionary match is MOST SPECIFIC,
 * and among equally specific ones, the SHORTEST.
 *
 * Both halves of that rule earn their place. Most-specific-wins is why
 * "Permanent account number" binds as PAN rather than as BANK_ACCOUNT — the 3-word suffix matches
 * the 24-character phrase `permanent account number`, beating the 2-word suffix's 14-character
 * `account number`. Shortest-on-a-tie is why "Our records currently show Registered name" binds on
 * `name` and not on the whole prose lead: every suffix from 1 to 6 words matches the same 4-character
 * phrase `name`, so the shortest one wins and the prose is never treated as part of the label.
 */
function pickKey(text: string, colonIndex: number): { start: number; category: Category; phrase: string } | undefined {
  let best: { start: number; category: Category; phrase: string; phraseLength: number; words: number } | undefined;

  keyStartCandidates(text, colonIndex).forEach((start, wordIndex) => {
    const phrase = text.slice(start, colonIndex).trim();
    if (phrase.length < 2) return;
    const match = matchLabels(phrase)[0];
    if (!match) return;
    const words = wordIndex + 1;
    if (!best || match.phraseLength > best.phraseLength || (match.phraseLength === best.phraseLength && words < best.words)) {
      best = { start, category: match.category, phrase, phraseLength: match.phraseLength, words };
    }
  });

  return best && { start: best.start, category: best.category, phrase: best.phrase };
}

function valueEndOffset(text: string, valueStart: number): number {
  const windowEnd = Math.min(text.length, valueStart + AEGIS_CONFIG.EVIDENCE_VALUE_WINDOW_CHARS);
  const slice = text.slice(valueStart, windowEnd);
  CLAUSE_END.lastIndex = 0;
  const boundary = CLAUSE_END.exec(slice);
  return boundary ? valueStart + boundary.index : windowEnd;
}

/**
 * Every `Label: value` pair in a block, at any offset — not just the first one at `^`.
 *
 * Returns bindings in document order, non-overlapping: once a value region is taken, a later
 * colon inside it cannot start a second binding, so "Note: Ref: 12345" binds once, not twice.
 */
export function findInlineKeyValues(blockText: string): InlineBinding[] {
  if (!blockText) return [];
  const bindings: InlineBinding[] = [];
  let cursor = 0;

  for (let i = 0; i < blockText.length; i++) {
    if (i < cursor) continue;
    const ch = blockText[i];
    if (ch !== ':' && ch !== '：') continue;

    const key = pickKey(blockText, i);
    if (!key) continue;

    // Skip the colon and any following whitespace.
    let valueStart = i + 1;
    while (valueStart < blockText.length && /\s/.test(blockText[valueStart]!)) valueStart += 1;
    if (valueStart >= blockText.length) continue;

    const valueEnd = valueEndOffset(blockText, valueStart);
    if (valueEnd <= valueStart) continue;

    bindings.push({ category: key.category, phrase: key.phrase, keyStart: key.start, keyEnd: i, valueStart, valueEnd });
    cursor = valueEnd;
  }

  return bindings;
}

/** The binding whose value region contains `offset`, if any — how a candidate found by shape
 * matching discovers the label that was bound to it. */
export function bindingAt(bindings: InlineBinding[], offset: number): InlineBinding | undefined {
  return bindings.find((binding) => offset >= binding.valueStart && offset < binding.valueEnd);
}
