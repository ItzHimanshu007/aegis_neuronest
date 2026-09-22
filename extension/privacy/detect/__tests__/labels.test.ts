import { describe, expect, it } from 'vitest';
import { isSecretLabel, matchLabelCategories, normalizeLabel, matchLabels } from '../labels';

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

  it('flags a password label even if the page mislabels its input type', () => {
    expect(isSecretLabel('Password')).toBe(true);
  });

  it('does not flag ordinary labels', () => {
    expect(isSecretLabel('Full name')).toBe(false);
    expect(isSecretLabel('Email address')).toBe(false);
  });

  it('does not false-positive on unrelated text containing similar substrings', () => {
    expect(isSecretLabel('Photographer')).toBe(false); // contains no OTP/CVV/UPI PIN word
  });
});

describe('labels that name a person rather than the thing they belong to', () => {
  // The Stage 2.5 baseline's single false negative: a <th>Account holder</th><td>Asha Verma</td>
  // row matched no label at all, so its value was never classified (Stage 3A Part A4).
  it.each(['Account holder', 'Account Holder Name', 'Cardholder', 'Card holder name', 'Beneficiary name', 'खाताधारक'])(
    '%s names a NAME',
    (label) => expect(matchLabelCategories(label)).toContain('NAME'),
  );

  it.each(['Account number', 'Bank account', 'खाता संख्या'])('%s is still the account itself', (label) =>
    expect(matchLabelCategories(label)).toContain('BANK_ACCOUNT'));

  it('does not let the account-holder phrases claim a plain account label', () => {
    expect(matchLabelCategories('Account number')).not.toContain('NAME');
  });
});

describe('Stage 7: generic head-noun tie-break', () => {
  // Stage 4 held-out reported three CITY values as NAME and one UPI_ID as ADDRESS. Both were
  // equal-length phrase ties resolved by dictionary order. The qualifier carries the category.
  it.each([
    ['City name', 'CITY'],
    ['Town / city', 'CITY'],
    ['District / city', 'CITY'],
    ['UPI address', 'UPI_ID'],
    ['Company name', 'EMPLOYER'],
  ])('%s resolves to %s, not the generic head noun', (label, expected) => {
    expect(matchLabelCategories(label)[0]).toBe(expected);
  });

  it.each([
    ['Account holder name', 'NAME'],
    ['Registered name', 'NAME'],
    ['Email address', 'EMAIL'],
    ['Residential address', 'ADDRESS'],
    ['Card number', 'CARD_NUMBER'],
    ['Bank account no.', 'BANK_ACCOUNT'],
    ['Order number', 'ORDER_ID'],
    ['PIN code', 'PIN_CODE'],
    ['Security code', 'CVV'],
  ])('%s is unchanged and still resolves to %s', (label, expected) => {
    expect(matchLabelCategories(label)[0]).toBe(expected);
  });

  it('prefers the more specific phrase over a shorter one in the same label', () => {
    expect(matchLabelCategories('Permanent account number')[0]).toBe('PAN');
  });

  it('matchLabels reports the matched phrase length, most specific first', () => {
    const [best] = matchLabels('Permanent account number');
    expect(best).toEqual({ category: 'PAN', phraseLength: 'permanent account number'.length });
  });
});
