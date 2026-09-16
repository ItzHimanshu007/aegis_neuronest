/**
 * Background-only adapter between a `tabs.captureVisibleTab` data URL and the pure pixel
 * functions in observe/dhash.ts. Deliberately does NOT use `fetch` to decode the data URL — the
 * ESLint rule banning `fetch` outside net/network.ts is purely syntactic (AGENTS.md invariant 2),
 * so even a same-process `data:` URL fetch would trip it. `atob` + `Blob` + `createImageBitmap`
 * decodes the PNG without touching the network stack at all, and all three are available in an
 * MV3 service worker (`OffscreenCanvas` too, since Chrome 69 / Firefox 105).
 */

import { rgbaToGrayscale, type GrayscaleImage } from './dhash';

export function decodeDataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const commaIndex = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, commaIndex); // strip "data:"
  const mimeType = meta.split(';')[0] || 'image/png';
  const base64 = dataUrl.slice(commaIndex + 1);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: mimeType });
  return createImageBitmap(blob);
}

/** Full pixel dimensions of the screenshot — used for the scaleX/scaleY mapping (Part D.4). */
export async function imageSizeFromDataUrl(dataUrl: string): Promise<{ pxW: number; pxH: number }> {
  const bitmap = await decodeDataUrlToBitmap(dataUrl);
  const size = { pxW: bitmap.width, pxH: bitmap.height };
  bitmap.close();
  return size;
}

/** Downscaled grayscale thumbnail for the dHash secondary change-detector check. */
export async function dataUrlToGrayscale(dataUrl: string, targetW: number, targetH: number): Promise<GrayscaleImage> {
  const bitmap = await decodeDataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  bitmap.close();
  return rgbaToGrayscale(imageData.data as unknown as Uint8ClampedArray, targetW, targetH);
}
