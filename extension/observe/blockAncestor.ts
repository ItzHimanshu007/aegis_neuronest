/**
 * Finds the nearest "block ancestor" of a text node, for grouping visible text into
 * `RawTextBlock`s (Stage 1 Part C, RawTextBlock). Pure/testable: takes a `getDisplay` reader
 * instead of calling `getComputedStyle` directly.
 */

import { AEGIS_CONFIG } from '../shared/config';

const BLOCK_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'LI',
  'TD',
  'TH',
  'LABEL',
  'DT',
  'DD',
  'FIGCAPTION',
  'CAPTION',
  'BLOCKQUOTE',
]);

const BLOCK_DISPLAYS = new Set(['block', 'list-item', 'table-cell', 'table-row', 'flex', 'grid']);

export interface FindBlockAncestorOptions {
  getDisplay?: (el: Element) => string;
  maxDepth?: number;
}

export function findBlockAncestor(start: Element, options: FindBlockAncestorOptions = {}): Element {
  const maxDepth = options.maxDepth ?? AEGIS_CONFIG.TEXT_BLOCK_MAX_ANCESTOR_DEPTH;
  let node: Element | null = start;
  let depth = 0;
  let fallback = start;
  while (node && depth <= maxDepth) {
    if (BLOCK_TAGS.has(node.tagName)) return node;
    if (options.getDisplay) {
      const display = options.getDisplay(node);
      if (BLOCK_DISPLAYS.has(display)) return node;
    }
    fallback = node;
    node = node.parentElement;
    depth++;
  }
  return fallback;
}
