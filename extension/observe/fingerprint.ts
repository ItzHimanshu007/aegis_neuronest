/**
 * Element fingerprinting (`fp`). Stable across class-name churn, re-renders and small layout
 * shifts, because it never looks at position, size, styles, or generated ids/classes — only at
 * the element's semantic identity (role, name, tag, form context).
 *
 * cyrb53 is a small, fast, non-cryptographic string hash (public domain, by bryc). We don't need
 * collision resistance against an adversary here — token-like or malicious page content is
 * handled by the privacy layer (Stage 2), not by this hash — we need speed and a good spread for
 * a few hundred elements per page.
 */

/** cyrb53: https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js (public domain). */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // Combine into a single 53-bit-safe number.
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Lowercases, collapses whitespace, and maps digit runs to '#' so "Item 12" and "Item 47" hash
 * the same way (an index/count changing shouldn't change identity). */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, '#');
}

export interface FingerprintInput {
  role: string;
  name: string;
  tag: string;
  inputType?: string;
  autocomplete?: string;
  nameAttr?: string;
  /** tag + role + accessible name of the nearest landmark/form ancestor, or '' if none. */
  ancestorSignature: string;
  labelText?: string;
}

const FP_ALPHABET = '0123456789abcdef';
/** Field separator that cannot appear in any of the normalized input fields. */
const SEP = '\x01';

/** Builds the canonical string that gets hashed. Exported so tests can assert on it directly
 * without re-deriving the hash. */
export function buildFingerprintKey(input: FingerprintInput): string {
  return [
    input.role,
    normalizeName(input.name),
    input.tag,
    input.inputType ?? '',
    input.autocomplete ?? '',
    input.nameAttr ?? '',
    input.ancestorSignature,
    normalizeName(input.labelText ?? ''),
  ].join(SEP);
}

/** Computes an 8-lowercase-hex-character fingerprint. `salt` is the per-session random salt
 * (see extension/shared/permissions.ts callers / background salt generation) — it makes
 * fingerprints unlinkable across sessions/users without changing their stability *within* one
 * session. */
export function computeFingerprint(input: FingerprintInput, salt: string, hexLength = 8): string {
  const key = buildFingerprintKey(input);
  const hash = cyrb53(key, cyrb53(salt));
  // hash is < 2^53; take the low `hexLength * 4` bits and render as hex, zero-padded.
  const hex = hash.toString(16).padStart(14, '0');
  return hex.slice(-hexLength).padStart(hexLength, FP_ALPHABET[0]);
}

export interface Ordinalizable {
  fp: string;
}

/**
 * Assigns `fpOrdinal` to every element, in document order, per distinct `fp` value. Elements are
 * expected to already be in document order (top-level frame first, then child frames in the
 * order their <iframe> appears, each internally in document order — see observe/frames.ts).
 * Mutates and returns the same array for convenience.
 */
export function assignFpOrdinals<T extends Ordinalizable>(elements: T[]): (T & { fpOrdinal: number })[] {
  const counters = new Map<string, number>();
  return elements.map((el) => {
    const next = counters.get(el.fp) ?? 0;
    counters.set(el.fp, next + 1);
    return Object.assign(el, { fpOrdinal: next });
  });
}
