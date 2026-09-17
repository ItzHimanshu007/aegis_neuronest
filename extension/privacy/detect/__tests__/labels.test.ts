import { describe, expect, it } from 'vitest';
import { isSecretLabel, matchLabelCategories, normalizeLabel } from '../labels';

describe('normalizeLabel', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeLabel("  Father's Name:  ")).toBe('father s name');
  });
});

describe('matchLabelCategories (English)', () => {
  const cases: Array<[string, string]> = [
    ['Full name', 'NAME'],
    ["Father's Name", 'NAME'],
    ['Email address', 'EMAIL'],
    ['Mobile number', 'PHONE'],
    ['Date of Birth', 'DOB'],
    ['Address', 'ADDRESS'],
    ['City', 'CITY'],
    ['PIN Code', 'PIN_CODE'],
    ['Aadhaar Number', 'AADHAAR'],
    ['PAN', 'PAN'],
    ['Account Number', 'BANK_ACCOUNT'],
    ['IFSC Code', 'IFSC'],
    ['UPI ID', 'UPI_ID'],
    ['Balance', 'FINANCIAL_VALUE'],
    ['Employer', 'EMPLOYER'],
    ['OTP', 'OTP'],
    ['CVV', 'CVV'],
    ['UPI PIN', 'UPI_PIN'],
    ['Password', 'PASSWORD'],
    ['Blood Group', 'HEALTH'],
    ['Vehicle Number', 'VEHICLE_REG'],
    ['Order ID', 'ORDER_ID'],
  ];

  for (const [label, expectedCategory] of cases) {
    it(`"${label}" matches ${expectedCategory}`, () => {
      expect(matchLabelCategories(label)).toContain(expectedCategory);
    });
  }
});

describe('matchLabelCategories (Hindi)', () => {
  const cases: Array<[string, string]> = [
    ['नाम', 'NAME'],
    ['पिता का नाम', 'NAME'],
    ['ई-मेल', 'EMAIL'],
    ['मोबाइल', 'PHONE'],
    ['जन्म तिथि', 'DOB'],
    ['पता', 'ADDRESS'],
    ['शहर', 'CITY'],
    ['पिन कोड', 'PIN_CODE'],
    ['आधार', 'AADHAAR'],
    ['खाता संख्या', 'BANK_ACCOUNT'],
    ['शेष राशि', 'FINANCIAL_VALUE'],
    ['नियोक्ता', 'EMPLOYER'],
    ['पासवर्ड', 'PASSWORD'],
  ];

  for (const [label, expectedCategory] of cases) {
    it(`"${label}" matches ${expectedCategory}`, () => {
      expect(matchLabelCategories(label)).toContain(expectedCategory);
    });
  }
});

describe('matching is case-, whitespace- and punctuation-insensitive', () => {
  it('matches regardless of case', () => {
    expect(matchLabelCategories('EMAIL ADDRESS')).toContain('EMAIL');
    expect(matchLabelCategories('email address')).toContain('EMAIL');
  });

  it('matches with extra whitespace and punctuation', () => {
    expect(matchLabelCategories('  Email   Address:  ')).toContain('EMAIL');
    expect(matchLabelCategories('(Email Address)')).toContain('EMAIL');
  });
});

describe('isSecretLabel (Stage 2 Part A1)', () => {
  it('flags OTP, CVV, UPI PIN labels', () => {
    expect(isSecretLabel('One Time Password')).toBe(true);
    expect(isSecretLabel('CVV')).toBe(true);
    expect(isSecretLabel('UPI PIN')).toBe(true);
    expect(isSecretLabel('MPIN')).toBe(true);
  });

  it('does not flag PASSWORD (handled separately via input type, not via this guard)', () => {
    expect(isSecretLabel('Password')).toBe(false);
  });

  it('does not flag ordinary labels', () => {
    expect(isSecretLabel('Full name')).toBe(false);
    expect(isSecretLabel('Email address')).toBe(false);
  });

  it('does not false-positive on unrelated text containing similar substrings', () => {
    expect(isSecretLabel('Photographer')).toBe(false); // contains no OTP/CVV/UPI PIN word
  });
});
