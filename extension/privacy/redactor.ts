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
import { drawSomLabels, fullResLabelHeight, placeSomLabels, type SomCandidate, type SomLabel } from './som';
import { FACE_TAG_LABEL, buildMaskLabel, categoryOnlyLabel } from './maskLabel';
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
  /** The closed-vocabulary label actually drawn inside this mask, if any. `seal()` re-checks every
   * one against `MASK_LABEL_PATTERN` and against the payload's own tokens. */
  label?: string;
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
  /** EID tags actually drawn on this image. `seal()` checks every one against the payload's
   * outbound elements, so a label can never name something the server was not sent. */
  somLabels: SomLabel[];
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
  /** Outbound, visible elements to tag, in the order they should win contested spots. Omitted or
   * empty means no marks are drawn. */
  somCandidates?: Array<{ eid: import('../scene/registry').EID; rect: { x: number; y: number; width: number; height: number } }>;
  /** Overrides AEGIS_CONFIG.SOM_ENABLED, for the panel's preview toggle. */
  somEnabled?: boolean;
  /** Overrides AEGIS_CONFIG.MASK_LABELS_ENABLED. Off means every mask is a plain solid fill, which
   * is the unlabelled arm the probe measures against. */
  maskLabelsEnabled?: boolean;
}

const FILL_COLOR = '#000000';
const LABEL_COLOR = '#ffffff';
const MIN_LABEL_HEIGHT_PX = 14;
const BLUR_SHORT_SIDE_PX = 8;

/** Horizontal breathing room inside the mask, per side. A label that needs more than the box has
 * is stepped down to the category-only form and then dropped — never drawn past the edge. */
const LABEL_PAD_PX = 4;
/** Cap on label size. The floor is the box: below MIN_LABEL_HEIGHT_PX there is no label at all. */
const LABEL_MAX_FONT_PX = 18;
/** Fraction of the box height a label's glyphs may occupy. Depends on the BOX only — never on the
 * hidden value's length or content (labelled-masks constraint 2). */
const LABEL_HEIGHT_RATIO = 0.6;

/** The face tag's own chip, drawn on top of the blur. The blur underneath is untouched. */
const FACE_TAG_HEIGHT_RATIO = 0.22;
const FACE_TAG_MIN_PX = 10;
const FACE_TAG_MAX_PX = 16;

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

/**
 * The label that WILL be drawn inside a mask box, or undefined for none.
 *
 * Pure, and a pure function of (kind, category, token, box geometry) — never of the hidden value.
 * `verifyMasks()` calls this with the same arguments to reproduce what `redact()` drew, so any
 * non-determinism here would turn into a false mask-integrity failure rather than a silent pass.
 *
 * Fitting is a step-down through the closed vocabulary, never a truncation: full label, then the
 * category-only form, then nothing. A cut-off string is not in the vocabulary, so it is never an
 * option (labelled-masks constraint 3).
 */
function fitMaskLabel(
  ctx: OffscreenCanvasRenderingContext2D,
  mask: Pick<AppliedMask, 'kind' | 'type' | 'token' | 'pxRect'>,
  fontSize: number,
): string | undefined {
  const full = buildMaskLabel(mask.type, mask.token);
  if (!full) return undefined;
  const available = mask.pxRect.width - LABEL_PAD_PX * 2;
  if (available <= 0) return undefined;

  ctx.font = `${fontSize}px monospace`;
  if (ctx.measureText(full).width <= available) return full;

  const short = categoryOnlyLabel(mask.type);
  if (short && short !== full && ctx.measureText(short).width <= available) return short;
  return undefined;
}

/** Font size for a mask's label. Derived from the BOX and nothing else — two masks of the same
 * size get the same size text whatever they are hiding (labelled-masks constraint 2). */
function labelFontSize(pxRect: AppliedMask['pxRect']): number {
  return Math.min(Math.floor(pxRect.height * LABEL_HEIGHT_RATIO), LABEL_MAX_FONT_PX);
}

/**
 * Draws one FILL-family mask: the solid fill, plus its typed label when labels are on.
 *
 * This is THE renderer for those masks. `redact()` calls it to produce the shipped image and
 * `verifyMasks()` calls it again to re-render what the shipped image should contain, so the two can
 * be compared pixel for pixel. Every piece of canvas state it depends on is set here inside a
 * save()/restore() pair — nothing is inherited from whatever drew last, which is what makes the
 * second render bit-identical to the first.
 *
 * Returns the label actually drawn, so the caller can record it for `seal()` to re-check.
 */
export function drawMaskFill(
  ctx: OffscreenCanvasRenderingContext2D,
  mask: Pick<AppliedMask, 'kind' | 'type' | 'token' | 'pxRect'>,
  labelsEnabled: boolean,
): string | undefined {
  const { pxRect } = mask;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = FILL_COLOR;
  ctx.fillRect(pxRect.x, pxRect.y, pxRect.width, pxRect.height);

  let drawn: string | undefined;
  if (labelsEnabled && pxRect.height >= MIN_LABEL_HEIGHT_PX) {
    const fontSize = labelFontSize(pxRect);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    drawn = fitMaskLabel(ctx, mask, fontSize);
    if (drawn) {
      // White on black: the highest contrast available, so the glyphs survive the downscale and
      // the PNG re-encode legibly (labelled-masks constraint 4, measured in e2e/mask-labels).
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = `${fontSize}px monospace`;
      // maxWidth is a backstop only — fitMaskLabel() has already guaranteed this fits, so the
      // glyphs are never condensed and the render stays a function of the box alone.
      ctx.fillText(drawn, pxRect.x + pxRect.width / 2, pxRect.y + pxRect.height / 2, pxRect.width - LABEL_PAD_PX * 2);
    }
  }
  ctx.restore();
  return drawn;
}

/**
 * Draws the `[FACE]` tag on top of an already-blurred face box. The blur is NOT touched — this
 * paints a small opaque chip inside the box so the model can tell a deliberate redaction from a
 * bad thumbnail. Same determinism rules as drawMaskFill(); same re-render in verifyMasks().
 */
export function drawFaceTag(ctx: OffscreenCanvasRenderingContext2D, pxRect: AppliedMask['pxRect']): string | undefined {
  const fontSize = Math.min(Math.max(Math.floor(pxRect.height * FACE_TAG_HEIGHT_RATIO), FACE_TAG_MIN_PX), FACE_TAG_MAX_PX);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const textWidth = ctx.measureText(FACE_TAG_LABEL).width;
  const chipW = Math.ceil(textWidth) + LABEL_PAD_PX * 2;
  const chipH = fontSize + LABEL_PAD_PX;
  if (chipW > pxRect.width || chipH > pxRect.height) {
    ctx.restore();
    return undefined;
  }
  ctx.fillStyle = FILL_COLOR;
  ctx.fillRect(pxRect.x, pxRect.y, chipW, chipH);
  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(FACE_TAG_LABEL, pxRect.x + chipW / 2, pxRect.y + chipH / 2, chipW - LABEL_PAD_PX * 2);
  ctx.restore();
  return FACE_TAG_LABEL;
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
  /** Full-res -> final-image factor this redaction used. Recorded rather than recomputed from the
   * two sizes, which round, so `verifyMasks()` reproduces the downscale exactly. */
  downscale: number;
  /** Whether labels were drawn. `verifyMasks()` needs it to re-render what it should be seeing. */
  labelsEnabled: boolean;
}

export async function redact(options: RedactOptions): Promise<RedactResult> {
  const source = await decodeDataUrl(options.dataUrl);
  const pxW = source.width;
  const pxH = source.height;

  const canvas = new OffscreenCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(source, 0, 0);

  const labelsEnabled = options.maskLabelsEnabled ?? AEGIS_CONFIG.MASK_LABELS_ENABLED;
  const applied: AppliedMask[] = [];
  for (const mask of options.masks) {
    const pxRect = toPaddedPixelRect(mask.rect, options.scaleX, options.scaleY, pxW, pxH);
    if (pxRect.width <= 0 || pxRect.height <= 0) continue;

    const candidate = { kind: mask.kind, type: mask.type, token: mask.token, pxRect };
    let label: string | undefined;
    if (mask.kind === 'BLUR') {
      // The blur is the redaction and stays exactly as it was. The tag only sits on top of it.
      drawIrreversibleBlur(ctx, source, pxRect);
      if (labelsEnabled) label = drawFaceTag(ctx, pxRect);
    } else {
      label = drawMaskFill(ctx, candidate, labelsEnabled);
    }
    applied.push({ rid: mask.rid, kind: mask.kind, type: mask.type, pxRect, token: mask.token, label });
  }
  source.close();

  // Downscale AFTER masking (see module docblock).
  const maxSide = maxSideForMode(options.mode);
  const scale = Math.min(1, maxSide / Math.max(pxW, pxH));
  const outW = Math.max(1, Math.round(pxW * scale));
  const outH = Math.max(1, Math.round(pxH * scale));

  // Marks go on after the masks and before the downscale: drawing at full resolution keeps the
  // tags sharp, and placing them around (never over) the masks leaves verifyMasks() valid on the
  // shipped image. Positions are computed in final-image space and scaled up, so a tag is the
  // same apparent size in every mode.
  const somEnabled = options.somEnabled ?? AEGIS_CONFIG.SOM_ENABLED;
  const somCandidates: SomCandidate[] = (options.somCandidates ?? []).map((c) => ({
    eid: c.eid,
    pxRect: toPaddedPixelRect(c.rect, options.scaleX, options.scaleY, pxW, pxH, 0),
  }));
  let somLabels: SomLabel[] = [];
  if (somEnabled && somCandidates.length > 0) {
    const labelHeight = fullResLabelHeight(scale);
    somLabels = placeSomLabels(somCandidates, applied.map((m) => m.pxRect), {
      imageW: pxW,
      imageH: pxH,
      labelHeightPx: labelHeight,
      charWidthPx: labelHeight * 0.62,
    });
    if (somLabels.length > 0) drawSomLabels(ctx, somLabels, labelHeight);
  }

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
    somLabels,
  } as RedactedImage;

  return { image, fullResolution: { canvas, pxW, pxH }, scaleX: options.scaleX, scaleY: options.scaleY, downscale: scale, labelsEnabled };
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
  failures: Array<{ rid: string; reason: string; sampled?: { r: number; g: number; b: number }; at?: { x: number; y: number } }>;
}

/** Tolerance for lossy re-encoding (WebP/JPEG) — a solid black fill survives compression, but not
 * always as exactly #000000. */
const FILL_TOLERANCE = 24;

function isFillColour(r: number, g: number, b: number): boolean {
  return r <= FILL_TOLERANCE && g <= FILL_TOLERANCE && b <= FILL_TOLERANCE;
}

/** Whether a point falls inside a rect (used to exclude a FILL-family mask's ring samples from
 * landing inside a DIFFERENT mask that legitimately overlaps it — see verifyMasks() below). */
function pointInRect(px: number, py: number, rect: AppliedMask['pxRect']): boolean {
  return px >= rect.x && px < rect.x + rect.width && py >= rect.y && py < rect.y + rect.height;
}

/**
 * Re-renders what the masked canvas SHOULD look like, so the shipped pixels can be compared against
 * a deterministic expectation rather than merely sampled for "dark enough".
 *
 * The reconstruction starts as a copy of the real masked canvas and then REPLAYS every mask in the
 * order `redact()` drew them:
 *
 *   - a FILL-family mask is re-drawn by `drawMaskFill()`, the same function that drew it the first
 *     time, with the same arguments. If the shipped image really contains that fill and that label,
 *     the replay changes nothing and the two agree pixel for pixel.
 *   - a BLUR is replayed by copying its box straight back out of the real canvas, because a blur is
 *     a function of the ORIGINAL pixels, which are gone by now and must never be kept. Its body is
 *     therefore trusted here exactly as it was before (blurs were excluded from the old check
 *     outright); what the replay does add is the `[FACE]` tag, which IS re-rendered and so IS
 *     checked. A blur's real guarantee remains that it is only ever applied to FACE/PHOTO and that
 *     its own coverage is checked by `firewall.ts`.
 *
 * Starting from a copy rather than a blank canvas is what makes the comparison exact: everything
 * outside the mask boxes is identical by construction, so the downscale — which mixes neighbouring
 * pixels across every box edge — produces identical output too, and the shipped PNG can be compared
 * to it with no tolerance at all.
 *
 * This is also why the check now catches things the ring sampling could not. A Set-of-Marks tag
 * painted over a mask, a label drawn outside its box and into the page, a label whose text is not
 * the one the payload says it is, a fill that is the right colour but the wrong shape: all of them
 * survive "every sampled pixel is dark" and none of them survives this.
 */
async function reconstruct(result: RedactResult): Promise<OffscreenCanvas | null> {
  const { canvas: real, pxW, pxH } = result.fullResolution;
  const scratch = new OffscreenCanvas(pxW, pxH);
  const ctx = scratch.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(real, 0, 0);

  for (const mask of result.image.masks) {
    const { x, y, width, height } = mask.pxRect;
    if (width <= 0 || height <= 0) continue;
    if (mask.kind === 'BLUR') {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(real, x, y, width, height, x, y, width, height);
      ctx.restore();
      if (result.labelsEnabled) drawFaceTag(ctx, mask.pxRect);
    } else {
      drawMaskFill(ctx, mask, result.labelsEnabled);
    }
  }
  return scratch;
}

/** Downscales exactly as `redact()` did, so the expected and shipped final images are comparable. */
function downscaleLike(source: OffscreenCanvas, result: RedactResult): OffscreenCanvas | null {
  const { pxW, pxH } = result.fullResolution;
  if (result.downscale >= 1) return source;
  const outW = Math.max(1, Math.round(pxW * result.downscale));
  const outH = Math.max(1, Math.round(pxH * result.downscale));
  const out = new OffscreenCanvas(outW, outH);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, pxW, pxH, 0, 0, outW, outH);
  return out;
}

/** Intersects a rect with an image, rounding OUTWARD so no edge pixel escapes comparison. */
function clampRect(rect: AppliedMask['pxRect'], scale: number, w: number, h: number): AppliedMask['pxRect'] | null {
  const x0 = Math.max(0, Math.floor(rect.x * scale));
  const y0 = Math.max(0, Math.floor(rect.y * scale));
  const x1 = Math.min(w, Math.ceil((rect.x + rect.width) * scale));
  const y1 = Math.min(h, Math.ceil((rect.y + rect.height) * scale));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** First differing pixel between two same-sized regions, or null when they are identical. */
function firstDifference(
  expected: OffscreenCanvasRenderingContext2D,
  actual: OffscreenCanvasRenderingContext2D,
  rect: AppliedMask['pxRect'],
): { x: number; y: number; r: number; g: number; b: number } | null {
  const a = expected.getImageData(rect.x, rect.y, rect.width, rect.height).data;
  const b = actual.getImageData(rect.x, rect.y, rect.width, rect.height).data;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      const pixel = i / 4;
      return {
        x: rect.x + (pixel % rect.width),
        y: rect.y + Math.floor(pixel / rect.width),
        r: b[i] ?? 0,
        g: b[i + 1] ?? 0,
        b: b[i + 2] ?? 0,
      };
    }
  }
  return null;
}

/**
 * Integrity check (Stage 2 Part F.2). For every FILL-family mask, samples a ring of pixels inside
 * the padded rect — but outside the centre where a label may be drawn — at FULL resolution and
 * again AFTER downscaling. Every sample must be the fill colour.
 *
 * BLUR masks are excluded from the colour check by design (they're supposed to retain structure);
 * their correctness is that they are only ever applied to FACE/PHOTO, which the caller enforces.
 *
 * A sample point that falls inside a DIFFERENT mask's rect is skipped, not failed: masks are
 * allowed to nest by design — a face detected inside an otherwise-unscanned image (Stage 5A)
 * produces both the whole-region FILL_REGION (drawn first, fail-closed default) and a tight BLUR
 * over just the face (drawn second, on top — see privacy/detect/hooks.ts). When the face nearly
 * fills the region, as a close-up photo often does, the FILL_REGION's own edge ring can legitimately
 * land inside that nested BLUR box; that pixel is correctly non-black by design, not a leak, and
 * the BLUR mask's OWN coverage (checked as a normal non-ALLOW detection by firewall.ts's coverage
 * check, not by this colour check) is what actually guards it.
 *
 * **Labelled masks add a second, stricter check on top of that one, and remove nothing.** The ring
 * sampling above runs exactly as it always did; what follows it is a pixel-for-pixel comparison of
 * every mask box against `reconstruct()`'s deterministic re-render, at full resolution AND on the
 * decoded shipped PNG, with no tolerance. Both must pass. The ring check alone could not tell a
 * correct label from a wrong one — both are "dark enough" outside the label band — and could not
 * see anything drawn over a mask after the fact; the comparison decides both, and still fails
 * closed on the original-pixels-leaking case the ring check already caught.
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

    const otherMasks = result.image.masks.filter((m) => m !== mask);

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
    ]
      .filter((p) => p.py < labelBandTop || p.py > labelBandBottom)
      .filter((p) => !otherMasks.some((m) => pointInRect(p.px, p.py, m.pxRect)));

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

  // --- deterministic re-render comparison ------------------------------------------------------
  // Fail-closed throughout: a reconstruction we cannot build is a verification we cannot do.
  const expected = await reconstruct(result);
  if (!expected) {
    downscaled.close();
    return { ok: false, failures: [...failures, { rid: '*', reason: 'no-reconstruction-context' }] };
  }
  const expectedCtx = expected.getContext('2d');
  const expectedDown = downscaleLike(expected, result);
  const expectedDownCtx = expectedDown?.getContext('2d');
  if (!expectedCtx || !expectedDownCtx) {
    downscaled.close();
    return { ok: false, failures: [...failures, { rid: '*', reason: 'no-reconstruction-context' }] };
  }
  if (expectedDown!.width !== downscaled.width || expectedDown!.height !== downscaled.height) {
    downscaled.close();
    return { ok: false, failures: [...failures, { rid: '*', reason: 'shipped-image-size-mismatch' }] };
  }

  for (const mask of result.image.masks) {
    const fullRect = clampRect(mask.pxRect, 1, result.fullResolution.pxW, result.fullResolution.pxH);
    if (fullRect) {
      const diff = firstDifference(expectedCtx, fullCtx, fullRect);
      if (diff) {
        failures.push({ rid: mask.rid, reason: 'full-resolution-differs-from-expected-render', sampled: { r: diff.r, g: diff.g, b: diff.b }, at: { x: diff.x, y: diff.y } });
        continue;
      }
    }
    const downRect = clampRect(mask.pxRect, scaleBack, downscaled.width, downscaled.height);
    if (!downRect) continue;
    const diff = firstDifference(expectedDownCtx, downCtx, downRect);
    if (diff) {
      failures.push({ rid: mask.rid, reason: 'shipped-image-differs-from-expected-render', sampled: { r: diff.r, g: diff.g, b: diff.b }, at: { x: diff.x, y: diff.y } });
    }
  }

  downscaled.close();
  return { ok: failures.length === 0, failures };
}
