import { describe, expect, it } from 'vitest';
import { isNonPiiContainer, matchesNonPiiShape, negativeSignals } from '../negative';
import type { ShapeHint } from '../types';

const shape = (over: Partial<ShapeHint> = {}): ShapeHint =>
  ({ category: 'BANK_ACCOUNT', strength: 'weak', start: 0, matchedText: '123456789012345', ...over });

describe('matchesNonPiiShape', () => {
  it.each(['SKU-2027-788', '2026-09-21T10:30:00', 'v1.2.3', '#3a7bd5', '42%', '1920x1080', '4.5 MB'])(
    '%s is a non-PII shape',
    (value) => expect(matchesNonPiiShape(value)).toBeTruthy(),
  );

  it.each(['5853936029031980', '₹18,948.52', 'ABC1234567', 'asha@example.com'])(
    '%s is NOT written off as a non-PII shape',
    (value) => expect(matchesNonPiiShape(value)).toBeUndefined(),
  );
});

describe('isNonPiiContainer', () => {
  it.each(['Recent reference numbers', 'Order id', 'Product catalogue', 'Batch details', 'Tracking'])(
    '%s reads as bookkeeping',
    (text) => expect(isNonPiiContainer(text)).toBe(true),
  );

  it.each(['Account summary', 'Identity documents', 'Payment instruments', 'Transfer to beneficiary', undefined])(
    '%s does not',
    (text) => expect(isNonPiiContainer(text)).toBe(false),
  );

  it('does not write off "Order summary", which is where a checkout keeps the address and card', () => {
    // The bare word "order" is deliberately absent from NON_PII_CONTAINER_TERMS. An order summary
    // is one of the most PII-dense blocks on an e-commerce page; only the reference-number
    // wordings ("order id", "order number") name bookkeeping.
    expect(isNonPiiContainer('Order summary')).toBe(false);
    expect(isNonPiiContainer('Delivery details')).toBe(false);
  });

  it('matches whole words only, so "reorder" is not "order"', () => {
    expect(isNonPiiContainer('Reorder preferences')).toBe(false);
  });
});

describe('negativeSignals', () => {
  it('treats a definitional checksum failure as the strongest negative', () => {
    const signals = negativeSignals(shape({ checksum: 'fail' }), {}, '735547520627');
    expect(signals.find((s) => s.name === 'checksum_fail_definitional')!.points).toBe(-4);
  });

  it('does not penalise a shape that simply has no checksum', () => {
    expect(negativeSignals(shape(), {}, '560001').map((s) => s.name)).not.toContain('checksum_fail_definitional');
  });

  it('is silent when nothing argues against the candidate', () => {
    expect(negativeSignals(shape(), { containerText: 'Account summary' }, '5853936029031980')).toEqual([]);
  });

  it('only counts a repeat at or above the configured threshold', () => {
    expect(negativeSignals(shape(), { repeatCount: 2 }, 'x').map((s) => s.name)).not.toContain('repeated_across_page');
    expect(negativeSignals(shape(), { repeatCount: 3 }, 'x').map((s) => s.name)).toContain('repeated_across_page');
  });
});
