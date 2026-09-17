import { describe, expect, it } from 'vitest';
import { aadhaarRule } from '../aadhaar';
import { panRule } from '../pan';
import { cardNumberRule } from '../cardNumber';
import { emailRule } from '../email';
import { upiIdRule } from '../upiId';
import { phoneRule } from '../phone';
import { ifscRule } from '../ifsc';
import { vehicleRegRule } from '../vehicleReg';
import { secretRule } from '../secret';
import { bankAccountRule, dateRule, financialValueRule, orderIdRule, otpRule, pinCodeRule } from '../contextOnly';
import { runRules } from '../index';
import { computeVerhoeffCheckDigit } from '../checksums';

function makeValidAadhaar(base11: string): string {
  return base11 + computeVerhoeffCheckDigit(base11);
}

describe('aadhaarRule', () => {
  const valid = makeValidAadhaar('23456789012'); // synthetic, not a real number
  it('matches a valid unspaced Aadhaar', () => {
    expect(aadhaarRule.find(valid, {})).toHaveLength(1);
  });
  it('matches a valid spaced Aadhaar', () => {
    const spaced = `${valid.slice(0, 4)} ${valid.slice(4, 8)} ${valid.slice(8)}`;
    expect(aadhaarRule.find(spaced, {})).toHaveLength(1);
  });
  it('rejects a checksum-invalid 12-digit number', () => {
    const invalid = valid.slice(0, 11) + ((Number(valid[11]) + 1) % 10);
    expect(aadhaarRule.find(invalid, {})).toHaveLength(0);
  });
  it('rejects a number starting with 0 or 1', () => {
    expect(aadhaarRule.find('0' + valid.slice(1), {})).toHaveLength(0);
  });
  it('matches a masked Aadhaar at lower confidence', () => {
    const matches = aadhaarRule.find('XXXX XXXX 1234', {});
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBeLessThan(0.8);
  });
  it('does not match an unrelated 12-digit number sequence with no valid checksum', () => {
    expect(aadhaarRule.find('234567890128', {})).toHaveLength(0);
  });
});

describe('panRule', () => {
  it('matches a well-formed PAN', () => {
    expect(panRule.find('ABCPE1234F', {})).toHaveLength(1);
  });
  it('rejects a PAN with an invalid 4th character', () => {
    expect(panRule.find('ABCXE1234F', {})).toHaveLength(0);
  });
  it('rejects a lowercase PAN', () => {
    expect(panRule.find('abcpe1234f', {})).toHaveLength(0);
  });
  it('does not match a random 10-char alphanumeric string', () => {
    expect(panRule.find('AB12345678', {})).toHaveLength(0);
  });
});

describe('cardNumberRule', () => {
  it('matches a Luhn-valid Visa test number', () => {
    expect(cardNumberRule.find('4111 1111 1111 1111', {})).toHaveLength(1);
  });
  it('matches a Luhn-valid Mastercard test number', () => {
    expect(cardNumberRule.find('5555555555554444', {})).toHaveLength(1);
  });
  it('rejects a Luhn-invalid number even with a valid-looking prefix', () => {
    expect(cardNumberRule.find('4111111111111112', {})).toHaveLength(0);
  });
  it('rejects a Luhn-valid number with no known IIN prefix', () => {
    // 1234567890123452 is Luhn-valid (deliberately constructed) but starts with 1, no card network.
    expect(cardNumberRule.find('1234567890123452', {})).toHaveLength(0);
  });
});

describe('emailRule', () => {
  it('matches a plain email', () => {
    expect(emailRule.find('contact me at asha.verma@example.com please', {})).toHaveLength(1);
  });
  it('matches an email with a plus tag', () => {
    expect(emailRule.find('asha+work@example.co.in', {})).toHaveLength(1);
  });
  it('does not match a bare word with an @ but no valid domain', () => {
    expect(emailRule.find('reply @ me', {})).toHaveLength(0);
  });
});

describe('upiIdRule', () => {
  it('matches a UPI id with a known PSP handle at high confidence', () => {
    const matches = upiIdRule.find('pay to asha@oksbi now', {});
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBeGreaterThan(0.8);
  });
  it('matches an unknown-PSP UPI-shaped id at lower confidence', () => {
    const matches = upiIdRule.find('asha@randomvpa', {});
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBeLessThan(0.8);
  });
  it('does NOT steal a plain email address', () => {
    expect(upiIdRule.find('asha.verma@example.com', {})).toHaveLength(0);
  });
  it('does NOT steal an email whose first domain label looks like a PSP handle', () => {
    expect(upiIdRule.find('user@oksbi.example.com', {})).toHaveLength(0);
  });
});

describe('phoneRule', () => {
  it('matches a 10-digit mobile number', () => {
    expect(phoneRule.find('9876543210', {})).toHaveLength(1);
  });
  it('matches with +91 prefix and spacing', () => {
    expect(phoneRule.find('+91 98765 43210', {})).toHaveLength(1);
  });
  it('does not match a number starting with 0-5', () => {
    expect(phoneRule.find('5876543210', {})).toHaveLength(0);
  });
});

describe('ifscRule', () => {
  it('matches a well-formed IFSC code', () => {
    expect(ifscRule.find('HDFC0001234', {})).toHaveLength(1);
  });
  it('rejects a code without the literal 0 in position 5', () => {
    expect(ifscRule.find('HDFC1001234', {})).toHaveLength(0);
  });
});

describe('vehicleRegRule', () => {
  it('matches a standard state-code registration', () => {
    expect(vehicleRegRule.find('KA05MH1234', {})).toHaveLength(1);
  });
  it('matches a BH-series registration', () => {
    expect(vehicleRegRule.find('23BH1234AB', {})).toHaveLength(1);
  });
});

describe('secretRule', () => {
  it('matches a GitHub token prefix', () => {
    expect(secretRule.find('token: ghp_abcdefghijklmnopqrstuvwxyz0123456789', {})).toHaveLength(1);
  });
  it('matches an AWS access key prefix', () => {
    expect(secretRule.find('AKIAABCDEFGHIJKLMNOP', {})).toHaveLength(1);
  });
  it('matches a JWT-shaped string', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ_dQw4w9WgXcQ';
    expect(secretRule.find(jwt, {})).toHaveLength(1);
  });
  it('does NOT flag a high-entropy-looking string without a secret field-context', () => {
    expect(secretRule.find('aB3xK9mQ2pL7vR4wZ8nY1tU6sD0', {})).toHaveLength(0);
  });
  it('DOES flag a high-entropy string when the field-context says SECRET', () => {
    const matches = secretRule.find('aB3xK9mQ2pL7vR4wZ8nY1tU6sD0', { fieldCategory: 'SECRET' });
    expect(matches.length).toBeGreaterThan(0);
  });
  it('does not flag ordinary English prose even with SECRET field-context', () => {
    expect(secretRule.find('please enter your key here', { fieldCategory: 'SECRET' })).toHaveLength(0);
  });
});

describe('context-only rules', () => {
  it('bankAccountRule only fires with BANK_ACCOUNT context', () => {
    expect(bankAccountRule.find('123456789012', {})).toHaveLength(0);
    expect(bankAccountRule.find('123456789012', { fieldCategory: 'BANK_ACCOUNT' })).toHaveLength(1);
  });
  it('otpRule only fires with OTP context', () => {
    expect(otpRule.find('123456', {})).toHaveLength(0);
    expect(otpRule.find('123456', { fieldCategory: 'OTP' })).toHaveLength(1);
  });
  it('pinCodeRule only fires with PIN_CODE context', () => {
    expect(pinCodeRule.find('560001', {})).toHaveLength(0);
    expect(pinCodeRule.find('560001', { fieldCategory: 'PIN_CODE' })).toHaveLength(1);
  });
  it('orderIdRule only fires with ORDER_ID context', () => {
    expect(orderIdRule.find('ORD-98212', {})).toHaveLength(0);
    expect(orderIdRule.find('ORD-98212', { fieldCategory: 'ORDER_ID' })).toHaveLength(1);
  });
  it('dateRule only fires with DATE/DOB context', () => {
    expect(dateRule.find('12/03/1994', {})).toHaveLength(0);
    expect(dateRule.find('12/03/1994', { fieldCategory: 'DOB' })).toHaveLength(1);
    expect(dateRule.find('12 March 1994', { fieldCategory: 'DATE' })).toHaveLength(1);
  });
  it('financialValueRule only fires with FINANCIAL_VALUE context', () => {
    expect(financialValueRule.find('₹42,318.00', {})).toHaveLength(0);
    expect(financialValueRule.find('₹42,318.00', { fieldCategory: 'FINANCIAL_VALUE' })).toHaveLength(1);
  });
});

describe('runRules (cascade over all rules)', () => {
  it('combines unconditional matches without needing context', () => {
    const matches = runRules('email me at asha@example.com or call 9876543210', {});
    const categories = matches.map((m) => m.category);
    expect(categories).toContain('EMAIL');
    expect(categories).toContain('PHONE');
  });

  it('does not run a context-only rule without matching context', () => {
    const matches = runRules('560001', {});
    expect(matches).toHaveLength(0);
  });

  it('runs a context-only rule when context matches', () => {
    const matches = runRules('560001', { fieldCategory: 'PIN_CODE' });
    expect(matches.map((m) => m.category)).toContain('PIN_CODE');
  });
});

describe('false-positive corpus', () => {
  // Stage 2 Part C.3: "prices, years, timestamps, version strings, order numbers without labels,
  // phone-like product codes." None of these should trigger any UNCONDITIONAL rule (context-only
  // rules are, by construction, never run without a matching field context, so they're excluded
  // from this corpus check — that's exactly what makes them safe).
  const benignStrings = [
    '2026',
    '1999-2026',
    '12:34:56',
    '2026-09-17T12:34:56Z',
    'v2.14.3',
    'v10.6.0-beta.2',
    'Model X-9000',
    'SKU-2024-991',
    'Product #4521',
    'Page 42 of 108',
    '100% complete',
    'Room 204B',
    'Chapter 7',
    'ISBN 978-3-16-148410-0',
    'localhost:8000',
    '192.168.1.1',
    'lorem ipsum dolor sit amet',
    'The quick brown fox jumps over the lazy dog',
  ];

  let falsePositiveCount = 0;
  const details: string[] = [];

  for (const text of benignStrings) {
    it(`"${text}" triggers no unconditional rule`, () => {
      const matches = runRules(text, {});
      if (matches.length > 0) {
        falsePositiveCount += matches.length;
        details.push(`"${text}" -> ${matches.map((m) => `${m.category}(${m.matchedText})`).join(', ')}`);
      }
      expect(matches, `false positives: ${JSON.stringify(matches)}`).toHaveLength(0);
    });
  }

  it('reports the total false-positive count for the corpus', () => {
    // This always passes — it exists to print the count/detail to the report, per Stage 2's
    // "Report the false-positive count" instruction.
    if (falsePositiveCount > 0) {
      console.log(`False-positive corpus: ${falsePositiveCount} false positive(s):\n${details.join('\n')}`);
    } else {
      console.log('False-positive corpus: 0 false positives across', benignStrings.length, 'benign strings');
    }
    expect(true).toBe(true);
  });
});
