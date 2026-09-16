import { describe, expect, it } from 'vitest';
import { decideScreenChange, type ChangeSnapshot } from '../change';
import { AEGIS_CONFIG } from '../../shared/config';

const base: ChangeSnapshot = {
  urlPath: '/kyc',
  urlHash: '',
  dialogOpen: false,
  mutationScore: 0,
  previousMarkCount: 20,
  changedMarkCount: 0,
  scrollY: 0,
  viewportHeight: 800,
};

describe('decideScreenChange (table-driven)', () => {
  const cases: Array<{ name: string; previous: ChangeSnapshot | null; current: ChangeSnapshot; decision: 'NEW_SCREEN' | 'SAME_SCREEN'; reason: string }> = [
    {
      name: 'first observation is always NEW_SCREEN',
      previous: null,
      current: base,
      decision: 'NEW_SCREEN',
      reason: 'first-observation',
    },
    {
      name: 'identical snapshots are SAME_SCREEN',
      previous: base,
      current: { ...base },
      decision: 'SAME_SCREEN',
      reason: 'no-change',
    },
    {
      name: 'URL path change is NEW_SCREEN',
      previous: base,
      current: { ...base, urlPath: '/checkout' },
      decision: 'NEW_SCREEN',
      reason: 'url-path-change',
    },
    {
      name: 'hash-route change is NEW_SCREEN',
      previous: base,
      current: { ...base, urlHash: '#step-2' },
      decision: 'NEW_SCREEN',
      reason: 'url-path-change',
    },
    {
      name: 'a dialog appearing is NEW_SCREEN',
      previous: { ...base, dialogOpen: false },
      current: { ...base, dialogOpen: true },
      decision: 'NEW_SCREEN',
      reason: 'dialog-appeared',
    },
    {
      name: 'a dialog disappearing is NEW_SCREEN',
      previous: { ...base, dialogOpen: true },
      current: { ...base, dialogOpen: false },
      decision: 'NEW_SCREEN',
      reason: 'dialog-disappeared',
    },
    {
      name: 'mutation score at the threshold is NEW_SCREEN',
      previous: base,
      current: { ...base, mutationScore: AEGIS_CONFIG.CHANGE_MUTATION_SCORE },
      decision: 'NEW_SCREEN',
      reason: 'mutation-score',
    },
    {
      name: 'mutation score just under the threshold is not enough alone',
      previous: base,
      current: { ...base, mutationScore: AEGIS_CONFIG.CHANGE_MUTATION_SCORE - 1, changedMarkCount: 0 },
      decision: 'SAME_SCREEN',
      reason: 'no-change',
    },
    {
      name: 'mark ratio at the threshold is NEW_SCREEN',
      previous: base,
      current: { ...base, changedMarkCount: Math.ceil(base.previousMarkCount * AEGIS_CONFIG.CHANGE_MARK_RATIO) },
      decision: 'NEW_SCREEN',
      reason: 'mark-ratio',
    },
    {
      name: 'scroll displacement at the threshold is NEW_SCREEN',
      previous: base,
      current: { ...base, scrollY: base.viewportHeight * AEGIS_CONFIG.CHANGE_SCROLL_RATIO },
      decision: 'NEW_SCREEN',
      reason: 'scroll-displacement',
    },
    {
      name: 'small scroll is SAME_SCREEN',
      previous: base,
      current: { ...base, scrollY: 10 },
      decision: 'SAME_SCREEN',
      reason: 'no-change',
    },
  ];

  for (const { name, previous, current, decision, reason } of cases) {
    it(name, () => {
      const result = decideScreenChange(previous, current);
      expect(result.decision).toBe(decision);
      expect(result.reason).toBe(reason);
    });
  }

  it('falls back to perceptual hash when mutation score is ambiguous and the images differ', () => {
    const size = AEGIS_CONFIG.DHASH_GRID_SIZE;
    const prevPixels = new Uint8ClampedArray(size * (size - 1)).fill(10);
    const currPixels = new Uint8ClampedArray(size * (size - 1));
    // Alternate bright/dark so the resized dHash grid actually differs a lot.
    for (let i = 0; i < currPixels.length; i++) currPixels[i] = i % 2 === 0 ? 250 : 5;

    const result = decideScreenChange(
      { ...base, dhashInput: { width: size, height: size - 1, pixels: prevPixels } },
      {
        ...base,
        mutationScore: AEGIS_CONFIG.CHANGE_AMBIGUOUS_SCORE,
        dhashInput: { width: size, height: size - 1, pixels: currPixels },
      },
    );
    expect(result.decision).toBe('NEW_SCREEN');
    expect(result.reason).toBe('perceptual-hash');
  });

  it('stays SAME_SCREEN when mutation score is ambiguous but the images are identical', () => {
    const size = AEGIS_CONFIG.DHASH_GRID_SIZE;
    const pixels = new Uint8ClampedArray(size * (size - 1)).fill(128);
    const result = decideScreenChange(
      { ...base, dhashInput: { width: size, height: size - 1, pixels } },
      {
        ...base,
        mutationScore: AEGIS_CONFIG.CHANGE_AMBIGUOUS_SCORE,
        dhashInput: { width: size, height: size - 1, pixels: pixels.slice() },
      },
    );
    expect(result.decision).toBe('SAME_SCREEN');
  });
});
