import { describe, expect, it } from 'vitest';
import { computeLuhnCheckDigit, computeVerhoeffCheckDigit, isLuhnValid, isVerhoeffValid } from '../checksums';

describe('Verhoeff', () => {
  it('validates the well-known public test vector 2363', () => {
    expect(isVerhoeffValid('2363')).toBe(true);
  });

  it('rejects a single-digit alteration of a valid number', () => {
    expect(isVerhoeffValid('2362')).toBe(false);
  });

  it('rejects non-digit input', () => {
    expect(isVerhoeffValid('236a')).toBe(false);
  });

  it('computeVerhoeffCheckDigit generates a digit that isVerhoeffValid accepts', () => {
    // Synthetic 11-digit base (never a real Aadhaar) + generated check digit = valid 12 digits.
    for (const base of ['23456789012', '99999999999', '20000000001']) {
      const check = computeVerhoeffCheckDigit(base);
      expect(isVerhoeffValid(base + check)).toBe(true);
    }
  });

  it('generated valid numbers become invalid if the check digit is altered', () => {
    const base = '23456789012';
    const check = computeVerhoeffCheckDigit(base);
    const wrongCheck = (check + 1) % 10;
    expect(isVerhoeffValid(base + wrongCheck)).toBe(false);
  });
});

describe('Luhn', () => {
  it('validates the well-known Visa test PAN 4111111111111111', () => {
    expect(isLuhnValid('4111111111111111')).toBe(true);
  });

  it('rejects a single-digit alteration', () => {
    expect(isLuhnValid('4111111111111112')).toBe(false);
  });

  it('validates the well-known Mastercard test PAN 5555555555554444', () => {
    expect(isLuhnValid('5555555555554444')).toBe(true);
  });

  it('computeLuhnCheckDigit generates a digit that isLuhnValid accepts', () => {
    for (const base of ['411111111111111', '555555555555444']) {
      const check = computeLuhnCheckDigit(base);
      expect(isLuhnValid(base + check)).toBe(true);
    }
  });

  it('rejects non-digit input', () => {
    expect(isLuhnValid('4111-1111-1111-1111')).toBe(false);
  });
});
