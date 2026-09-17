/**
 * Side-channel sanitizer (Stage 2 Part F.1). URLs, titles, task text and element labels all carry
 * PII just as readily as form values do — an order confirmation page routinely puts the customer's
 * email in the query string and their name in the `<title>`.
 *
 * Every function here returns text that has been (a) rule-scanned and tokenized/redacted according
 * to the policy decision for what it found, and (b) run through `neutralize()` so a hostile page
 * cannot smuggle a token-shaped string into the payload (docs/threat_model.md T2).
 */

import { neutralize } from './vault';
import { runRules } from './detect/rules';
import { AEGIS_CONFIG } from '../shared/config';
import { TOKEN_PATTERN } from '../shared/schema/tokens';
import type { Action, Category } from './categoryTypes';

/** A value the detection cascade already resolved, for `sanitizeText` to apply literally. */
export interface KnownValue {
  value: string;
  category: Category;
  action: Action;
  /** Present when the vault already minted a token for it, so both paths reuse one token. */
  token?: string;
}

export interface SanitizeTextOptions {
  /** Resolves the action for a category found in this text (the policy engine, pre-bound to the
   * current necessity/identity context by the caller). */
  decideFor: (category: Category, value: string) => Action;
  /** Mints (or reuses) a token for a value. Async because HMAC signing is async. */
  tokenize: (category: Category, value: string) => Promise<string>;
  /**
   * Values the detection cascade resolved for this capture, applied as literal replacements after
   * the rule pass.
   *
   * WHY: the cascade sees context the rules cannot. A block reading
   * "Aadhaar-shaped but checksum-invalid: 2345 6789 0128" is flagged AADHAAR because its KEY says
   * Aadhaar, but re-running the rules over that text alone matches nothing (the checksum fails),
   * so a rules-only sanitize would emit the digits verbatim. Passing the decided values in closes
   * that gap; `seal()`'s known-value leak check is the backstop that found it.
   */
  knownValues?: KnownValue[];
}

export interface SanitizedText {
  text: string;
  /** Categories that were tokenized or redacted, for the Privacy Preview panel. */
  applied: Array<{ category: Category; action: Action }>;
  neutralizedCount: number;
}

const TOKENIZING_ACTIONS: Action[] = ['TOKEN', 'TOKEN_WITH_APPROVAL'];
const REDACTING_ACTIONS: Action[] = ['FILL', 'FILL_REGION', 'BLUR', 'USER_ENTERS', 'USER_PROVIDED_ORIGIN_BOUND'];

/**
 * Sanitizes a string in this ORDER, which matters:
 *
 *   1. `neutralize()` FIRST — kills any token look-alike the page planted, while nothing in the
 *      string is yet a token of ours.
 *   2. run rules against the neutralized text, so match offsets refer to the string we're about
 *      to edit.
 *   3. replace each hit with its token or `[REDACTED:TYPE]`, right-to-left so earlier offsets
 *      stay valid.
 *
 * Doing it the other way round (tokenize, then neutralize) destroys the very tokens we just
 * minted — `neutralize()` cannot tell a token we issued a microsecond ago from one a hostile page
 * planted, and it is not supposed to be able to.
 */
export async function sanitizeText(text: string, options: SanitizeTextOptions): Promise<SanitizedText> {
  const neutralized = neutralize(text);
  const matches = runRules(neutralized.text, {}).sort((a, b) => b.start - a.start);
  const applied: SanitizedText['applied'] = [];
  let result = neutralized.text;

  for (const match of matches) {
    const action = options.decideFor(match.category, match.matchedText);
    if (action === 'ALLOW') continue;

    let replacement: string;
    if (TOKENIZING_ACTIONS.includes(action)) {
      replacement = await options.tokenize(match.category, match.matchedText);
    } else if (REDACTING_ACTIONS.includes(action)) {
      replacement = `[REDACTED:${match.category}]`;
    } else {
      continue;
    }

    applied.push({ category: match.category, action });
    result = result.slice(0, match.start) + replacement + result.slice(match.start + match.matchedText.length);
  }

  for (const known of options.knownValues ?? []) {
    if (!isWorthReplacing(known.value)) continue;
    if (known.action === 'ALLOW') continue;
    const replacement = known.token ?? `[REDACTED:${known.category}]`;
    const replaced = replaceOutsideTokens(result, known.value, replacement);
    if (replaced === result) continue;
    result = replaced;
    applied.push({ category: known.category, action: known.action });
  }

  return { text: result, applied, neutralizedCount: neutralized.neutralizedCount };
}

/** Mirrors the floors `seal()`'s leak check uses, so the two agree on what counts as identifying. */
function isWorthReplacing(value: string): boolean {
  const floor = /^\d+$/.test(value) ? AEGIS_CONFIG.LEAK_MIN_DIGITS : AEGIS_CONFIG.LEAK_MIN_LEN;
  return value.length >= floor;
}

/**
 * Literal replace, skipping the token substrings already in the text. Token bodies are base32
 * (a-z2-7), so a short textual value can occur inside one by chance; rewriting it there would
 * forge a token `seal()`'s token check then rejects.
 */
function replaceOutsideTokens(text: string, needle: string, replacement: string): string {
  const tokens = new RegExp(TOKEN_PATTERN.source, 'g');
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    out += text.slice(cursor, match.index).split(needle).join(replacement) + match[0];
    cursor = match.index + match[0].length;
  }
  return out + text.slice(cursor).split(needle).join(replacement);
}

const ID_LIKE_SEGMENT = /^(?:\d{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-fA-F]{16,}|[A-Za-z0-9+/=_-]{20,})$/;

/**
 * Sanitizes a URL: keeps scheme + host + path, DROPS query and fragment entirely (they are the
 * single most common place PII shows up in a URL, and nothing the planner needs lives there in
 * Stage 2), and replaces ID-like path segments with `:id`.
 */
export async function sanitizeUrl(url: string, options: SanitizeTextOptions): Promise<SanitizedText> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { text: '', applied: [], neutralizedCount: 0 };
  }

  const segments = parsed.pathname.split('/').map((segment) => (ID_LIKE_SEGMENT.test(segment) ? ':id' : segment));
  const pathWithoutIds = segments.join('/');
  const base = `${parsed.protocol}//${parsed.host}${pathWithoutIds}`;

  // Rule-scan whatever survives in the path (an email in a path segment, say).
  return sanitizeText(base, options);
}

/** Sanitizes the document title — rules -> token or `[REDACTED:TYPE]`, then neutralize. */
export async function sanitizeTitle(title: string, options: SanitizeTextOptions): Promise<SanitizedText> {
  return sanitizeText(title, options);
}

/** Sanitizes the user's task text. Callers pass a `tokenize` bound to `source: 'task'` so the
 * resulting tokens are re-hydratable on consented origins (see privacy/vault.ts). */
export async function sanitizeTask(task: string, options: SanitizeTextOptions): Promise<SanitizedText> {
  return sanitizeText(task, options);
}
