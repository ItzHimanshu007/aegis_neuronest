import { describe, expect, it } from 'vitest';
import { computeDHash, hammingDistance, rgbaToGrayscale, type GrayscaleImage } from '../dhash';

function solid(value: number, w = 9, h = 8): GrayscaleImage {
  return { width: w, height: h, pixels: new Uint8ClampedArray(w * h).fill(value) };
}

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance(0b0000n, 0b1111n)).toBe(4);
    expect(hammingDistance(0b1010n, 0b0101n)).toBe(4);
  });

  it('is symmetric', () => {
    expect(hammingDistance(0b1100n, 0b0011n)).toBe(hammingDistance(0b0011n, 0b1100n));
  });
});

describe('computeDHash', () => {
  it('produces identical hashes for identical images', () => {
    const a = solid(100);
    const b = solid(100);
    expect(computeDHash(a)).toBe(computeDHash(b));
  });

  it('produces the same hash for a solid image regardless of brightness (no left>right edges)', () => {
    expect(computeDHash(solid(10))).toBe(computeDHash(solid(240)));
  });

  it('produces a large Hamming distance between very different images', () => {
    const w = 9;
    const h = 8;
    const alternating = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alternating.length; i++) alternating[i] = i % 2 === 0 ? 250 : 5;
    const a = computeDHash(solid(128, w, h));
    const b = computeDHash({ width: w, height: h, pixels: alternating });
    expect(hammingDistance(a, b)).toBeGreaterThan(10);
  });

  it('returns a value representable in 64 bits', () => {
    const hash = computeDHash(solid(128));
    expect(hash).toBeGreaterThanOrEqual(0n);
    expect(hash).toBeLessThan(1n << 64n);
  });
});

describe('rgbaToGrayscale', () => {
  it('converts pure white to 255 and pure black to 0', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = rgbaToGrayscale(rgba, 2, 1);
    expect(gray.pixels[0]).toBe(255);
    expect(gray.pixels[1]).toBe(0);
  });

  it('applies standard luma weights', () => {
    // Pure green should be brighter than pure red or blue under luma weighting.
    const red = rgbaToGrayscale(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1).pixels[0]!;
    const green = rgbaToGrayscale(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1).pixels[0]!;
    const blue = rgbaToGrayscale(new Uint8ClampedArray([0, 0, 255, 255]), 1, 1).pixels[0]!;
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});
