import { describe, expect, it } from 'vitest';
import { findNearestLabelCategory, getElementFieldContext, getKeyValueKeyContext, pairDtDd } from '../fieldContext';
import type { RawTextBlock } from '../../../observe/types';

describe('getElementFieldContext', () => {
  it('returns PASSWORD for input[type=password] regardless of label', () => {
    expect(getElementFieldContext({ name: 'Secret field', labelText: '', nameAttr: undefined, inputType: 'password' })).toBe('PASSWORD');
  });

  it('uses the accessible name first', () => {
    expect(getElementFieldContext({ name: 'Email address', labelText: '', nameAttr: undefined, inputType: 'text' })).toBe('EMAIL');
  });

  it('falls back to labelText when name has no match', () => {
    expect(getElementFieldContext({ name: '', labelText: 'Aadhaar Number', nameAttr: undefined, inputType: 'text' })).toBe('AADHAAR');
  });

  it('falls back to the name attribute as a last resort', () => {
    expect(getElementFieldContext({ name: '', labelText: '', nameAttr: 'pan', inputType: 'text' })).toBe('PAN');
  });

  it('returns undefined when nothing matches', () => {
    expect(getElementFieldContext({ name: 'Comments', labelText: '', nameAttr: undefined, inputType: 'text' })).toBeUndefined();
  });

  it('applies even when the field is empty (context, not value, drives this)', () => {
    // No hasValue field is even passed in — the function signature itself proves this.
    expect(getElementFieldContext({ name: 'Password', labelText: '', nameAttr: undefined, inputType: 'password' })).toBe('PASSWORD');
  });
});

describe('getKeyValueKeyContext', () => {
  it('matches "Label: value"', () => {
    const result = getKeyValueKeyContext('Balance: ₹42,318.00');
    expect(result?.category).toBe('FINANCIAL_VALUE');
  });

  it('matches with a full-width colon', () => {
    const result = getKeyValueKeyContext('账户余额：₹42,318.00'.replace('账户余额', 'Balance'));
    expect(result?.category).toBe('FINANCIAL_VALUE');
  });

  it('returns undefined with no colon', () => {
    expect(getKeyValueKeyContext('just some text')).toBeUndefined();
  });

  it('returns undefined when the key part does not match the dictionary', () => {
    expect(getKeyValueKeyContext('Random Label: some value')).toBeUndefined();
  });

  it('reports the correct valueStart offset', () => {
    const text = 'Account number: 1234567890';
    const result = getKeyValueKeyContext(text);
    expect(result).toBeDefined();
    expect(text.slice(result!.valueStart)).toBe('1234567890');
  });
});

function makeBlock(overrides: Partial<RawTextBlock>): RawTextBlock {
  return {
    blockRef: '0:0',
    text: 'x',
    lineRects: [],
    bbox: { x: 0, y: 0, width: 50, height: 20 },
    role: 'generic',
    frameId: 0,
    ...overrides,
  };
}

describe('findNearestLabelCategory', () => {
  it('finds a label directly above the target (table header over a cell)', () => {
    const header = makeBlock({ blockRef: 'h', text: 'Balance', bbox: { x: 100, y: 0, width: 80, height: 20 } });
    const target = { x: 100, y: 25, width: 80, height: 20 };
    expect(findNearestLabelCategory(target, [header])).toBe('FINANCIAL_VALUE');
  });

  it('finds a label to the left of the target on the same row', () => {
    const label = makeBlock({ blockRef: 'l', text: 'Email address', bbox: { x: 0, y: 100, width: 100, height: 20 } });
    const target = { x: 110, y: 100, width: 150, height: 20 };
    expect(findNearestLabelCategory(target, [label])).toBe('EMAIL');
  });

  it('ignores a label too far away', () => {
    const label = makeBlock({ blockRef: 'l', text: 'Email address', bbox: { x: 0, y: 0, width: 100, height: 20 } });
    const target = { x: 100, y: 1000, width: 100, height: 20 }; // far below, not same row/column
    expect(findNearestLabelCategory(target, [label], 120)).toBeUndefined();
  });

  it('ignores blocks whose text does not match the dictionary', () => {
    const notALabel = makeBlock({ blockRef: 'l', text: 'Lorem ipsum', bbox: { x: 100, y: 0, width: 80, height: 20 } });
    const target = { x: 100, y: 25, width: 80, height: 20 };
    expect(findNearestLabelCategory(target, [notALabel])).toBeUndefined();
  });

  it('picks the closest match when multiple candidates qualify', () => {
    const far = makeBlock({ blockRef: 'far', text: 'Employer', bbox: { x: 100, y: -100, width: 80, height: 20 } });
    const near = makeBlock({ blockRef: 'near', text: 'Balance', bbox: { x: 100, y: 0, width: 80, height: 20 } });
    const target = { x: 100, y: 25, width: 80, height: 20 };
    expect(findNearestLabelCategory(target, [far, near], 200)).toBe('FINANCIAL_VALUE');
  });
});

describe('pairDtDd', () => {
  it('pairs a dt/dd sequence and assigns the dt label to the dd block', () => {
    const dt = makeBlock({ blockRef: 'dt1', text: 'Aadhaar', role: 'term' });
    const dd = makeBlock({ blockRef: 'dd1', text: '234567890128', role: 'definition' });
    const result = pairDtDd([dt, dd]);
    expect(result.get('dd1')).toBe('AADHAAR');
  });

  it('does not pair non-adjacent or mismatched roles', () => {
    const a = makeBlock({ blockRef: 'a', text: 'Aadhaar', role: 'term' });
    const b = makeBlock({ blockRef: 'b', text: 'something', role: 'generic' });
    const result = pairDtDd([a, b]);
    expect(result.size).toBe(0);
  });
});
