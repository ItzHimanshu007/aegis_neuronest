import { describe, expect, it } from 'vitest';
import { computeLuhnCheckDigit, computeVerhoeffCheckDigit } from '../../rules/checksums';
import { findShapes } from '../shapes';

/** Synthetic, never a real identifier — same practice as rules.test.ts. */
const aadhaar = (base: string) => base + computeVerhoeffCheckDigit(base);
const card = (base: string) => base + computeLuhnCheckDigit(base);

function categories(text: string): string[] {
  return findShapes(text).map((s) => s.category);
}

describe('findShapes — intrinsic, label-free', () => {
  it('finds a currency amount with no label at all', () => {
    const [hit] = findShapes('₹18,948.52');
    expect(hit).toMatchObject({ category: 'FINANCIAL_VALUE', strength: 'structured', matchedText: '₹18,948.52' });
  });

  it.each(['Rs 4,533.00', 'INR 900', '₹9,503.00'])('finds currency in %s', (text) => {
    expect(categories(text)).toContain('FINANCIAL_VALUE');
  });

  it('finds a voter-ID shape with no label', () => {
    const [hit] = findShapes('ABC1234567');
    expect(hit).toMatchObject({ category: 'VOTER_ID', strength: 'structured' });
  });

  it('finds an account-length digit run as weak evidence only', () => {
    const [hit] = findShapes('5853936029031980');
    expect(hit).toMatchObject({ category: 'BANK_ACCOUNT', strength: 'weak' });
  });

  it('reports a Verhoeff-FAILING 12-digit run as a UAN with a failed checksum', () => {
    const invalid = '735547520627';
    const hit = findShapes(invalid).find((s) => s.category === 'UAN');
    expect(hit).toMatchObject({ strength: 'weak', checksum: 'fail' });
  });

  it('leaves a Verhoeff-VALID 12-digit run to the existing unconditional aadhaarRule', () => {
    // Stage 4 measured AADHAAR recall 1.000. This layer must not touch that path.
    expect(categories(aadhaar('23456789012'))).not.toContain('UAN');
    expect(categories(aadhaar('23456789012'))).not.toContain('AADHAAR');
  });

  it('leaves a Luhn-VALID card number to the existing unconditional cardNumberRule', () => {
    expect(categories(card('455673100000000'))).not.toContain('BANK_ACCOUNT');
  });

  it('finds a PIN-code shape but only as weak evidence', () => {
    expect(findShapes('560001')[0]).toMatchObject({ category: 'PIN_CODE', strength: 'weak' });
  });

  it('does not treat a 6-digit run starting with 0 as a PIN code', () => {
    expect(categories('012345')).not.toContain('PIN_CODE');
  });

  it.each(['14/03/1988', '1988-03-14', '14 Mar 1988'])('finds the date shape in %s', (text) => {
    expect(categories(text)).toContain('DATE');
  });

  it('finds a Bearer token as self-describing', () => {
    const [hit] = findShapes('Bearer abcdef0123456789ABCDEF0123456789');
    expect(hit).toMatchObject({ category: 'SECRET', strength: 'self_describing' });
  });

  it('finds a long opaque token as structured, not self-describing', () => {
    const hit = findShapes('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6').find((s) => s.category === 'SECRET');
    expect(hit!.strength).toBe('structured');
  });

  it('does not call an all-letter or all-digit run an opaque token', () => {
    expect(categories('abcdefghijklmnopqrstuvwxyzabcdef')).not.toContain('SECRET');
  });

  it.each(['', 'Please contact the branch if any of these details need correcting'])(
    'finds nothing in ordinary prose (%s)',
    (text) => expect(findShapes(text)).toEqual([]),
  );
});
