import { describe, expect, it } from 'vitest';
import { assignFpOrdinals, computeFingerprint, normalizeName, type FingerprintInput } from '../fingerprint';

const base: FingerprintInput = {
  role: 'textbox',
  name: 'Full name',
  tag: 'input',
  inputType: 'text',
  autocomplete: undefined,
  nameAttr: 'full-name',
  ancestorSignature: 'form|form|kyc form',
  labelText: 'Full name',
};

describe('normalizeName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeName('  Full   Name  ')).toBe('full name');
  });

  it('maps digit runs to #', () => {
    expect(normalizeName('Item 12')).toBe('item #');
    expect(normalizeName('Item 47')).toBe('item #');
    expect(normalizeName('Item 12')).toBe(normalizeName('Item 47'));
  });
});

describe('computeFingerprint', () => {
  it('is stable across class/id churn (inputs identical, salt identical)', () => {
    const fp1 = computeFingerprint(base, 'salt-a');
    const fp2 = computeFingerprint({ ...base }, 'salt-a');
    expect(fp1).toBe(fp2);
  });

  it('is stable when the count in the name changes but the rest is identical', () => {
    const fpA = computeFingerprint({ ...base, name: 'Item 12' }, 'salt-a');
    const fpB = computeFingerprint({ ...base, name: 'Item 99' }, 'salt-a');
    expect(fpA).toBe(fpB);
  });

  it('differs for different fields in the same form', () => {
    const name = computeFingerprint(base, 'salt-a');
    const email = computeFingerprint({ ...base, name: 'Email', nameAttr: 'email', inputType: 'email', labelText: 'Email' }, 'salt-a');
    expect(name).not.toBe(email);
  });

  it('differs when the salt differs (unlinkable across sessions)', () => {
    const fpA = computeFingerprint(base, 'salt-a');
    const fpB = computeFingerprint(base, 'salt-b');
    expect(fpA).not.toBe(fpB);
  });

  it('produces exactly 8 lowercase hex characters', () => {
    const fp = computeFingerprint(base, 'salt-a');
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('ignores position/size/style inputs entirely (not part of FingerprintInput at all)', () => {
    // FingerprintInput has no bbox/style fields by construction — this test documents that
    // guarantee rather than re-deriving it.
    const keys = Object.keys(base);
    expect(keys).not.toContain('bbox');
    expect(keys).not.toContain('style');
    expect(keys).not.toContain('className');
  });
});

describe('assignFpOrdinals', () => {
  it('assigns 0, 1, 2... to duplicate fps in document order', () => {
    const items = [{ fp: 'aaaa' }, { fp: 'bbbb' }, { fp: 'aaaa' }, { fp: 'aaaa' }];
    const result = assignFpOrdinals(items);
    expect(result.map((r) => r.fpOrdinal)).toEqual([0, 0, 1, 2]);
  });

  it('gives three duplicate "Add" buttons ordinals 0, 1, 2', () => {
    const addButtons = [{ fp: 'add1234' }, { fp: 'add1234' }, { fp: 'add1234' }];
    const result = assignFpOrdinals(addButtons);
    expect(result.map((r) => r.fpOrdinal)).toEqual([0, 1, 2]);
  });

  it('leaves unique fps at ordinal 0', () => {
    const items = [{ fp: 'a' }, { fp: 'b' }, { fp: 'c' }];
    const result = assignFpOrdinals(items);
    expect(result.every((r) => r.fpOrdinal === 0)).toBe(true);
  });
});

/**
 * Stage 7F / invariant 12 — adding structural evidence must not move a single EID.
 *
 * `RawElement.structure` is a Stage 7 detection input. `computeFingerprint` takes a closed
 * `FingerprintInput`, and the whole Scene Graph's element identity is derived from its output, so
 * if a structural field ever became a fingerprint input every EID on every page would change:
 * stale-plan checks would fire, reacquisition would miss, and the server's view of the page would
 * silently renumber. These tests pin that the input set is exactly what it was.
 */
describe('Stage 7: the fingerprint input set is closed', () => {
  const base = { role: 'textbox', name: 'Account number', tag: 'input', inputType: 'text', autocomplete: undefined, nameAttr: 'acct', ancestorSignature: 'main', labelText: 'Account number' };

  it('is byte-identical whether or not structural evidence was captured', () => {
    // The structural block is not part of FingerprintInput at all, so the only way to prove this
    // is that the same input yields the same fingerprint — and that extra keys are ignored.
    const withStructure = { ...base, structure: { maxLength: 16, placeholder: 'Enter account number', sectionHeading: 'Transfer to beneficiary' } };
    expect(computeFingerprint(withStructure as typeof base, 'salt', 8)).toBe(computeFingerprint(base, 'salt', 8));
  });

  it.each(['placeholder', 'maxLength', 'minLength', 'pattern', 'inputMode', 'legendText', 'columnHeaderText', 'sectionHeading'])(
    'ignores a stray %s key',
    (key) => {
      expect(computeFingerprint({ ...base, [key]: 'anything' } as typeof base, 'salt', 8)).toBe(computeFingerprint(base, 'salt', 8));
    },
  );

  it('still changes when a real fingerprint input changes', () => {
    // Guard on the guard: if computeFingerprint ignored everything, the assertions above would
    // pass for the wrong reason.
    expect(computeFingerprint({ ...base, nameAttr: 'other' }, 'salt', 8)).not.toBe(computeFingerprint(base, 'salt', 8));
  });
});
