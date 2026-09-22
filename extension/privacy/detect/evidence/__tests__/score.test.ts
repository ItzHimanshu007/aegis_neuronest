import { describe, expect, it } from 'vitest';
import { scoreCandidate, verdictFor } from '../score';
import { findShapes } from '../shapes';
import type { Candidate, CandidateContext, ShapeHint } from '../types';

function candidate(text: string, context: CandidateContext = {}, pick?: (s: ShapeHint) => boolean): Candidate {
  const shapes = findShapes(text);
  const shape = pick ? shapes.find(pick)! : shapes[0]!;
  expect(shape, `no shape found in ${text}`).toBeTruthy();
  return { value: shape.matchedText, shape, context };
}

describe('verdictFor — the documented thresholds', () => {
  it.each([
    [6, 'DETECTED'],
    [5, 'DETECTED'],
    [4, 'UNCERTAIN'],
    [3, 'UNCERTAIN'],
    [2, 'NOT_DETECTED'],
    [0, 'NOT_DETECTED'],
    [-6, 'NOT_DETECTED'],
  ])('score %i is %s', (score, expected) => expect(verdictFor(score)).toBe(expected));
});

describe('no single weak signal can reach UNCERTAIN alone', () => {
  it.each([
    ['5853936029031980', 'a bare account-length digit run'],
    ['560001', 'a bare six-digit run'],
  ])('%s (%s) is NOT_DETECTED with no corroboration', (text) => {
    expect(scoreCandidate(candidate(text)).verdict).toBe('NOT_DETECTED');
  });
});

describe('Stage 7D — the committed train corpus negatives stay negative', () => {
  // demo-portal/generated/train/banking-101.html, section "Recent reference numbers".
  // Every one of these is annotated data-gt="NONE" and must not be redacted.
  it('a Verhoeff-invalid 12-digit batch number under a reference heading', () => {
    const result = scoreCandidate(candidate('735547520627', { containerText: 'Recent reference numbers' }, (s) => s.category === 'UAN'));
    expect(result.verdict).toBe('NOT_DETECTED');
    expect(result.signals.map((s) => s.name)).toEqual(
      expect.arrayContaining(['checksum_fail_definitional', 'non_pii_container']),
    );
  });

  it('a plain price under a reference heading', () => {
    expect(scoreCandidate(candidate('₹4533.00', { containerText: 'Recent reference numbers' })).verdict).toBe('NOT_DETECTED');
  });

  it('a SKU is rejected by shape even with no container help', () => {
    const shape: ShapeHint = { category: 'SECRET', strength: 'structured', start: 0, matchedText: 'SKU-2027-788' };
    const result = scoreCandidate({ value: 'SKU-2027-788', shape, context: {} });
    expect(result.verdict).toBe('NOT_DETECTED');
    expect(result.signals.map((s) => s.name)).toContain('non_pii_shape');
  });

  it('a value repeated down a catalogue column is damped', () => {
    const withRepeat = scoreCandidate(candidate('₹18,948.52', { containerCategory: 'FINANCIAL_VALUE', repeatCount: 4 }));
    const without = scoreCandidate(candidate('₹18,948.52', { containerCategory: 'FINANCIAL_VALUE' }));
    expect(without.score).toBeGreaterThan(withRepeat.score);
  });

  it('a search query is damped', () => {
    expect(scoreCandidate(candidate('560001', { boundLabelCategory: 'PIN_CODE', inSearchScope: true })).score)
      .toBeLessThan(scoreCandidate(candidate('560001', { boundLabelCategory: 'PIN_CODE' })).score);
  });
});

describe('Stage 7A/7C — label-independent detection', () => {
  it('a currency amount under an account heading is DETECTED with no dictionary label', () => {
    // "Amount payable" is NOT in LABEL_DICTIONARY. This is the FINANCIAL_VALUE gap Stage 4 found.
    const result = scoreCandidate(candidate('₹18,948.52', { containerCategory: 'FINANCIAL_VALUE' }));
    expect(result.verdict).toBe('DETECTED');
    expect(result.category).toBe('FINANCIAL_VALUE');
  });

  it('a voter-ID shape with no label at all is UNCERTAIN, so it is masked but not claimed', () => {
    const result = scoreCandidate(candidate('ABC1234567'));
    expect(result.verdict).toBe('UNCERTAIN');
    expect(result.category).toBe('VOTER_ID');
  });

  it('a bound label lifts a weak digit run to DETECTED', () => {
    const result = scoreCandidate(candidate('5853936029031980', { boundLabelCategory: 'BANK_ACCOUNT', containerCategory: 'BANK_ACCOUNT' }));
    expect(result.verdict).toBe('DETECTED');
    expect(result.category).toBe('BANK_ACCOUNT');
  });

  it('a bound label overrides the shape category', () => {
    // A 12-digit run that fails Verhoeff, in a field labelled UAN, is a UAN and not a bank account.
    const result = scoreCandidate(candidate('735547520627', { boundLabelCategory: 'UAN' }, (s) => s.category === 'UAN'));
    expect(result.category).toBe('UAN');
  });

  it('autocomplete alone corroborates an otherwise weak shape', () => {
    const result = scoreCandidate(candidate('560001', { autocompleteCategory: 'PIN_CODE', inputType: 'number' }));
    expect(result.verdict).not.toBe('NOT_DETECTED');
  });

  it('input semantics only count when the type actually agrees', () => {
    const agrees = scoreCandidate(candidate('₹18,948.52', { inputType: 'number', containerCategory: 'FINANCIAL_VALUE' }));
    const neutral = scoreCandidate(candidate('₹18,948.52', { inputType: 'text', containerCategory: 'FINANCIAL_VALUE' }));
    expect(agrees.score).toBeGreaterThan(neutral.score);
  });

  it('a self-describing Bearer token is DETECTED on its own', () => {
    expect(scoreCandidate(candidate('Bearer abcdef0123456789ABCDEF0123456789')).verdict).toBe('DETECTED');
  });

  it('an opaque token that looks like a username is damped', () => {
    const shape: ShapeHint = { category: 'SECRET', strength: 'structured', start: 0, matchedText: 'asha_verma1' };
    expect(scoreCandidate({ value: 'asha_verma1', shape, context: {} }).verdict).toBe('NOT_DETECTED');
  });

  it('negative evidence argues but never overrules a checksum plus a label', () => {
    const shape: ShapeHint = { category: 'AADHAAR', strength: 'structured', start: 0, matchedText: '2234 5678 9012', checksum: 'pass' };
    const result = scoreCandidate({ value: '2234 5678 9012', shape, context: { boundLabelCategory: 'AADHAAR', containerText: 'Order summary' } });
    expect(result.verdict).toBe('DETECTED');
  });
});

describe('Stage 7H — every verdict explains itself', () => {
  it('carries the signals that produced it', () => {
    const result = scoreCandidate(candidate('₹18,948.52', { containerCategory: 'FINANCIAL_VALUE' }));
    expect(result.signals.map((s) => s.name)).toEqual(['structured_shape', 'container_label']);
    expect(result.score).toBe(result.signals.reduce((t, s) => t + s.points, 0));
  });
});

describe('confidence stays on the pipeline scale', () => {
  it('DETECTED lands at or above IDENTITY_MIN_CONF and UNCERTAIN below it', () => {
    expect(scoreCandidate(candidate('₹18,948.52', { containerCategory: 'FINANCIAL_VALUE' })).confidence).toBeGreaterThanOrEqual(0.6);
    expect(scoreCandidate(candidate('ABC1234567')).confidence).toBeLessThan(0.6);
  });
});
