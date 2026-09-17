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
import type { Action, Category } from './categoryTypes';

export interface SanitizeTextOptions {
  /** Resolves the action for a category found in this text (the policy engine, pre-bound to the
   * current necessity/identity context by the caller). */
  decideFor: (category: Category, value: string) => Action;
  /** Mints (or reuses) a token for a value. Async because HMAC signing is async. */
  tokenize: (category: Category, value: string) => Promise<string>;
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
 * Replaces every rule hit in `text` with either its token or a `[REDACTED:TYPE]` marker, depending
 * on the policy action, then neutralizes any token-like leftovers. Replacements are applied
 * right-to-left so earlier offsets stay valid.
 */
export async function sanitizeText(text: string, options: SanitizeTextOptions): Promise<SanitizedText> {
  const matches = runRules(text, {}).sort((a, b) => b.start - a.start);
  const applied: SanitizedText['applied'] = [];
  let result = text;

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

  const neutralized = neutralize(result);
  return { text: neutralized.text, applied, neutralizedCount: neutralized.neutralizedCount };
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
