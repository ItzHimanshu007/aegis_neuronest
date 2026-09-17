/**
 * Privacy Set-of-Marks (Stage 3A Part B).
 *
 * The server plans against a sanitized image, but it can only *name* an element by its EID. Marks
 * bridge the two: after redaction, each outbound visible element gets a small tag on the image
 * carrying nothing but its EID string, so "click E14" is something the model can actually see
 * rather than infer from coordinates.
 *
 * Two placement rules keep this from weakening anything upstream:
 *
 *  1. **A label is never drawn inside a mask.** Masks are the redaction; painting over them would
 *     both hide the evidence and break `verifyMasks()`, which samples the shipped image. When an
 *     element is fully masked, its tag goes just outside the mask edge instead. This is why
 *     `verifyMasks()` needs no exclusion list and still runs over the final image — see
 *     `docs/architecture.md`.
 *  2. **Labels never overlap each other**, or dense forms would produce an unreadable pile.
 *
 * Placement is pure and lives here so it can be tested without a canvas; only `drawSomLabels`
 * touches rendering.
 */

import { AEGIS_CONFIG } from '../shared/config';
import type { EID } from '../scene/registry';

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SomCandidate {
  eid: EID;
  /** The element's box in SCREENSHOT PIXEL coordinates. */
  pxRect: PxRect;
}

export interface SomLabel {
  eid: EID;
  /** The label's box in SCREENSHOT PIXEL coordinates. */
  pxRect: PxRect;
}

export interface SomPlacementOptions {
  imageW: number;
  imageH: number;
  /** Rendered label height in the FINAL image; the caller scales it up for the full-res draw. */
  labelHeightPx: number;
  /** Width of one character at that height, for sizing the tag box. */
  charWidthPx: number;
}

/** Labels are `E` + up to 6 digits (AGENTS.md invariant 12). Used by `seal()` too. */
export const SOM_LABEL_PATTERN = /^E[0-9]{1,6}$/;

function overlaps(a: PxRect, b: PxRect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
  );
}

function withinImage(r: PxRect, imageW: number, imageH: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= imageW && r.y + r.height <= imageH;
}

/**
 * Chooses a box for each candidate's tag, in candidate order. Earlier candidates win a contested
 * spot, and a candidate with nowhere clear to go is skipped rather than drawn on top of a mask or
 * another label — a missing tag costs the planner one element, a wrong one costs it trust in all
 * of them.
 */
export function placeSomLabels(
  candidates: SomCandidate[],
  masks: PxRect[],
  options: SomPlacementOptions,
): SomLabel[] {
  const placed: SomLabel[] = [];
  const taken: PxRect[] = [];

  for (const candidate of candidates) {
    const w = Math.ceil(candidate.eid.length * options.charWidthPx) + 4;
    const h = Math.ceil(options.labelHeightPx);
    const { x, y, width, height } = candidate.pxRect;

    // Preferred spot first (inside the element's top-left), then just outside each element edge.
    const spots: PxRect[] = [
      { x, y, width: w, height: h },
      { x, y: y - h, width: w, height: h },
      { x: x - w, y, width: w, height: h },
      { x, y: y + height, width: w, height: h },
      { x: x + width, y, width: w, height: h },
    ];

    // A fully masked element has no clear edge of its own — every element-relative spot is still
    // inside the mask that covers it. Fall back to the edges of the covering masks, which is what
    // "just outside the mask" means for a field whose whole box is filled.
    for (const mask of masks.filter((m) => overlaps(m, candidate.pxRect))) {
      spots.push(
        { x, y: mask.y - h, width: w, height: h },
        { x, y: mask.y + mask.height, width: w, height: h },
        { x: mask.x - w, y, width: w, height: h },
        { x: mask.x + mask.width, y, width: w, height: h },
      );
    }

    const spot = spots.find(
      (s) => withinImage(s, options.imageW, options.imageH) && !masks.some((m) => overlaps(s, m)) && !taken.some((t) => overlaps(s, t)),
    );
    if (!spot) continue;

    placed.push({ eid: candidate.eid, pxRect: spot });
    taken.push(spot);
  }

  return placed;
}

/**
 * Full-resolution label height needed for the tag to render at `SOM_MIN_LABEL_PX` after the
 * redactor's downscale. Drawing at the final size and then shrinking would leave the text
 * unreadable exactly in the modes that downscale most.
 */
export function fullResLabelHeight(downscaleFactor: number): number {
  const safeFactor = downscaleFactor > 0 ? downscaleFactor : 1;
  return Math.ceil(AEGIS_CONFIG.SOM_MIN_LABEL_PX / safeFactor);
}

/** Draws the placed tags: a filled box, a 1px outline, and the EID in a contrasting colour. */
export function drawSomLabels(
  ctx: OffscreenCanvasRenderingContext2D,
  labels: SomLabel[],
  labelHeightPx: number,
): void {
  const style = AEGIS_CONFIG.SOM_STYLE;
  const fontSize = Math.max(1, Math.floor(labelHeightPx * 0.78));
  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineWidth = 1;

  for (const label of labels) {
    const { x, y, width, height } = label.pxRect;
    ctx.fillStyle = style.background;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = style.outline;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.fillStyle = style.text;
    ctx.fillText(label.eid, x + width / 2, y + height / 2, width - 2);
  }

  ctx.restore();
}
