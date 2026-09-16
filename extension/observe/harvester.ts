/**
 * The Set-of-Marks harvester (Stage 1 Part C). Runs inside a single frame (top-level or child —
 * the content script calls this once per frame it's injected into; entrypoints/background.ts
 * composes the per-frame results into one Observation's top-level coordinates — see
 * observe/frames.ts and observe/compose.ts).
 *
 * One pass, no layout writes: every function here only *reads* the DOM/styles. `harvestMs` in the
 * returned timings is measured end-to-end by the caller.
 */

import { getAssociatedLabelText, computeNameAndRole } from './accessibleName';
import { findBlockAncestor } from './blockAncestor';
import { classifyMedia, getPrivacyAttrs, isCandidate, isDialogElement, isLandmarkOrForm, isSkippable } from './classify';
import { buildFingerprintKey, computeFingerprint } from './fingerprint';
import { computeHitOk, computeVisibility, domStyleReader } from './visibility';
import type { CssRect, ElementStates, RawElement, RawMedia, RawTextBlock, ValueLenBucket } from './types';
import { AEGIS_CONFIG } from '../shared/config';

export interface HarvestOptions {
  salt: string;
  frameId: number;
  doc?: Document;
  win?: Window;
}

export interface FrameHarvestResult {
  frameId: number;
  elements: Omit<RawElement, 'mark_id' | 'fpOrdinal'>[];
  media: RawMedia[];
  textBlocks: RawTextBlock[];
  dialogOpen: boolean;
}

function rectFromDomRect(r: DOMRect): CssRect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Finds a possibly-closed shadow root, feature-detecting both browsers' APIs. Only attempted on
 * elements whose tag name contains a hyphen (i.e. could plausibly be a custom element) — native
 * built-in elements never host a shadow root, so this keeps the check cheap. */
function getShadowRoot(el: Element): { root: ShadowRoot; mode: 'open' | 'closed' } | null {
  if (el.shadowRoot) return { root: el.shadowRoot, mode: 'open' };
  if (!el.tagName.includes('-')) return null;

  const chromeDom = (globalThis as unknown as { chrome?: { dom?: { openOrClosedShadowRoot?: (e: Element) => ShadowRoot | null } } }).chrome?.dom;
  if (chromeDom?.openOrClosedShadowRoot) {
    try {
      const root = chromeDom.openOrClosedShadowRoot(el);
      if (root) return { root, mode: 'closed' };
    } catch {
      // Element has no shadow root — expected for most custom elements without one.
    }
  }

  const gecko = (el as unknown as { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot;
  if (gecko) return { root: gecko, mode: 'closed' };

  return null;
}

function getNearestLandmarkSignature(start: Element | null): string {
  let node = start;
  let depth = 0;
  while (node && depth < 60) {
    if (isLandmarkOrForm(node)) {
      const { name, role } = computeNameAndRole(node);
      return `${node.tagName.toLowerCase()}|${role}|${name.trim().toLowerCase()}`;
    }
    node = node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
    depth++;
  }
  return '';
}

function bucketValueLen(len: number): ValueLenBucket {
  if (len === 0) return 'empty';
  if (len <= AEGIS_CONFIG.VALUE_LEN_SHORT_MAX) return 'short';
  if (len <= AEGIS_CONFIG.VALUE_LEN_MEDIUM_MAX) return 'medium';
  return 'long';
}

function ariaTriState(value: string | null): boolean | 'mixed' | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'mixed') return 'mixed';
  return undefined;
}

function computeStates(el: Element, doc: Document): ElementStates {
  const asInput = el as HTMLInputElement;
  const asOption = el as HTMLOptionElement;
  const tag = el.tagName;

  let checked: boolean | 'mixed' | undefined;
  if (tag === 'INPUT' && (asInput.type === 'checkbox' || asInput.type === 'radio')) {
    checked = asInput.indeterminate ? 'mixed' : asInput.checked;
  } else if (el.hasAttribute('aria-checked')) {
    checked = ariaTriState(el.getAttribute('aria-checked'));
  }

  let selected: boolean | undefined;
  if (tag === 'OPTION') {
    selected = asOption.selected;
  } else if (el.hasAttribute('aria-selected')) {
    selected = el.getAttribute('aria-selected') === 'true';
  }

  return {
    disabled: Boolean((el as HTMLInputElement).disabled) || el.getAttribute('aria-disabled') === 'true',
    checked,
    selected,
    expanded: el.hasAttribute('aria-expanded') ? el.getAttribute('aria-expanded') === 'true' : undefined,
    focused: doc.activeElement === el,
    readonly: Boolean((el as HTMLInputElement).readOnly) || el.getAttribute('aria-readonly') === 'true',
    required: Boolean((el as HTMLInputElement).required) || el.getAttribute('aria-required') === 'true',
  };
}

function getRawValueAndHasValue(el: Element): { value?: string; hasValue: boolean } {
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button' || type === 'reset' || type === 'file' || type === 'image') {
      return { hasValue: false };
    }
    return { value: input.value, hasValue: input.value.length > 0 };
  }
  if (tag === 'TEXTAREA') {
    const textarea = el as HTMLTextAreaElement;
    return { value: textarea.value, hasValue: textarea.value.length > 0 };
  }
  if (tag === 'SELECT') {
    const select = el as HTMLSelectElement;
    return { value: select.value, hasValue: select.selectedIndex > -1 && select.value !== '' };
  }
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') {
    const text = el.textContent ?? '';
    return { value: text, hasValue: text.trim().length > 0 };
  }
  return { hasValue: false };
}

function getInputType(el: Element): string | undefined {
  if (el.tagName === 'INPUT') return ((el as HTMLInputElement).type || 'text').toLowerCase();
  if (el.tagName === 'TEXTAREA') return 'textarea';
  if (el.tagName === 'SELECT') return 'select';
  return undefined;
}

/** Element-content-box-as-single-line-rect for input/textarea values (Part C.5: "note this in
 * code" — we use the element's own bounding rect rather than subtracting border/padding, which
 * is close enough for the debug overlay and for redaction-region purposes in later stages). */
function getLineRects(el: Element): CssRect[] {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return [rectFromDomRect(el.getBoundingClientRect())];
  }
  try {
    const range = (el.ownerDocument ?? document).createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    range.detach?.();
    if (rects.length > 0) return rects.map(rectFromDomRect);
  } catch {
    // Falls through to the bounding-rect fallback below.
  }
  return [rectFromDomRect(el.getBoundingClientRect())];
}

interface WalkItem {
  node: Element;
  inShadow: 'open' | 'closed' | 'none';
}

/** Walks `root`'s subtree, including open and closed shadow roots, without descending into
 * skippable elements. Iterative (stack-based) to avoid recursion-depth issues on deep trees. */
function* walk(root: Element, initialShadowState: 'open' | 'closed' | 'none'): Generator<WalkItem> {
  const stack: WalkItem[] = [{ node: root, inShadow: initialShadowState }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;
    if (isSkippable(item.node)) continue;
    yield item;

    const shadow = getShadowRoot(item.node);
    const shadowChildren = shadow ? Array.from(shadow.root.children) : [];
    const lightChildren = Array.from(item.node.children);
    // Push light children first (in reverse, so they pop in document order), then shadow
    // children on top so shadow content is visited immediately after its host in this walk —
    // callers can tell them apart via `inShadow`.
    for (let i = lightChildren.length - 1; i >= 0; i--) {
      stack.push({ node: lightChildren[i]!, inShadow: item.inShadow });
    }
    for (let i = shadowChildren.length - 1; i >= 0; i--) {
      stack.push({ node: shadowChildren[i]!, inShadow: shadow!.mode });
    }
  }
}

export function harvestFrame(options: HarvestOptions): FrameHarvestResult {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const root = doc.body ?? doc.documentElement;
  if (!root) {
    return { frameId: options.frameId, elements: [], media: [], textBlocks: [], dialogOpen: false };
  }

  const elements: Omit<RawElement, 'mark_id' | 'fpOrdinal'>[] = [];
  const media: RawMedia[] = [];
  const capturedInteractive = new Set<Element>();
  let dialogOpen = false;

  const getCursor = (el: Element) => {
    try {
      return win.getComputedStyle(el).cursor;
    } catch {
      return 'auto';
    }
  };

  for (const { node: el, inShadow } of walk(root, 'none')) {
    if (isDialogElement(el)) dialogOpen = true;

    const mediaKind = classifyMedia(el);
    if (mediaKind) {
      const visibility = computeVisibility(el, { reader: domStyleReader });
      const rect = rectFromDomRect(el.getBoundingClientRect());
      media.push({
        kind: mediaKind,
        bbox: rect,
        alt: el.getAttribute('alt') ?? '',
        title: el.getAttribute('title') ?? '',
        srcFilename: extractSrcFilename(el),
        visible: visibility.visible,
        frameId: options.frameId,
      });
      // An <iframe> is never itself a "candidate", but it can still be classified below if it
      // somehow also matched (it won't, IFRAME isn't a candidate tag) — no `continue` needed.
    }

    if (!isCandidate(el, { getCursor })) continue;

    capturedInteractive.add(el);
    const visibility = computeVisibility(el, { reader: domStyleReader });
    const rect = rectFromDomRect(el.getBoundingClientRect());
    const { name, role } = computeNameAndRole(el);
    const labelText = getAssociatedLabelText(el, doc);
    const inputType = getInputType(el);
    const isPassword = inputType === 'password';
    const { value, hasValue } = getRawValueAndHasValue(el);
    const valueLenBucket = isPassword ? undefined : bucketValueLen((value ?? '').length);
    const ancestorSignature = getNearestLandmarkSignature(el.parentElement);
    const nameAttr = el.getAttribute('name') ?? undefined;
    const autocomplete = el.getAttribute('autocomplete') ?? undefined;

    const fp = computeFingerprint(
      { role, name, tag: el.tagName.toLowerCase(), inputType, autocomplete, nameAttr, ancestorSignature, labelText },
      options.salt,
      AEGIS_CONFIG.FP_HEX_LENGTH,
    );

    elements.push({
      fp,
      frameId: options.frameId,
      tag: el.tagName.toLowerCase(),
      role,
      name,
      labelText,
      inputType,
      autocomplete,
      nameAttr,
      value,
      hasValue,
      valueLenBucket,
      states: computeStates(el, doc),
      bbox: rect,
      lineRects: getLineRects(el),
      visible: visibility.visible,
      visibilityReason: visibility.reason,
      hiddenInteractive: !visibility.visible,
      hitOk: visibility.visible ? computeHitOk(el, rect, doc) : undefined,
      privacyAttrs: getPrivacyAttrs(el),
      inShadow,
    });
  }

  const textBlocks = harvestTextBlocks(root, options.frameId, capturedInteractive, win);

  return { frameId: options.frameId, elements, media, textBlocks, dialogOpen };
}

function extractSrcFilename(el: Element): string {
  const src = el.getAttribute('src') ?? (el as HTMLImageElement).currentSrc ?? '';
  if (!src) return '';
  try {
    const url = new URL(src, (el.ownerDocument ?? document).baseURI);
    const parts = url.pathname.split('/');
    return parts[parts.length - 1] ?? '';
  } catch {
    const parts = src.split('/');
    return parts[parts.length - 1] ?? '';
  }
}

/** Groups visible text nodes by their nearest block ancestor, skipping text that's already
 * captured as an interactive candidate's accessible name (see module docblock). */
function harvestTextBlocks(root: Element, frameId: number, captured: Set<Element>, win: Window): RawTextBlock[] {
  const doc = root.ownerDocument;
  const groups = new Map<Element, { texts: string[] }>();
  const order: Element[] = [];

  const treeWalker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || isSkippable(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let textNode: Node | null = treeWalker.nextNode();
  while (textNode) {
    const parent = (textNode as Text).parentElement;
    if (parent) {
      let insideCaptured = false;
      let node: Element | null = parent;
      while (node) {
        if (captured.has(node)) {
          insideCaptured = true;
          break;
        }
        node = node.parentElement;
      }
      if (!insideCaptured) {
        const blockAncestor = findBlockAncestor(parent, {
          getDisplay: (el) => {
            try {
              return win.getComputedStyle(el).display;
            } catch {
              return 'inline';
            }
          },
        });
        if (!groups.has(blockAncestor)) {
          groups.set(blockAncestor, { texts: [] });
          order.push(blockAncestor);
        }
        groups.get(blockAncestor)!.texts.push((textNode.textContent ?? '').trim());
      }
    }
    textNode = treeWalker.nextNode();
  }

  const blocks: RawTextBlock[] = [];
  for (const blockEl of order) {
    const visibility = computeVisibility(blockEl, { reader: domStyleReader });
    if (!visibility.visible) continue;
    const group = groups.get(blockEl)!;
    const { role } = computeNameAndRole(blockEl);
    blocks.push({
      text: group.texts.join(' ').replace(/\s+/g, ' ').trim(),
      lineRects: getLineRects(blockEl),
      bbox: rectFromDomRect(blockEl.getBoundingClientRect()),
      role,
      frameId,
    });
  }
  return blocks;
}

export { buildFingerprintKey };
