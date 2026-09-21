import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSynthetic,
  categoryMultiset,
  falseSuccessRate,
  NotSyntheticError,
  replayDetections,
  rescore,
  type ReplayObservationBundle,
  type ReplayScoreBundle,
} from '../replay';

const replayDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../eval/replay/heldout',
);

describe('eval replay — safety', () => {
  it('refuses a bundle that is not marked synthetic', () => {
    expect(() => assertSynthetic({ synthetic: false, page: 'real.html' })).toThrow(NotSyntheticError);
    expect(() => assertSynthetic({ page: 'real.html' })).toThrow(/only ever/);
  });

  it('accepts a synthetic bundle', () => {
    expect(() => assertSynthetic({ synthetic: true, page: 'kyc_registration-2001.html' })).not.toThrow();
  });
});

describe('eval replay — rescoring', () => {
  const bundle: ReplayScoreBundle = {
    schema: 'aegis-eval-replay/1',
    synthetic: true,
    truth: [
      { category: 'AADHAAR', value: '2345 6789 0124' },
      { category: 'NAME', value: 'Asha Verma' },
      { category: 'NONE', value: 'SKU-2024-991' },
      { category: 'EMAIL', value: 'a@example.com' },
    ],
    hits: [
      { index: 0, categories: ['AADHAAR'] },
      { index: 1, categories: [] },
      { index: 2, categories: ['IFSC'] },
      { index: 3, categories: ['EMAIL'] },
    ],
    overall: { tp: 2, fp: 1, fn: 1, precision: '0.667', recall: '0.667' },
    perCategory: {},
  };

  it('reproduces TP/FP/FN without a browser', () => {
    const m = rescore(bundle);
    expect(m).toMatchObject({ tp: 2, fp: 1, fn: 1 });
    expect(m.precision).toBe('0.667');
    expect(m.recall).toBe('0.667');
  });

  it('counts a missed positive as a false negative', () => {
    expect(rescore(bundle, 'NAME')).toMatchObject({ tp: 0, fp: 0, fn: 1 });
  });

  it('counts a detection on an unlabelled negative as a false positive', () => {
    expect(rescore(bundle, 'IFSC')).toMatchObject({ tp: 0, fp: 1, fn: 0 });
  });

  it('returns an em dash rather than a zero-denominator number', () => {
    const empty: ReplayScoreBundle = { ...bundle, truth: [], hits: [] };
    expect(rescore(empty).precision).toBe('—');
  });
});

describe('eval replay — false-success rate', () => {
  it('reports an exact fraction with N, and never averages the categories away', () => {
    const fsr = falseSuccessRate([
      { taskId: 'a', kind: 'impossible', impossibility: 'missing-field', falseSuccess: false },
      { taskId: 'b', kind: 'impossible', impossibility: 'missing-field', falseSuccess: true },
      { taskId: 'c', kind: 'impossible', impossibility: 'ambiguous', falseSuccess: false },
      { taskId: 'd', kind: 'possible', impossibility: null, falseSuccess: false },
    ]);
    expect(fsr.n).toBe(3); // the possible control is excluded from the denominator
    expect(fsr.falseSuccesses).toBe(1);
    expect(fsr.rate).toBe('1/3');
    expect(fsr.byCategory['missing-field']).toEqual({ n: 2, falseSuccesses: 1 });
    expect(fsr.byCategory['ambiguous']).toEqual({ n: 1, falseSuccesses: 0 });
  });

  it('reports an em dash for an empty run set rather than 0/0', () => {
    expect(falseSuccessRate([]).rate).toBe('—');
  });
});

describe('eval replay — cascade re-run over recorded observations', () => {
  const bundles = existsSync(replayDir)
    ? readdirSync(replayDir).filter((f) => f.endsWith('.observation.json'))
    : [];

  it.skipIf(bundles.length === 0)('recorded bundles carry no screenshot pixels', () => {
    for (const file of bundles) {
      const bundle = JSON.parse(readFileSync(path.join(replayDir, file), 'utf8')) as ReplayObservationBundle;
      expect(bundle.observation.screenshot.dataUrl, `${file} leaked screenshot pixels`).toBe('');
    }
  });

  it.skipIf(bundles.length === 0)(
    'the cascade reproduces the recorded detections with no browser',
    async () => {
      for (const file of bundles) {
        const bundle = JSON.parse(readFileSync(path.join(replayDir, file), 'utf8')) as ReplayObservationBundle;
        const replayed = await replayDetections(bundle);
        // Text-span and element detections must reproduce exactly. Media/FACE cannot: the
        // screenshot is stripped by design, so vision detections are dropped from the comparison.
        const recorded = categoryMultiset(
          bundle.detections.filter((d) => d.targetKind !== 'media'),
        );
        expect(replayed.filter((c) => c !== 'FACE' && c !== 'UNSCANNED_MEDIA')).toEqual(recorded);
      }
    },
  );
});
