/**
 * The single source of truth for the PII token pattern. Mirrored in server/app/schemas/tokens.py
 * — a test proves the two agree. See AGENTS.md invariant 3.
 *
 * Token shape: [[PII:<TYPE>:<8 chars base32 lowercase a-z2-7>]]
 */
export const TOKEN_PATTERN = /\[\[PII:[A-Z_]+:[a-z2-7]{8}\]\]/;

/** Global-flag variant for use with matchAll/replaceAll. Do not mutate; create fresh via `new RegExp`. */
export const TOKEN_PATTERN_GLOBAL = new RegExp(TOKEN_PATTERN.source, 'g');

export function isToken(value: string): boolean {
  return new RegExp(`^${TOKEN_PATTERN.source}$`).test(value);
}
