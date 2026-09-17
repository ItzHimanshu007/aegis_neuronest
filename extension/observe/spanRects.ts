/**
 * Span-rect service (Stage 2 Part A3). Given a text block element and a character-offset range
 * into its *joined* text (the same `text` string `harvestTextBlocks` in observe/harvester.ts
 * produces — trimmed per text node, joined with single spaces), returns the top-level CSS-px line
 * rects that substring occupies. Used so the redactor can mask exactly the substring a detection
 * rule found (e.g. one email address inside a paragraph) instead of the whole block.
 *
 * `getTextParts` re-derives the same node/offset structure `harvestTextBlocks` used to build that
 * `text` string, rather than persisting it from harvest time — cheaper to recompute on the rare
 * request than to keep every block's node references alive, and immune to going stale in a way
 * that wouldn't already be caught by the capture/state-token freshness check in
 * entrypoints/content.ts's SPAN_RECTS handler.
 */

import type { CssRect } from './types';

export interface TextPart {
  node: Text;
  /** Offset of this part's first character within the block's joined `text` string. */
  start: number;
  /** Offset one past this part's last character within the joined `text` string. */
  end: number;
  /** Offset within `node.textContent` (not the joined string) where the trimmed text begins —
   * accounts for leading whitespace `.trim()` removed. */
  nodeOffsetStart: number;
}

export interface TextBlockIndex {
  text: string;
  parts: TextPart[];
}

/** Rebuilds the block's text/parts index by walking its Text-node descendants, skipping anything
 * `isExcluded` rejects (captured interactive elements, skippable elements) — the same exclusion
 * logic `harvestTextBlocks` applies, so offsets line up with the `text` it already reported. */
export function getTextParts(blockEl: Element, isExcluded: (el: Element) => boolean): TextBlockIndex {
  const doc = blockEl.ownerDocument;
  const walker = doc.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      let n: Element | null = parent;
      while (n && n !== blockEl.parentElement) {
        if (isExcluded(n)) return NodeFilter.FILTER_REJECT;
        n = n.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const parts: TextPart[] = [];
  const chunks: string[] = [];
  let offset = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const raw = node.textContent ?? '';
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      if (chunks.length > 0) offset += 1; // the single-space separator harvestTextBlocks joins with
      const nodeOffsetStart = raw.indexOf(trimmed);
      const start = offset;
      const end = start + trimmed.length;
      parts.push({ node: node as Text, start, end, nodeOffsetStart: Math.max(0, nodeOffsetStart) });
      chunks.push(trimmed);
      offset = end;
    }
    node = walker.nextNode();
  }
  return { text: chunks.join(' '), parts };
}

function rectFromDomRect(r: DOMRect): CssRect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Returns the CSS-px line rects (in this element's own local/frame coordinate space — the
 * caller composes into top-level coordinates using the same offsetChain the block's frame used)
 * for `[start, end)` of the block's joined text. Returns `[]` if the range is empty/out of bounds. */
export function computeSpanRects(index: TextBlockIndex, start: number, end: number): CssRect[] {
  const clampedStart = Math.max(0, Math.min(start, index.text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, index.text.length));
  if (clampedEnd <= clampedStart) return [];

  const overlapping = index.parts.filter((p) => p.start < clampedEnd && p.end > clampedStart);
  if (overlapping.length === 0) return [];

  const first = overlapping[0]!;
  const last = overlapping[overlapping.length - 1]!;
  const localStart = first.nodeOffsetStart + (Math.max(clampedStart, first.start) - first.start);
  const localEnd = last.nodeOffsetStart + (Math.min(clampedEnd, last.end) - last.start);

  try {
    const range = first.node.ownerDocument!.createRange();
    range.setStart(first.node, Math.max(0, Math.min(localStart, first.node.length)));
    range.setEnd(last.node, Math.max(0, Math.min(localEnd, last.node.length)));
    const rects = Array.from(range.getClientRects()).map(rectFromDomRect);
    range.detach?.();
    return rects;
  } catch {
    return [];
  }
}
