/**
 * Canvas-dependent half of Stage 5A's face detection: cropping one DOM-blind region out of the
 * RAW screenshot and resizing it to the model's input dims. Needs a real `OffscreenCanvas`/
 * `createImageBitmap`, which happy-dom doesn't provide — covered by the Playwright e2e suite in a
 * real browser instead, exactly like `privacy/redactor.ts`'s own canvas-dependent half (see that
 * file's test docblock). The numeric half (preprocessing/inference/decode) lives in
 * `faceModel.ts` and is unit-tested directly.
 */

import type { ModelDims } from './faceModel';

/** Decodes a screenshot data URL once per capture, so every blind region in it can be cropped
 * from the same bitmap instead of re-decoding the PNG per region. Caller must `.close()` it. */
export function decodeScreenshot(dataUrl: string): Promise<ImageBitmap> {
  const commaIndex = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, commaIndex);
  const mimeType = meta.split(';')[0] || 'image/png';
  const binary = atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: mimeType }));
}

export interface CroppedRegion {
  rgba: Uint8ClampedArray;
  dims: ModelDims;
}

/** Crops `pxRect` (screenshot pixel space, already clamped to the image) out of `source` and
 * resizes it to `dims` in one draw — same "mask/crop before resample" ordering discipline as
 * `redactor.ts`, though here it's about not letting resampling smear pixels from a stale rect. */
export async function cropAndResize(
  source: ImageBitmap,
  pxRect: { x: number; y: number; width: number; height: number },
  dims: ModelDims,
): Promise<CroppedRegion> {
  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, pxRect.x, pxRect.y, pxRect.width, pxRect.height, 0, 0, dims.width, dims.height);
  const imageData = ctx.getImageData(0, 0, dims.width, dims.height);
  return { rgba: imageData.data, dims };
}
