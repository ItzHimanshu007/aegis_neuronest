import { describe, expect, it } from 'vitest';
import { maskKindForAction, toPaddedPixelRect } from '../redactor';
import type { Action } from '../categoryTypes';

/**
 * The canvas-dependent half of the redactor (drawing, downscaling, verifyMasks) needs a real
 * OffscreenCanvas, which happy-dom doesn't provide — that half is covered by the Playwright e2e
 * suite in a real browser. What IS unit-testable here is the geometry and the action -> mask-kind
 * mapping, which is where the "text is only ever solid-filled, blur is faces only" invariant is
 * actually decided.
 */

describe('maskKindForAction (AGENTS.md invariant 5)', () => {
  it('maps BLUR only from the BLUR action — never from any text action', () => {
    expect(maskKindForAction('BLUR', false)).toBe('BLUR');
    const textActions: Action[] = ['FILL', 'USER_ENTERS', 'USER_PROVIDED_ORIGIN_BOUND', 'TOKEN', 'TOKEN_WITH_APPROVAL', 'FILL_REGION'];
    for (const action of textActions) {
      expect(maskKindForAction(action, false)).not.toBe('BLUR');
    }
  });

  it('solid-fills every text-bearing action', () => {
    expect(maskKindForAction('FILL', false)).toBe('FILL');
    expect(maskKindForAction('USER_ENTERS', false)).toBe('FILL');
    expect(maskKindForAction('USER_PROVIDED_ORIGIN_BOUND', false)).toBe('FILL');
  });

  it('uses FILL_REGION for whole-document masks', () => {
    expect(maskKindForAction('FILL_REGION', false)).toBe('FILL_REGION');
  });

  it('labels a tokenized fill so the server can correlate it with the token', () => {
    expect(maskKindForAction('TOKEN', true)).toBe('LABELLED_FILL');
    expect(maskKindForAction('TOKEN_WITH_APPROVAL', true)).toBe('LABELLED_FILL');
  });

  it('falls back to a plain fill when a tokenizing action produced no token', () => {
    expect(maskKindForAction('TOKEN', false)).toBe('FILL');
  });

  it('produces NO mask for ALLOW', () => {
    expect(maskKindForAction('ALLOW', false)).toBeNull();
  });
});

describe('toPaddedPixelRect', () => {
  it('scales CSS px to screenshot px', () => {
    const rect = toPaddedPixelRect({ x: 10, y: 20, width: 30, height: 40 }, 2, 2, 1000, 1000, 0);
    expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });

  it('pads outward by REDACT_PAD_CSS_PX on every side', () => {
    const rect = toPaddedPixelRect({ x: 10, y: 10, width: 10, height: 10 }, 1, 1, 1000, 1000, 2);
    expect(rect.x).toBe(8);
    expect(rect.y).toBe(8);
    expect(rect.width).toBe(14); // 10 + 2px padding on each side
    expect(rect.height).toBe(14);
  });

  it('clamps to the image bounds rather than overflowing', () => {
    const rect = toPaddedPixelRect({ x: -5, y: -5, width: 20, height: 20 }, 1, 1, 10, 10, 2);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(10);
    expect(rect.y + rect.height).toBeLessThanOrEqual(10);
  });

  it('never returns a negative size', () => {
    const rect = toPaddedPixelRect({ x: 5000, y: 5000, width: 10, height: 10 }, 1, 1, 100, 100, 2);
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
  });

  it('rounds outward (floor the start, ceil the end) so a mask never lands short of the text', () => {
    const rect = toPaddedPixelRect({ x: 10.7, y: 10.7, width: 10.6, height: 10.6 }, 1, 1, 1000, 1000, 0);
    expect(rect.x).toBe(10); // floored
    expect(rect.x + rect.width).toBe(22); // ceiled past 21.3
  });

  it('handles different X and Y scales (non-square pixels)', () => {
    const rect = toPaddedPixelRect({ x: 10, y: 10, width: 10, height: 10 }, 2, 3, 1000, 1000, 0);
    expect(rect).toEqual({ x: 20, y: 30, width: 20, height: 30 });
  });
});
