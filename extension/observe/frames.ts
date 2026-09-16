/**
 * Frame coordinate composition (Stage 1 Part C.6). The actual frame-id *matching* (same-origin
 * `frameElement`, `browser.runtime.getFrameId`, src+size matching) needs live browser APIs and is
 * done in the content script / background — see entrypoints/content.ts and
 * entrypoints/background.ts. This module holds the pure coordinate-transform math so that part is
 * unit-testable on its own.
 */

import type { CssRect } from './types';

export interface FrameOffset {
  /** Top-left of the <iframe> element, in its parent frame's CSS pixels. */
  x: number;
  y: number;
  /** iframe content may be scaled relative to its own CSS pixels if the parent has a CSS
   * transform/zoom applied — 1 for the overwhelmingly common case. */
  scale: number;
}

/** Converts a rect from a child frame's local coordinates into its parent frame's coordinates. */
export function offsetRect(rect: CssRect, offset: FrameOffset): CssRect {
  return {
    x: rect.x * offset.scale + offset.x,
    y: rect.y * offset.scale + offset.y,
    width: rect.width * offset.scale,
    height: rect.height * offset.scale,
  };
}

/**
 * Composes a rect from an arbitrarily-nested frame into top-level coordinates, given the chain of
 * offsets from that frame up to the top level (innermost first).
 */
export function composeToTopLevel(rect: CssRect, chain: FrameOffset[]): CssRect {
  return chain.reduce((acc, offset) => offsetRect(acc, offset), rect);
}
