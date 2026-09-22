import { describe, expect, it } from 'vitest';
import { bindingAt, findInlineKeyValues } from '../binder';

/** The exact paragraph shape eval/page_factory/templates.py::_render_prose emits, which the
 * `^`-anchored KEY_VALUE_PATTERN could not bind at all. */
const PROSE_LEAD = 'Thank you for your request. Our records currently show ';

describe('findInlineKeyValues', () => {
  it('binds a label that a ^-anchored pattern cannot reach', () => {
    const text = `${PROSE_LEAD}Account number for credit: 5853936029031980. Please contact the branch.`;
    const bindings = findInlineKeyValues(text);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.category).toBe('BANK_ACCOUNT');
    expect(text.slice(bindings[0]!.valueStart, bindings[0]!.valueEnd)).toBe('5853936029031980');
  });

  it('binds every pair in a multi-pair paragraph, not just the first', () => {
    const text = `${PROSE_LEAD}Account number for credit: 5853936029031980, and Registered name: Joseph Bose. Please contact.`;
    const bindings = findInlineKeyValues(text);
    expect(bindings.map((b) => b.category)).toEqual(['BANK_ACCOUNT', 'NAME']);
    expect(text.slice(bindings[1]!.valueStart, bindings[1]!.valueEnd)).toBe('Joseph Bose');
  });

  it('does not swallow the prose lead into the key', () => {
    // The minimal key that carries the category wins, so the prose lead is never part of it.
    const text = `${PROSE_LEAD}Registered name: Joseph Bose.`;
    const [binding] = findInlineKeyValues(text);
    expect(binding!.category).toBe('NAME');
    expect(binding!.phrase).toBe('name');
    expect(binding!.phrase).not.toContain('records');
  });

  it('prefers the MORE specific key when a longer suffix matches a longer phrase', () => {
    // 2 words match `account number` (BANK_ACCOUNT, 14 chars); 3 words match
    // `permanent account number` (PAN, 24 chars). Specificity beats brevity.
    const [binding] = findInlineKeyValues('Permanent account number: ABCPE1234F');
    expect(binding!.category).toBe('PAN');
  });

  it('reaches a 4-word key when only the full phrase matches', () => {
    const [binding] = findInlineKeyValues(`${PROSE_LEAD}Account number for credit: 5853936029031980.`);
    expect(binding!.category).toBe('BANK_ACCOUNT');
    expect(binding!.phrase).toBe('Account number for credit');
  });

  it('binds nothing when the prose carries no label', () => {
    // The page factory's negative construct: an unlabelled near-miss in running text.
    expect(findInlineKeyValues(`${PROSE_LEAD}735547520627, and SKU-2027-788.`)).toEqual([]);
  });

  it('binds nothing when the key is not in the dictionary', () => {
    // No new vocabulary: an unrecognised key must not bind, however label-shaped it looks.
    expect(findInlineKeyValues('Widget throughput ratio: 8871')).toEqual([]);
  });

  it('still binds the classic anchored form', () => {
    const [binding] = findInlineKeyValues('Aadhaar: 2234 5678 9012');
    expect(binding!.category).toBe('AADHAAR');
  });

  it('binds a full-width colon', () => {
    const [binding] = findInlineKeyValues('मोबाइल：9876543210');
    expect(binding!.category).toBe('PHONE');
  });

  it('stops a value region at the clause boundary', () => {
    const text = 'Email address: a@b.example, and Mobile number: 9876543210.';
    const bindings = findInlineKeyValues(text);
    expect(text.slice(bindings[0]!.valueStart, bindings[0]!.valueEnd)).toBe('a@b.example');
  });

  it('bounds a runaway value region to EVIDENCE_VALUE_WINDOW_CHARS', () => {
    const [binding] = findInlineKeyValues(`Address: ${'x'.repeat(500)}`);
    expect(binding!.valueEnd - binding!.valueStart).toBeLessThanOrEqual(64);
  });

  it('does not start a second binding inside a value it already took', () => {
    const bindings = findInlineKeyValues('Address: Flat 4: Nehru Road');
    expect(bindings).toHaveLength(1);
  });

  it('bindingAt finds the binding covering an offset', () => {
    const text = `${PROSE_LEAD}Registered name: Joseph Bose.`;
    const bindings = findInlineKeyValues(text);
    expect(bindingAt(bindings, text.indexOf('Joseph'))!.category).toBe('NAME');
    expect(bindingAt(bindings, 0)).toBeUndefined();
  });
});
