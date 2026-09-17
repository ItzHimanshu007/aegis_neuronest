/**
 * Checksum algorithms used by the detection cascade's rule layer (Stage 2 Part C.3). Both take a
 * digits-only string (callers strip spaces/hyphens first) and are pure/side-effect-free so they're
 * trivially unit-testable with known-valid and known-invalid numbers.
 */

/** Verhoeff checksum — used for Aadhaar (12 digits, last digit is the check digit). */
const VERHOEFF_D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV_TABLE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** True if `digits` (a string of decimal digits, no separators) passes the Verhoeff checksum. */
export function isVerhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = Number(reversed[i]);
    c = VERHOEFF_D_TABLE[c]![VERHOEFF_P_TABLE[i % 8]![digit]!]!;
  }
  return c === 0;
}

/** Generates a valid Verhoeff check digit for `digitsWithoutCheck` (used only by tests, to
 * synthesize valid *and* invalid synthetic test numbers without ever hardcoding a real ID). */
export function computeVerhoeffCheckDigit(digitsWithoutCheck: string): number {
  let c = 0;
  const reversed = digitsWithoutCheck.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = Number(reversed[i]);
    c = VERHOEFF_D_TABLE[c]![VERHOEFF_P_TABLE[(i + 1) % 8]![digit]!]!;
  }
  return VERHOEFF_INV_TABLE[c]!;
}

/** Luhn checksum — used for card numbers (13-19 digits). */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** Generates a valid Luhn check digit for `digitsWithoutCheck` (test synthesis only). */
export function computeLuhnCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  let alternate = true; // the check digit position is "even" from the right once appended
  for (let i = digitsWithoutCheck.length - 1; i >= 0; i--) {
    let d = Number(digitsWithoutCheck[i]);
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return (10 - (sum % 10)) % 10;
}
