import { describe, expect, it } from 'vitest';
import { computeMutationDiff, toMarkIdentity } from '../diff';
import type { RawElement } from '../types';

function makeEl(fp: string, fpOrdinal: number, visible = true): RawElement {
  return {
    fp,
    fpOrdinal,
    frameId: 0,
    tag: 'input',
    role: 'textbox',
    name: '',
    labelText: '',
    hasValue: false,
    states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    lineRects: [],
    visible,
    visibilityReason: visible ? 'visible' : 'display-none',
    hiddenInteractive: !visible,
    privacyAttrs: [],
    inShadow: 'none',
  };
}

describe('computeMutationDiff', () => {
  it('treats a null previous as a first observation (all current elements "added" for the score, but 0 changedMarkCount/previousMarkCount)', () => {
    const current = [makeEl('a', 0), makeEl('b', 0)];
    const result = computeMutationDiff(null, current);
    expect(result).toEqual({ mutationScore: 2, changedMarkCount: 0, previousMarkCount: 0 });
  });

  it('is zero when nothing changed', () => {
    const elements = [makeEl('a', 0), makeEl('b', 0)];
    const result = computeMutationDiff(elements, elements);
    expect(result.mutationScore).toBe(0);
    expect(result.previousMarkCount).toBe(2);
  });

  it('counts an added visible element', () => {
    const previous = [makeEl('a', 0)];
    const current = [makeEl('a', 0), makeEl('b', 0)];
    expect(computeMutationDiff(previous, current).mutationScore).toBe(1);
  });

  it('counts a removed visible element', () => {
    const previous = [makeEl('a', 0), makeEl('b', 0)];
    const current = [makeEl('a', 0)];
    expect(computeMutationDiff(previous, current).mutationScore).toBe(1);
  });

  it('counts both an add and a remove', () => {
    const previous = [makeEl('a', 0), makeEl('b', 0)];
    const current = [makeEl('a', 0), makeEl('c', 0)];
    expect(computeMutationDiff(previous, current).mutationScore).toBe(2);
  });

  it('ignores elements that are not visible in either snapshot', () => {
    const previous = [makeEl('a', 0), makeEl('hidden1', 0, false)];
    const current = [makeEl('a', 0), makeEl('hidden2', 0, false)];
    expect(computeMutationDiff(previous, current).mutationScore).toBe(0);
  });

  it('matches by fp + fpOrdinal, so duplicate-fp elements are distinguished', () => {
    const previous = [makeEl('dup', 0), makeEl('dup', 1)];
    const current = [makeEl('dup', 0), makeEl('dup', 1), makeEl('dup', 2)];
    expect(computeMutationDiff(previous, current).mutationScore).toBe(1);
  });
});

describe('toMarkIdentity (Stage 2 Part A2: background must not cache raw observations)', () => {
  it('projects down to exactly frameId, fp, fpOrdinal and visible — nothing else', () => {
    const withPii = { ...makeEl('a', 0), name: 'Asha Verma', labelText: 'Full name', value: 'Asha Verma' };
    const [projected] = toMarkIdentity([withPii]);
    expect(Object.keys(projected!).sort()).toEqual(['fp', 'fpOrdinal', 'frameId', 'visible']);
  });

  it('never lets a name or value leak into the projection, even serialized', () => {
    const withPii = { ...makeEl('a', 0), name: 'Priya Shah', value: 'super-secret-value' };
    const json = JSON.stringify(toMarkIdentity([withPii]));
    expect(json).not.toContain('Priya Shah');
    expect(json).not.toContain('super-secret-value');
  });

  it('preserves fp/fpOrdinal/visible values exactly', () => {
    const el = makeEl('xyz', 2, false);
    const [projected] = toMarkIdentity([el]);
    expect(projected).toEqual({ frameId: 0, fp: 'xyz', fpOrdinal: 2, visible: false });
  });
});

it('does not collapse equal fingerprints in different frames', () => {
  const a=makeEl('dup',0),b={...makeEl('dup',0),frameId:1};
  expect(computeMutationDiff([a,b],[a])).toMatchObject({mutationScore:1,previousMarkCount:2});
});
