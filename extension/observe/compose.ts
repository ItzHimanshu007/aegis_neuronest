/**
 * Composes multiple frames' harvest results into one Observation's top-level coordinate space and
 * numbering (Stage 1 Part C.6 + Part C.7's fpOrdinal, Part B's "mark_id (per-capture
 * sequential)"). Pure function: the actual frame-id matching that produces `offsetChain` for each
 * frame lives in entrypoints/background.ts, which needs live browser frame APIs.
 */

import { assignFpOrdinals } from './fingerprint';
import { composeToTopLevel, type FrameOffset } from './frames';
import type { RawElement, RawMedia, RawTextBlock } from './types';

export interface FrameComposeInput {
  frameId: number;
  /** Offsets from this frame up to the top level, innermost first. Empty for the top frame. */
  offsetChain: FrameOffset[];
  elements: Omit<RawElement, 'mark_id' | 'fpOrdinal'>[];
  media: RawMedia[];
  textBlocks: RawTextBlock[];
}

export interface ComposedObservationParts {
  elements: RawElement[];
  media: RawMedia[];
  textBlocks: RawTextBlock[];
}

/**
 * `inputs` must already be in the order the final `elements`/`media`/`textBlocks` arrays should
 * appear in (top-level frame first, then child frames in the order their <iframe> appears in the
 * DOM) — this order is what `mark_id` and `fpOrdinal` are derived from.
 */
export function composeObservation(inputs: FrameComposeInput[]): ComposedObservationParts {
  const elementsWithoutIds: Omit<RawElement, 'mark_id' | 'fpOrdinal'>[] = [];
  const media: RawMedia[] = [];
  const textBlocks: RawTextBlock[] = [];

  for (const frame of inputs) {
    for (const el of frame.elements) {
      elementsWithoutIds.push({
        ...el,
        bbox: composeToTopLevel(el.bbox, frame.offsetChain),
        lineRects: el.lineRects.map((r) => composeToTopLevel(r, frame.offsetChain)),
      });
    }
    for (const m of frame.media) {
      media.push({ ...m, bbox: composeToTopLevel(m.bbox, frame.offsetChain) });
    }
    for (const t of frame.textBlocks) {
      textBlocks.push({
        ...t,
        bbox: composeToTopLevel(t.bbox, frame.offsetChain),
        lineRects: t.lineRects.map((r) => composeToTopLevel(r, frame.offsetChain)),
      });
    }
  }

  const withOrdinals = assignFpOrdinals(elementsWithoutIds);
  const elements: RawElement[] = withOrdinals.map((el, index) => ({ ...el, mark_id: index }));

  return { elements, media, textBlocks };
}
