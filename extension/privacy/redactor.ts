/**
 * Screenshot redactor (Stage 2 Part F.2). Masks the raw capture using DOM-derived rects, then
 * downscales and re-encodes. Runs in the agentHost (side panel document) via OffscreenCanvas.
 *
 * Order matters and is deliberate: **mask at full capture resolution first, then downscale**.
 * Masking after downscaling would let a fractional-pixel rect leave a sliver of the original
 * value visible along an edge, and any resampling of still-readable text is a partial-information
 * leak. Masking first means the pixels are already gone before any resampling happens.
 *
 * Invariant (AGENTS.md 5): text PII is only ever SOLID-FILLED. Blur is used only for FACE/PHOTO,
 * and is irreversible by construction (downsample to <= 8px on the short side, then upsample) —
 * never a reversible convolution, and never applied to text.
 */

import { AEGIS_CONFIG } from '../shared/config';
import type { Action } from './categoryTypes';
import type { Category } from './categoryTypes';

export type MaskKind = 'FILL' | 'LABELLED_FILL' | 'BLUR' | 'FILL_REGION';

export interface MaskRequest {
  eid?: import('../scene/registry').EID;
  rid: string;
  kind: MaskKind;
  type: Category;
  /** Top-level CSS-px rect. Converted to device pixels via the capture's scaleX/scaleY. */
  rect: { x: number; y: number; width: number; height: number };
  /** Shown inside the mask when there's room (e.g. "EMAIL" or the short token). */
  token?: string;
}

export interface AppliedMask {
  rid: string;
  kind: MaskKind;
  type: Category;
  /** The mask's rect in SCREENSHOT PIXEL coordinates, after padding/clamping. */
  pxRect: { x: number; y: number; width: number; height: number };
  token?: string;
}

declare const REDACTED_IMAGE_BRAND: unique symbol;

/** Only `redact()` can produce this. `payloadBuilder` accepts nothing else for `image`, so an
 * unredacted screenshot cannot be built into a payload even by mistake. */
export interface RedactedImage {
  readonly [REDACTED_IMAGE_BRAND]: true;
  dataUrl: string;
  pxW: number;
  pxH: number;
  capture_id: string;
  masks: AppliedMask[];
}

export type Mode = 'fast' | 'balanced' | 'accurate';

export interface RedactOptions {
  dataUrl: string;
  capture_id: string;
  /** Screenshot pixels per CSS pixel (from the Observation's screenshot info). */
  scaleX: number;
  scaleY: number;
  masks: MaskRequest[];
  mode: Mode;
}

const FILL_COLOR = '#000000';
const LABEL_COLOR = '#ffffff';
const MIN_LABEL_HEIGHT_PX = 14;
const BLUR_SHORT_SIDE_PX = 8;

export function maskKindForAction(action: Action, hasToken: boolean): MaskKind | null {
  switch (action) {
    case 'BLUR':
      return 'BLUR';
    case 'FILL_REGION':
      return 'FILL_REGION';
    case 'FILL':
    case 'USER_ENTERS':
    case 'USER_PROVIDED_ORIGIN_BOUND':
      return 'FILL';
    case 'TOKEN':
    case 'TOKEN_WITH_APPROVAL':
      // A tokenized value is still removed from the image — the token is what the server sees in
      // the structured payload, and labelling the box helps it correlate the two.
      return hasToken ? 'LABELLED_FILL' : 'FILL';
    case 'ALLOW':
      return null;
    default:
      return 'FILL';
  }
}

function maxSideForMode(mode: Mode): number {
  switch (mode) {
    case 'fast':
      return AEGIS_CONFIG.SERVER_IMAGE_MAX_SIDE_FAST;
    case 'accurate':
      return AEGIS_CONFIG.SERVER_IMAGE_MAX_SIDE_ACCURATE;
    default:
      return AEGIS_CONFIG.SERVER_IMAGE_MAX_SIDE_BALANCED;
  }
}

function decodeDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const commaIndex = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, commaIndex);
  const mimeType = meta.split(';')[0] || 'image/png';
  const binary = atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: mimeType }));
}

/** Converts a CSS-px rect to screenshot pixels, pads it, and clamps it to the image. */
export function toPaddedPixelRect(
  rect: { x: number; y: number; width: number; height: number },
  scaleX: number,
  scaleY: number,
  pxW: number,
  pxH: number,
  padCssPx: number = AEGIS_CONFIG.REDACT_PAD_CSS_PX,
): { x: number; y: number; width: number; height: number } {
  const padX = padCssPx * scaleX;
  const padY = padCssPx * scaleY;
  const x0 = Math.max(0, Math.floor(rect.x * scaleX - padX));
  const y0 = Math.max(0, Math.floor(rect.y * scaleY - padY));
  const x1 = Math.min(pxW, Math.ceil((rect.x + rect.width) * scaleX + padX));
  const y1 = Math.min(pxH, Math.ceil((rect.y + rect.height) * scaleY + padY));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

function drawSolidFill(ctx: OffscreenCanvasRenderingContext2D, pxRect: AppliedMask['pxRect'], label?: string): void {
  ctx.fillStyle = FILL_COLOR;
  ctx.fillRect(pxRect.x, pxRect.y, pxRect.width, pxRect.height);

  if (label && pxRect.height >= MIN_LABEL_HEIGHT_PX) {
    const fontSize = Math.min(Math.floor(pxRect.height * 0.6), 18);
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // Keep a clear margin so the label never touches (and so never obscures) the mask's edge —
    // verifyMasks() samples a ring INSIDE the padded rect but outside this label area.
    const maxWidth = Math.max(0, pxRect.width - 8);
    ctx.fillText(label, pxRect.x + pxRect.width / 2, pxRect.y + pxRect.height / 2, maxWidth);
  }
}

/** Irreversible blur: downsample to <= BLUR_SHORT_SIDE_PX on the short side, then upsample back.
 * Information is destroyed at the downsample step — unlike a Gaussian convolution, there is
 * nothing to deconvolve. Faces only. */
function drawIrreversibleBlur(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, pxRect: AppliedMask['pxRect']): void {
  if (pxRect.width <= 0 || pxRect.height <= 0) return;
  const shortSide = Math.min(pxRect.width, pxRect.height);
  const scale = Math.min(1, BLUR_SHORT_SIDE_PX / shortSide);
  const tinyW = Math.max(1, Math.round(pxRect.width * scale));
  const tinyH = Math.max(1, Math.round(pxRect.height * scale));

  const tiny = new OffscreenCanvas(tinyW, tinyH);
  const tinyCtx = tiny.getContext('2d');
  if (!tinyCtx) return;
  tinyCtx.imageSmoothingEnabled = true;
  tinyCtx.drawImage(source, pxRect.x, pxRect.y, pxRect.width, pxRect.height, 0, 0, tinyW, tinyH);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tiny, 0, 0, tinyW, tinyH, pxRect.x, pxRect.y, pxRect.width, pxRect.height);

  // Thin outline so a blurred region is visually identifiable as deliberate, not just a bad image.
  ctx.strokeStyle = '#e67e22';
  ctx.lineWidth = 2;
  ctx.strokeRect(pxRect.x + 1, pxRect.y + 1, pxRect.width - 2, pxRect.height - 2);
}

export interface RedactResult {
  image: RedactedImage;
  /** Full-resolution masked canvas, kept for `verifyMasks` to sample before downscaling. */
  fullResolution: { canvas: OffscreenCanvas; pxW: number; pxH: number };
  /** The CSS-px -> screenshot-px scale this redaction used, so firewall.seal()'s coverage check
   * can convert a detection's CSS rects into the same pixel space as the applied masks. */
  scaleX: number;
  scaleY: number;
}

export async function redact(options: RedactOptions): Promise<RedactResult> {
  const source = await decodeDataUrl(options.dataUrl);
  const pxW = source.width;
  const pxH = source.height;

  const canvas = new OffscreenCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(source, 0, 0);

  const applied: AppliedMask[] = [];
  for (const mask of options.masks) {
    const pxRect = toPaddedPixelRect(mask.rect, options.scaleX, options.scaleY, pxW, pxH);
    if (pxRect.width <= 0 || pxRect.height <= 0) continue;

    if (mask.kind === 'BLUR') {
      drawIrreversibleBlur(ctx, source, pxRect);
    } else {
      drawSolidFill(ctx, pxRect, mask.kind === 'LABELLED_FILL' ? (mask.token ?? mask.type) : undefined);
    }
    applied.push({ rid: mask.rid, kind: mask.kind, type: mask.type, pxRect, token: mask.token });
  }
  source.close();

  // Downscale AFTER masking (see module docblock).
  const maxSide = maxSideForMode(options.mode);
  const scale = Math.min(1, maxSide / Math.max(pxW, pxH));
  const outW = Math.max(1, Math.round(pxW * scale));
  const outH = Math.max(1, Math.round(pxH * scale));

  let exportCanvas = canvas;
  if (scale < 1) {
    exportCanvas = new OffscreenCanvas(outW, outH);
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) throw new Error('OffscreenCanvas 2d context unavailable');
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.drawImage(canvas, 0, 0, pxW, pxH, 0, 0, outW, outH);
  }

  const dataUrl = await canvasToDataUrl(exportCanvas);

  const image = {
    dataUrl,
    pxW: outW,
    pxH: outH,
    capture_id: options.capture_id,
    masks: applied,
  } as RedactedImage;

  return { image, fullResolution: { canvas, pxW, pxH }, scaleX: options.scaleX, scaleY: options.scaleY };
}

async function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  // Lossless PNG now; compare WebP only in Stage 8 after mask verification.
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export interface VerifyResult {
  ok: boolean;
  failures: Array<{ rid: string; reason: string; sampled?: { r: number; g: number; b: number } }>;
}

/** Tolerance for lossy re-encoding (WebP/JPEG) — a solid black fill survives compression, but not
 * always as exactly #000000. */
const FILL_TOLERANCE = 24;

function isFillColour(r: number, g: number, b: number): boolean {
  return r <= FILL_TOLERANCE && g <= FILL_TOLERANCE && b <= FILL_TOLERANCE;
}

/**
 * Integrity check (Stage 2 Part F.2). For every FILL-family mask, samples a ring of pixels inside
 * the padded rect — but outside the centre where a label may be drawn — at FULL resolution and
 * again AFTER downscaling. Every sample must be the fill colour.
 *
 * BLUR masks are excluded from the colour check by design (they're supposed to retain structure);
 * their correctness is that they are only ever applied to FACE/PHOTO, which the caller enforces.
 */
export async function verifyMasks(result: RedactResult): Promise<VerifyResult> {
  const failures: VerifyResult['failures'] = [];

  const fullCtx = result.fullResolution.canvas.getContext('2d');
  if (!fullCtx) return { ok: false, failures: [{ rid: '*', reason: 'no-full-res-context' }] };

  const downscaled = await decodeDataUrl(result.image.dataUrl);
  const downCanvas = new OffscreenCanvas(downscaled.width, downscaled.height);
  const downCtx = downCanvas.getContext('2d');
  if (!downCtx) return { ok: false, failures: [{ rid: '*', reason: 'no-downscaled-context' }] };
  downCtx.drawImage(downscaled, 0, 0);
  const scaleBack = downscaled.width / result.fullResolution.pxW;

  for (const mask of result.image.masks) {
    if (mask.kind === 'BLUR') continue;
    const { x, y, width, height } = mask.pxRect;
    if (width < 4 || height < 4) continue; // too small to sample a meaningful ring

    // Ring: a few px inside each edge, avoiding the horizontal band where a label may sit.
    const inset = 2;
    const labelBandTop = y + height * 0.3;
    const labelBandBottom = y + height * 0.7;
    const samplePoints = [
      { px: x + inset, py: y + inset },
      { px: x + width - inset - 1, py: y + inset },
      { px: x + inset, py: y + height - inset - 1 },
      { px: x + width - inset - 1, py: y + height - inset - 1 },
      { px: x + width / 2, py: y + inset },
      { px: x + width / 2, py: y + height - inset - 1 },
    ].filter((p) => p.py < labelBandTop || p.py > labelBandBottom);

    for (const { px, py } of samplePoints) {
      const full = fullCtx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
      if (!isFillColour(full[0] ?? 255, full[1] ?? 255, full[2] ?? 255)) {
        failures.push({ rid: mask.rid, reason: 'full-resolution-sample-not-filled', sampled: { r: full[0] ?? 0, g: full[1] ?? 0, b: full[2] ?? 0 } });
        break;
      }

      const dx = Math.floor(px * scaleBack);
      const dy = Math.floor(py * scaleBack);
      if (dx < 0 || dy < 0 || dx >= downscaled.width || dy >= downscaled.height) continue;
      const down = downCtx.getImageData(dx, dy, 1, 1).data;
      if (!isFillColour(down[0] ?? 255, down[1] ?? 255, down[2] ?? 255)) {
        failures.push({ rid: mask.rid, reason: 'downscaled-sample-not-filled', sampled: { r: down[0] ?? 0, g: down[1] ?? 0, b: down[2] ?? 0 } });
        break;
      }
    }
  }

  downscaled.close();
  return { ok: failures.length === 0, failures };
}
