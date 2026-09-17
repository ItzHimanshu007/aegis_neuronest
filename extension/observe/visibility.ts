/**
 * Visibility computation. Cheap checks first (per docs/STAGES.md Stage 1 spec), returning a
 * `VisibilityReason` that explains the verdict either way — used both to decide whether an
 * element is actionable and, for hidden *interactive* elements, to flag a possible
 * injection/clickjacking vector (see docs/threat_model.md T2).
 *
 * Takes a small `StyleReader` abstraction instead of calling `getComputedStyle` directly so this
 * stays unit-testable under happy-dom, where computed-style support is partial.
 */

import { AEGIS_CONFIG } from '../shared/config';

export type VisibilityReason =
  | 'visible'
  | 'display-none'
  | 'visibility-hidden'
  | 'content-visibility-hidden'
  | 'opacity-zero'
  | 'zero-size'
  | 'clipped'
  | 'outside-viewport'
  | 'aria-hidden'
  | 'inert';

export interface VisibilityResult {
  visible: boolean;
  reason: VisibilityReason;
}

export interface StyleLike {
  display: string;
  visibility: string;
  contentVisibility?: string;
  opacity: string;
}

export interface StyleReader {
  getStyle(el: Element): StyleLike;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Default reader backed by the real `getComputedStyle` — used in the content script. */
export const domStyleReader: StyleReader = {
  getStyle(el: Element): StyleLike {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      visibility: cs.visibility,
      contentVisibility: (cs as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility,
      opacity: cs.opacity,
    };
  },
};

/** Walks up the assigned-slot/host chain too, so an element inside a shadow root whose *host* is
 * hidden is still correctly treated as hidden. */
function ancestorsAcrossShadow(el: Element): Element[] {
  const chain: Element[] = [];
  let node: Node | null = el;
  while (node) {
    if (node instanceof Element) chain.push(node);
    const parent: Node | null = node.parentNode;
    if (parent) {
      node = parent;
    } else if (node instanceof ShadowRoot) {
      node = node.host;
    } else {
      node = null;
    }
  }
  return chain;
}

export interface ComputeVisibilityOptions {
  reader?: StyleReader;
  /** Viewport size for the outside-viewport check. Defaults to window.innerWidth/Height. */
  viewport?: { width: number; height: number };
  /** getBoundingClientRect-equivalent for the element, injectable for tests. */
  getRect?: (el: Element) => RectLike;
  /** See shared/config.ts AEGIS_CONFIG.OPACITY_EPSILON. */
  opacityEpsilon?: number;
}

export function computeVisibility(el: Element, options: ComputeVisibilityOptions = {}): VisibilityResult {
  const reader = options.reader ?? domStyleReader;
  const getRect = options.getRect ?? ((e: Element) => e.getBoundingClientRect());
  const viewport = options.viewport ?? { width: window.innerWidth, height: window.innerHeight };

  const chain = ancestorsAcrossShadow(el);

  // aria-hidden and inert are inherited "on or above" — check the whole chain.
  for (const node of chain) {
    if (node.getAttribute?.('aria-hidden') === 'true') {
      return { visible: false, reason: 'aria-hidden' };
    }
  }
  for (const node of chain) {
    if ((node as HTMLElement).inert || node.hasAttribute?.('inert')) {
      return { visible: false, reason: 'inert' };
    }
  }

  let opacityProduct = 1;
  for (const node of chain) {
    const style = reader.getStyle(node);
    if (style.display === 'none') {
      return { visible: false, reason: 'display-none' };
    }
    if (style.visibility === 'hidden' || style.visibility === 'collapse') {
      return { visible: false, reason: 'visibility-hidden' };
    }
    if (style.contentVisibility === 'hidden') {
      return { visible: false, reason: 'content-visibility-hidden' };
    }
    const op = Number.parseFloat(style.opacity);
    if (!Number.isNaN(op)) opacityProduct *= op;
  }
  if (opacityProduct < (options.opacityEpsilon ?? AEGIS_CONFIG.OPACITY_EPSILON)) {
    return { visible: false, reason: 'opacity-zero' };
  }

  const rect = getRect(el);
  if (rect.width <= 0 || rect.height <= 0) {
    return { visible: false, reason: 'zero-size' };
  }

  // Fully outside the viewport (cheap axis-aligned check; partial overlap still counts visible).
  const outside =
    rect.x + rect.width <= 0 ||
    rect.y + rect.height <= 0 ||
    rect.x >= viewport.width ||
    rect.y >= viewport.height;
  if (outside) {
    return { visible: false, reason: 'outside-viewport' };
  }

  // Fully clipped by an ancestor with overflow:hidden/clip and a non-overlapping rect. We only
  // check direct overflow-hidden ancestors' rects (not clip-path geometry, which is a fuller
  // hit-testing problem left to `hitOk`).
  for (const node of chain) {
    if (node === el) continue;
    const style = getComputedStyleSafe(node);
    if (style && (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden')) {
      const ancestorRect = getRect(node);
      const noOverlap =
        rect.x + rect.width <= ancestorRect.x ||
        rect.y + rect.height <= ancestorRect.y ||
        rect.x >= ancestorRect.x + ancestorRect.width ||
        rect.y >= ancestorRect.y + ancestorRect.height;
      if (noOverlap) {
        return { visible: false, reason: 'clipped' };
      }
    }
  }

  return { visible: true, reason: 'visible' };
}

function getComputedStyleSafe(el: Element): CSSStyleDeclaration | null {
  if (typeof getComputedStyle !== 'function') return null;
  try {
    return getComputedStyle(el);
  } catch {
    return null;
  }
}

/**
 * `hitOk`: does `elementFromPoint` at the element's bbox centre return this element or one of its
 * descendants? Used to catch elements that are geometrically "visible" per the checks above but
 * are actually covered by something else (a banner, an overlay) — see docs/threat_model.md T2
 * "clickjacking the approval".
 *
 * happy-dom does not implement `elementFromPoint` at the time of writing (Stage 1) — callers
 * should treat `undefined` as "not checked here, will be covered by Playwright e2e" rather than
 * as a failure.
 */
export function computeHitOk(el: Element, rect: RectLike, doc: Document = document): boolean | undefined {
  return computeHitTarget(el, rect, doc).hitOk;
}

/**
 * The same hit test, but it also hands back whatever `elementFromPoint` actually returned. The
 * harvester needs that node to answer "covered by what?" — the planner can only clear an obstacle
 * it is told about (Stage 3A Part A1).
 */
export function computeHitTarget(
  el: Element,
  rect: RectLike,
  doc: Document = document,
): { hitOk: boolean | undefined; hitNode: Element | null } {
  if (typeof doc.elementFromPoint !== 'function') return { hitOk: undefined, hitNode: null };

  // Sample the centre of the part of the element that is actually ON SCREEN, not the centre of
  // its box. A field scrolled half past the bottom edge has its box centre outside the viewport,
  // where elementFromPoint returns null — reading that as "covered" marked perfectly clear fields
  // as occluded, which is the opposite of what the planner needs to know.
  const view = viewportOf(doc);
  let sampleX = rect.x + rect.width / 2;
  let sampleY = rect.y + rect.height / 2;
  if (view.width > 0 && view.height > 0) {
    const left = Math.max(rect.x, 0);
    const top = Math.max(rect.y, 0);
    const right = Math.min(rect.x + rect.width, view.width);
    const bottom = Math.min(rect.y + rect.height, view.height);
    if (right <= left || bottom <= top) return { hitOk: undefined, hitNode: null };
    sampleX = (left + right) / 2;
    sampleY = (top + bottom) / 2;
  }

  const hit = doc.elementFromPoint(sampleX, sampleY);
  if (!hit) return { hitOk: undefined, hitNode: null };
  const hitOk = hit === el || el.contains(hit) || hit.contains(el);
  return { hitOk, hitNode: hitOk ? null : hit };
}

/** Zero means "unknown" — callers then sample the element's own centre rather than clipping to a
 * viewport they cannot measure. */
function viewportOf(doc: Document): { width: number; height: number } {
  const win = doc.defaultView;
  return {
    width: win?.innerWidth ?? doc.documentElement?.clientWidth ?? 0,
    height: win?.innerHeight ?? doc.documentElement?.clientHeight ?? 0,
  };
}
