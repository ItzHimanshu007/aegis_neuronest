import { describe, expect, it } from 'vitest';
import { fullResLabelHeight, placeSomLabels, SOM_LABEL_PATTERN, type PxRect, type SomCandidate } from '../som';
import { AEGIS_CONFIG } from '../../shared/config';
import type { EID } from '../../scene/registry';

/**
 * Placement rules for the Privacy Set-of-Marks (Stage 3A Part B). The drawing itself needs a
 * canvas and is covered by the e2e specs; everything that decides WHERE a tag goes is pure and
 * lives here.
 */

const OPTIONS = { imageW: 1000, imageH: 800, labelHeightPx: 12, charWidthPx: 7 };

function candidate(eid: string, pxRect: PxRect): SomCandidate {
  return { eid: eid as EID, pxRect };
}

function overlaps(a: PxRect, b: PxRect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
  );
}

describe('placeSomLabels', () => {
  it('puts a tag at the element top-left when nothing is in the way', () => {
    const [label] = placeSomLabels([candidate('E1', { x: 100, y: 200, width: 180, height: 30 })], [], OPTIONS);
    expect(label!.eid).toBe('E1');
    expect(label!.pxRect.x).toBe(100);
    expect(label!.pxRect.y).toBe(200);
  });

  it('never places a tag inside a mask', () => {
    const mask = { x: 90, y: 190, width: 300, height: 60 };
    const labels = placeSomLabels([candidate('E1', { x: 100, y: 200, width: 180, height: 30 })], [mask], OPTIONS);
    for (const label of labels) expect(overlaps(label.pxRect, mask)).toBe(false);
  });

  it('moves a tag outside the mask edge when the element is entirely masked', () => {
    // A fully covered field still needs to be nameable, so the tag goes just above the mask.
    const mask = { x: 0, y: 190, width: 1000, height: 50 };
    const [label] = placeSomLabels([candidate('E7', { x: 100, y: 200, width: 180, height: 30 })], [mask], OPTIONS);
    expect(label).toBeDefined();
    expect(overlaps(label!.pxRect, mask)).toBe(false);
    expect(label!.pxRect.y).toBeLessThan(mask.y);
  });

  it('never overlaps two tags', () => {
    const labels = placeSomLabels(
      [
        candidate('E1', { x: 100, y: 200, width: 40, height: 20 }),
        candidate('E2', { x: 100, y: 200, width: 40, height: 20 }),
        candidate('E3', { x: 100, y: 200, width: 40, height: 20 }),
      ],
      [],
      OPTIONS,
    );
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlaps(labels[i]!.pxRect, labels[j]!.pxRect)).toBe(false);
      }
    }
  });

  it('skips an element with nowhere clear to go rather than drawing over a mask', () => {
    const everything = [{ x: 0, y: 0, width: 1000, height: 800 }];
    expect(placeSomLabels([candidate('E1', { x: 100, y: 200, width: 40, height: 20 })], everything, OPTIONS)).toEqual([]);
  });

  it('keeps every tag inside the image', () => {
    const labels = placeSomLabels(
      [
        candidate('E1', { x: 0, y: 0, width: 40, height: 20 }),
        candidate('E2', { x: 985, y: 790, width: 40, height: 20 }),
      ],
      [],
      OPTIONS,
    );
    for (const label of labels) {
      expect(label.pxRect.x).toBeGreaterThanOrEqual(0);
      expect(label.pxRect.y).toBeGreaterThanOrEqual(0);
      expect(label.pxRect.x + label.pxRect.width).toBeLessThanOrEqual(OPTIONS.imageW);
      expect(label.pxRect.y + label.pxRect.height).toBeLessThanOrEqual(OPTIONS.imageH);
    }
  });

  it('gives earlier candidates the contested spot', () => {
    const labels = placeSomLabels(
      [candidate('E1', { x: 100, y: 200, width: 40, height: 20 }), candidate('E2', { x: 100, y: 200, width: 40, height: 20 })],
      [],
      OPTIONS,
    );
    expect(labels[0]!.eid).toBe('E1');
    expect(labels[0]!.pxRect).toMatchObject({ x: 100, y: 200 });
  });

  it('sizes the tag to the EID text', () => {
    const [short] = placeSomLabels([candidate('E1', { x: 0, y: 0, width: 200, height: 20 })], [], OPTIONS);
    const [long] = placeSomLabels([candidate('E123456', { x: 0, y: 0, width: 200, height: 20 })], [], OPTIONS);
    expect(long!.pxRect.width).toBeGreaterThan(short!.pxRect.width);
  });
});

describe('fullResLabelHeight', () => {
  it('scales the tag up so it renders at the minimum size after downscaling', () => {
    // Half-size output means the tag must be drawn twice as tall to survive the shrink.
    expect(fullResLabelHeight(0.5)).toBe(AEGIS_CONFIG.SOM_MIN_LABEL_PX * 2);
    expect(fullResLabelHeight(1)).toBe(AEGIS_CONFIG.SOM_MIN_LABEL_PX);
  });

  it('does not divide by zero when no downscale factor is known', () => {
    expect(fullResLabelHeight(0)).toBe(AEGIS_CONFIG.SOM_MIN_LABEL_PX);
  });
});

describe('SOM_LABEL_PATTERN', () => {
  it.each(['E1', 'E14', 'E999999'])('accepts %s', (label) => expect(SOM_LABEL_PATTERN.test(label)).toBe(true));
  it.each(['E', 'E1234567', 'Submit', 'e1', '[[PII:NAME:abcdefgh]]', 'E1 ', ''])('rejects %s', (label) =>
    expect(SOM_LABEL_PATTERN.test(label)).toBe(false));
});
