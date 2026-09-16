/**
 * Perceptual hashing for the screen-change detector's secondary check (see observe/change.ts and
 * docs/STAGES.md Stage 1: "compare a 64-bit dHash of the downscaled screenshot").
 *
 * Pure pixel-array functions so they're unit-testable without a real <canvas> — the adapter that
 * draws a screenshot to an offscreen canvas and extracts pixels lives in observe/capture.ts,
 * which only runs in the background/content script.
 */

import { AEGIS_CONFIG } from '../shared/config';

/** A row-major grayscale image, one byte (0-255) per pixel. */
export interface GrayscaleImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/**
 * Computes a 64-bit difference hash (dHash) from a grayscale thumbnail.
 *
 * Algorithm: shrink to `gridSize` x `(gridSize - 1)` (default 9x8 = 64 comparisons), then set bit
 * `i` if pixel `i` is brighter than the pixel to its right. Returns the hash as a bigint so all
 * 64 bits are exact (a `number` only has 53 usable mantissa bits).
 */
export function computeDHash(image: GrayscaleImage, gridSize = AEGIS_CONFIG.DHASH_GRID_SIZE): bigint {
  const width = gridSize;
  const height = gridSize - 1;
  const shrunk = resizeNearest(image, width, height);

  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = shrunk.pixels[y * width + x] ?? 0;
      const right = shrunk.pixels[y * width + x + 1] ?? 0;
      if (left > right) {
        hash |= 1n << bit;
      }
      bit += 1n;
    }
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/** Nearest-neighbour resize — good enough for a difference hash, and avoids pulling in an image
 * processing dependency for something this small. */
function resizeNearest(image: GrayscaleImage, targetW: number, targetH: number): GrayscaleImage {
  const out = new Uint8ClampedArray(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const srcY = Math.min(image.height - 1, Math.floor((y * image.height) / targetH));
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(image.width - 1, Math.floor((x * image.width) / targetW));
      out[y * targetW + x] = image.pixels[srcY * image.width + srcX] ?? 0;
    }
  }
  return { width: targetW, height: targetH, pixels: out };
}

/** Converts RGBA pixel data (as returned by CanvasRenderingContext2D#getImageData) to grayscale
 * using the standard luma weights. */
export function rgbaToGrayscale(rgba: Uint8ClampedArray, width: number, height: number): GrayscaleImage {
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    pixels[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { width, height, pixels };
}
