import { describe, expect, it } from 'vitest';
import { mergeDetections } from '../merge';
import type { Detection } from '../types';

function makeDetection(overrides: Partial<Detection>): Detection {
  return {
    id: Math.random().toString(36).slice(2),
    capture_id: 'c1',
    source: 'rule',
    category: 'EMAIL',
    confidence: 0.9,
    target: { kind: 'element', ref: 'fp1' },
    rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    ...overrides,
  };
}

describe('mergeDetections', () => {
  it('leaves detections on different targets separate', () => {
    const merged = mergeDetections([
      makeDetection({ target: { kind: 'element', ref: 'fp1' } }),
      makeDetection({ target: { kind: 'element', ref: 'fp2' } }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('merges two detections on the same element into one', () => {
    const merged = mergeDetections([
      makeDetection({ source: 'tag', category: 'PRIVATE_GENERIC', confidence: 0.5 }),
      makeDetection({ source: 'rule', category: 'EMAIL', confidence: 0.9 }),
    ]);
    expect(merged).toHaveLength(1);
  });

  it('lets the highest-RISK category win, not the highest-confidence one', () => {
    const merged = mergeDetections([
      makeDetection({ source: 'tag', category: 'PRIVATE_GENERIC', confidence: 0.99 }), // medium class
      makeDetection({ source: 'rule', category: 'AADHAAR', confidence: 0.4 }), // high class
    ]);
    expect(merged[0]!.category).toBe('AADHAAR');
  });

  it('ranks never_automated above everything else', () => {
    const merged = mergeDetections([
      makeDetection({ category: 'AADHAAR', confidence: 0.95 }),
      makeDetection({ category: 'CVV', confidence: 0.3 }),
    ]);
    expect(merged[0]!.category).toBe('CVV');
  });

  it('keeps every contributing source', () => {
    const merged = mergeDetections([
      makeDetection({ source: 'tag', category: 'PRIVATE_GENERIC' }),
      makeDetection({ source: 'rule', category: 'EMAIL' }),
      makeDetection({ source: 'field_context', category: 'EMAIL' }),
    ]);
    expect(merged[0]!.sources.sort()).toEqual(['field_context', 'rule', 'tag']);
  });

  it('never lowers confidence below the best single source', () => {
    const merged = mergeDetections([makeDetection({ confidence: 0.9 }), makeDetection({ source: 'tag', confidence: 0.5 })]);
    expect(merged[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('caps combined confidence at 1', () => {
    const merged = mergeDetections([
      makeDetection({ confidence: 0.95 }),
      makeDetection({ source: 'tag', confidence: 0.95 }),
      makeDetection({ source: 'field_context', confidence: 0.95 }),
    ]);
    expect(merged[0]!.confidence).toBeLessThanOrEqual(1);
  });

  it('keeps non-overlapping spans in the same text block separate', () => {
    const merged = mergeDetections([
      makeDetection({ target: { kind: 'text_span', ref: 'b1' }, span: { start: 0, end: 10 }, category: 'EMAIL' }),
      makeDetection({ target: { kind: 'text_span', ref: 'b1' }, span: { start: 40, end: 50 }, category: 'PHONE' }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('merges OVERLAPPING spans in the same text block', () => {
    const merged = mergeDetections([
      makeDetection({ target: { kind: 'text_span', ref: 'b1' }, span: { start: 0, end: 20 }, category: 'EMAIL' }),
      makeDetection({ target: { kind: 'text_span', ref: 'b1' }, span: { start: 10, end: 30 }, category: 'UPI_ID' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.category).toBe('UPI_ID'); // high class beats medium
  });

  it('unions the rects of everything it merged', () => {
    const merged = mergeDetections([
      makeDetection({ rects: [{ x: 0, y: 0, width: 5, height: 5 }] }),
      makeDetection({ source: 'tag', rects: [{ x: 10, y: 10, width: 5, height: 5 }] }),
    ]);
    expect(merged[0]!.rects).toHaveLength(2);
  });
});
