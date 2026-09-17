/**
 * Composes multiple frames' harvest results into one Observation's top-level coordinate space and
 * fingerprint ordinals. Element identity is assigned later by the session EIDRegistry.
 * Pure function: the actual frame-id matching that produces `offsetChain` for each
 * frame lives in entrypoints/background.ts, which needs live browser frame APIs.
 */

import { assignFpOrdinals } from './fingerprint';
import { composeToTopLevel, type FrameOffset } from './frames';
import type { RawElement, RawMedia, RawTextBlock } from './types';

export interface FrameComposeInput {
  frameId: number;
  /** Offsets from this frame up to the top level, innermost first. Empty for the top frame. */
  offsetChain: FrameOffset[];
  elements: Omit<RawElement, 'eid' | 'fpOrdinal'>[];
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
 * DOM) — this order determines duplicate fingerprint ordinals within each frame.
 */
export function composeObservation(inputs: FrameComposeInput[]): ComposedObservationParts {
  const elementsWithoutIds: Omit<RawElement, 'eid' | 'fpOrdinal'>[] = [];
  const media: RawMedia[] = [];
  const textBlocks: RawTextBlock[] = [];

  for (const frame of inputs) {
    for (const el of frame.elements) {
      elementsWithoutIds.push({
        ...el,
        // Independently harvested child frames start at local frame 0. The router's
        // frame assignment, not that local value, identifies the composed frame.
        frameId: frame.frameId,
        bbox: composeToTopLevel(el.bbox, frame.offsetChain),
        lineRects: el.lineRects.map((r) => composeToTopLevel(r, frame.offsetChain)),
      });
    }
    for (const m of frame.media) {
      media.push({ ...m, frameId: frame.frameId, bbox: composeToTopLevel(m.bbox, frame.offsetChain) });
    }
    for (const t of frame.textBlocks) {
      textBlocks.push({
        ...t,
        frameId: frame.frameId,
        blockRef: `${frame.frameId}:${t.blockRef.slice(t.blockRef.indexOf(':') + 1)}`,
        bbox: composeToTopLevel(t.bbox, frame.offsetChain),
        lineRects: t.lineRects.map((r) => composeToTopLevel(r, frame.offsetChain)),
      });
    }
  }

  const frames = new Map<number, typeof elementsWithoutIds>();
  for (const el of elementsWithoutIds) {
    const group = frames.get(el.frameId) ?? []; group.push(el); frames.set(el.frameId, group);
  }
  const elements: RawElement[] = [...frames.values()].flatMap(group => assignFpOrdinals(group));

  return { elements, media, textBlocks };
}
