/**
 * Mask label vocabulary (labelled masks).
 *
 * A mask hides a value; a LABEL says what kind of value it was. Drawing that on the mask puts the
 * context where a vision model actually looks, instead of only in the text manifest beside the
 * image. SIH26171 names this "semantic obfuscation" as an accepted sanitization method.
 *
 * The whole safety argument for doing it at all is that a label is drawn from a CLOSED VOCABULARY
 * and nothing else:
 *
 *   - a `Category` name — one of the 38 fixed strings in `categoryTypes.ts`, and
 *   - optionally the token ID of a token the vault already minted and already put in the sealed
 *     text payload, so the label names something the server is being told anyway.
 *
 * Nothing here ever reads the hidden value. There is no parameter that could carry it: the only
 * inputs are a category and a token, and both are validated against fixed patterns before either
 * reaches the output. A category that is not in `ALL_CATEGORIES` produces no label, and a token
 * that is not exactly token-shaped (or whose own type segment disagrees with the category) is
 * dropped rather than rendered, leaving the category-only form.
 *
 * `MASK_LABEL_PATTERN` is the proof obligation: every string this module returns matches it, and
 * `firewall.ts → seal()` re-checks every label actually drawn on the outgoing image against it.
 * See `docs/threat_model.md` for why a label is not a side channel.
 */

import { ALL_CATEGORIES, type Category } from './categoryTypes';
import { TOKEN_PATTERN } from '../shared/schema/tokens';

/** Media we never scanned at all, so there is no category to name — say exactly that instead. */
export const UNSCANNED_MEDIA_LABEL = '[IMAGE — not checked]';

/** A face keeps its irreversible blur; the tag only says what the blurred shape is. */
export const FACE_TAG_LABEL = '[FACE]';

/**
 * Every label this module can produce. `seal()` rejects any drawn label that does not match, so
 * the closed vocabulary is enforced at the firewall and not merely by convention here.
 *
 * Three alternatives, and nothing else:
 *   `[AADHAAR]`            category only (blocked values, and tokenized values with no room)
 *   `[EMAIL#k3f7qa2b]`     category + the 8-char ID of a token already in the sealed payload
 *   `[IMAGE — not checked]`/`[FACE]`   the two fixed constants above
 */
export const MASK_LABEL_PATTERN = new RegExp(
  `^(?:\\[[A-Z][A-Z_]*(?:#[a-z2-7]{8})?\\]|${escapeLiteral(UNSCANNED_MEDIA_LABEL)}|${escapeLiteral(FACE_TAG_LABEL)})$`,
);

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_SET: ReadonlySet<string> = new Set<string>(ALL_CATEGORIES);
const EXACT_TOKEN = new RegExp(`^${TOKEN_PATTERN.source}$`);

/**
 * The token's ID — the 8 base32 characters the server sees in the text payload — or null when the
 * string is not exactly a token, or is a token for a DIFFERENT category than the mask claims.
 *
 * The type-agreement check matters: it is what stops a mask for one category being labelled with
 * another category's token and quietly asserting a link that the payload does not contain.
 */
export function tokenIdFor(type: Category, token: string | undefined): string | null {
  if (!token || !EXACT_TOKEN.test(token)) return null;
  const [, tokenType, id] = token.slice(2, -2).split(':');
  if (tokenType !== type || !id) return null;
  return id;
}

/**
 * The label for a mask, or null for no label at all.
 *
 * Fail-closed at every step: an unrecognized category yields null, a bad token degrades to the
 * category-only form rather than being rendered, and the finished string is re-checked against
 * `MASK_LABEL_PATTERN` before it is returned. A caller cannot get a label out of this function
 * that the firewall would later reject.
 */
export function buildMaskLabel(type: Category, token?: string): string | null {
  if (!CATEGORY_SET.has(type)) return null;
  if (type === 'UNSCANNED_MEDIA') return UNSCANNED_MEDIA_LABEL;

  const id = tokenIdFor(type, token);
  const label = id ? `[${type}#${id}]` : `[${type}]`;
  return MASK_LABEL_PATTERN.test(label) ? label : null;
}

/** The category-only fallback, used when the full label does not fit the mask box (never a
 * truncation of the full label — a cut-off string is not in the vocabulary). */
export function categoryOnlyLabel(type: Category): string | null {
  if (!CATEGORY_SET.has(type)) return null;
  if (type === 'UNSCANNED_MEDIA') return UNSCANNED_MEDIA_LABEL;
  const label = `[${type}]`;
  return MASK_LABEL_PATTERN.test(label) ? label : null;
}
