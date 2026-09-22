import { isBeingTyped } from './typingState';
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
import { computeHitTarget, computeVisibility, domStyleReader } from './visibility';
import { isSecretLabel } from '../privacy/detect/labels';
import { getTextParts } from './spanRects';
import type { CssRect, ElementStates, ElementStructure, PrivacyAttr, RawElement, RawMedia, RawTextBlock, ValueLenBucket } from './types';
import { AEGIS_CONFIG } from '../shared/config';

/** An element as the harvester produces it: `fpOrdinal` is assigned by frame composition and `eid`
 * by the panel's session registry, so neither exists yet at harvest time. */
type HarvestedElement = Omit<RawElement, 'eid' | 'fpOrdinal'>;

export interface HarvestOptions {
  salt: string;
  frameId: number;
  doc?: Document;
  win?: Window;
  /** Populated (blockRef -> the live Element it was built from) as a side effect, so the caller
   * (entrypoints/content.ts) can serve SPAN_RECTS requests later in the same capture without a
   * second DOM walk. Never sent anywhere — Elements aren't serializable and this map never leaves
   * the content script. */
  blockRefMap?: Map<string, Element>;
  /** Short-lived executor lookup, local to the content script. */
  elementRefs?: Map<string, Element>;
}

export interface FrameHarvestResult {
  frameId: number;
  elements: HarvestedElement[];
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

/**
 * Stage 2 Part A1: for a secret field (password, OTP/CVV/UPI-PIN by autocomplete or label), the
 * raw string is never put into `RawElement.value` — `getRawValueAndHasValue` is called with
 * `treatAsSecret: true` and returns `hasValue` only, computed from `.value.length > 0`.
 *
 * That expression still invokes the browser's `.value` getter internally (there is no boolean-only
 * DOM signal for "does this field have any content" that works across all input types and
 * doesn't depend on a `placeholder`/`required` attribute being present) — but the resulting
 * string is never assigned to a variable, never leaves this expression, and is immediately
 * eligible for garbage collection. Nothing derived from it — not even a length — is ever stored;
 * `hasValue` is the one bit A1 explicitly says to keep emitting.
 */
function getRawValueAndHasValue(el: Element, treatAsSecret: boolean): { value?: string; hasValue: boolean } {
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button' || type === 'reset' || type === 'file' || type === 'image') {
      return { hasValue: false };
    }
    if (treatAsSecret) return { hasValue: input.value.length > 0 };
    return { value: input.value, hasValue: input.value.length > 0 };
  }
  if (tag === 'TEXTAREA') {
    const textarea = el as HTMLTextAreaElement;
    if (treatAsSecret) return { hasValue: textarea.value.length > 0 };
    return { value: textarea.value, hasValue: textarea.value.length > 0 };
  }
  if (tag === 'SELECT') {
    const select = el as HTMLSelectElement;
    if (treatAsSecret) return { hasValue: select.selectedIndex > -1 && select.value !== '' };
    return { value: select.value, hasValue: select.selectedIndex > -1 && select.value !== '' };
  }
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') {
    if (treatAsSecret) return { hasValue: (el.textContent ?? '').trim().length > 0 };
    const text = el.textContent ?? '';
    return { value: text, hasValue: text.trim().length > 0 };
  }
  return { hasValue: false };
}

/**
 * Stage 2 Part A1: true if this field's value must never be read into `RawElement.value` —
 * `input[type=password]`, `autocomplete` containing `one-time-code`/`cc-csc`, `autocomplete=cc-exp`
 * paired with a CVV-like label (a mislabelled expiry field some sites use for the security code),
 * or a label/name matching the OTP/CVV/UPI-PIN dictionary (privacy/detect/labels.ts).
 */
function isSecretField(inputType: string | undefined, autocomplete: string | undefined, name: string, labelText: string): boolean {
  if (inputType === 'password') return true;
  const ac = (autocomplete ?? '').toLowerCase();
  if (ac.includes('one-time-code') || ac.includes('cc-csc')) return true;
  const labelForMatching = name || labelText;
  if (ac.includes('cc-exp') && isSecretLabel(labelForMatching, autocomplete)) return true;
  return isSecretLabel(labelForMatching, autocomplete);
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

  const elements: HarvestedElement[] = [];
  const media: RawMedia[] = [];
  const capturedInteractive = new Set<Element>();
  const coveringNodes = new Map<HarvestedElement, Element>();
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
    const hit = visibility.visible ? computeHitTarget(el, rect, doc) : { hitOk: undefined, hitNode: null };
    const { name, role } = computeNameAndRole(el);
    const labelText = getAssociatedLabelText(el, doc);
    const inputType = getInputType(el);
    const nameAttr = el.getAttribute('name') ?? undefined;
    const autocomplete = el.getAttribute('autocomplete') ?? undefined;
    const isSecret = isSecretField(inputType, autocomplete, name, labelText);
    const { value, hasValue } = getRawValueAndHasValue(el, isSecret);
    const valueLenBucket = isSecret ? undefined : bucketValueLen((value ?? '').length);
    const ancestorSignature = getNearestLandmarkSignature(el.parentElement);

    const fp = computeFingerprint(
      { role, name, tag: el.tagName.toLowerCase(), inputType, autocomplete, nameAttr, ancestorSignature, labelText },
      options.salt,
      AEGIS_CONFIG.FP_HEX_LENGTH,
    );

    options.elementRefs?.set(localNodeRef(el), el);
    elements.push({
      beingTyped: isBeingTyped(el),
      nodeRef: localNodeRef(el),
      inForm: Boolean(el.closest('form')),
      formRef: el.closest('form') ? localNodeRef(el.closest('form')!) : undefined,
      inSearchScope: inputType === 'search' || Boolean(el.closest('search, [role=search]')),
      formActionOrigin: formActionOrigin(el),
      modalRef: el.closest('dialog, [role=dialog]') ? localNodeRef(el.closest('dialog, [role=dialog]')!) : undefined,
      href: el.tagName === 'A' ? (el as HTMLAnchorElement).href : undefined,
      download: el.hasAttribute('download'),
      formAction: el.hasAttribute('formaction'),
      buttonType: el.tagName === 'BUTTON' ? (el.getAttribute('type') ?? 'submit').toLowerCase() : undefined,
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
      hitOk: hit.hitOk,
      privacyAttrs: getPrivacyAttrs(el),
      inShadow,
      structure: getElementStructure(el),
    });
    if (hit.hitNode) coveringNodes.set(elements[elements.length - 1]!, hit.hitNode);
  }

  resolveCoveredBy(elements, coveringNodes, capturedInteractive);

  const textBlocks = harvestTextBlocks(root, options.frameId, capturedInteractive, win, options.blockRefMap);

  return { frameId: options.frameId, elements, media, textBlocks, dialogOpen };
}

/** Absolute origin a form would post to, or undefined when there is no form or no action
 * attribute (a form with no action submits to its own URL, which is same-origin by definition). */
function formActionOrigin(el: Element): string | undefined {
  const form = el.closest('form');
  const action = form?.getAttribute('action');
  if (!form || !action) return undefined;
  try {
    return new URL(action, (el.ownerDocument ?? document).baseURI).origin;
  } catch {
    return undefined;
  }
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

/** True if `el` (or an ancestor up to, but not including, `stopAt`) is a captured-interactive
 * element or is itself skippable — the exclusion rule text blocks and span-rect lookups share. */
function isExcludedFromTextBlock(el: Element, captured: Set<Element>): boolean {
  return captured.has(el) || isSkippable(el);
}

/** Discovers the set of block-ancestor elements under `root` that contain visible, non-captured
 * text (skipping text that's already captured as an interactive candidate's accessible name — see
 * module docblock), then delegates the actual text/offset extraction to `getTextParts`
 * (observe/spanRects.ts) so harvest-time offsets and later SPAN_RECTS-time offsets are always
 * computed by the exact same algorithm. */
function harvestTextBlocks(
  root: Element,
  frameId: number,
  captured: Set<Element>,
  win: Window,
  blockRefMap?: Map<string, Element>,
): RawTextBlock[] {
  const doc = root.ownerDocument;
  const order: Element[] = [];
  const seen = new Set<Element>();

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
        if (!seen.has(blockAncestor)) {
          seen.add(blockAncestor);
          order.push(blockAncestor);
        }
      }
    }
    textNode = treeWalker.nextNode();
  }

  const isExcluded = (el: Element) => isExcludedFromTextBlock(el, captured);
  const blocks: RawTextBlock[] = [];
  let localIndex = 0;
  for (const blockEl of order) {
    const visibility = computeVisibility(blockEl, { reader: domStyleReader });
    if (!visibility.visible) continue;
    const { text } = getTextParts(blockEl, isExcluded);
    if (!text) continue;
    const { role } = computeNameAndRole(blockEl);
    const blockRef = `${frameId}:${localIndex++}`;
    if (blockRefMap) blockRefMap.set(blockRef, blockEl);
    blocks.push({
      blockRef,
      text,
      lineRects: getLineRects(blockEl),
      bbox: rectFromDomRect(blockEl.getBoundingClientRect()),
      role,
      frameId,
      privacyAttrs: getInheritedPrivacyAttrs(blockEl, root),
      sectionHeading: getSectionHeading(blockEl),
    });
  }
  return blocks;
}

/**
 * Turns "something covers this element" into "EID X covers this element", by walking the covering
 * node up to the nearest captured candidate. This runs AFTER the harvest loop because the covering
 * element is often captured later in document order than the element it covers.
 *
 * A cover that is not itself a candidate (a bare styling <div>) leaves `coveredByRef` unset: the
 * planner is told the element is occluded, but not given an obstacle it could not act on anyway.
 */
function resolveCoveredBy(
  elements: HarvestedElement[],
  coveringNodes: Map<HarvestedElement, Element>,
  captured: Set<Element>,
): void {
  if (coveringNodes.size === 0) return;
  for (const [record, hitNode] of coveringNodes) {
    let node: Element | null = hitNode;
    while (node && !captured.has(node)) node = node.parentElement;
    if (node) record.coveredByRef = localNodeRef(node);
  }
}

/**
 * Stage 7B — local-only structural evidence (see `ElementStructure`).
 *
 * All of it is read from attributes and ancestors that are already in the DOM walk's reach, so
 * this costs one bounded ancestor climb per element and no extra layout. `maxLength`/`minLength`
 * come back as -1 from the DOM when unset, which is normalised away here rather than in every
 * consumer.
 *
 * NOTE none of this is passed to `computeFingerprint()`. EIDs must not move (invariant 12).
 */
function getElementStructure(el: Element): ElementStructure | undefined {
  const structure: ElementStructure = {};
  const input = el as HTMLInputElement;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) structure.placeholder = placeholder;
  const pattern = el.getAttribute('pattern');
  if (pattern) structure.pattern = pattern;
  const inputMode = el.getAttribute('inputmode');
  if (inputMode) structure.inputMode = inputMode;
  if (typeof input.maxLength === 'number' && input.maxLength >= 0) structure.maxLength = input.maxLength;
  if (typeof input.minLength === 'number' && input.minLength >= 0) structure.minLength = input.minLength;

  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
  if (legend) structure.legendText = legend;

  const columnHeader = getColumnHeaderText(el);
  if (columnHeader) structure.columnHeaderText = columnHeader;

  const heading = getSectionHeading(el);
  if (heading) structure.sectionHeading = heading;

  return Object.keys(structure).length > 0 ? structure : undefined;
}

/** The `<th>` governing this cell's column, by position within its row. Only resolves the common
 * `<thead><tr><th>` shape — a `headers=` attribute graph is deliberately out of scope. */
function getColumnHeaderText(el: Element): string | undefined {
  const cell = el.closest('td, th');
  const row = cell?.closest('tr');
  const table = row?.closest('table');
  if (!cell || !row || !table) return undefined;
  const columnIndex = Array.from(row.children).indexOf(cell);
  if (columnIndex < 0) return undefined;
  const headerRow = table.querySelector('thead tr') ?? table.querySelector('tr');
  if (!headerRow || headerRow === row) return undefined;
  return headerRow.children[columnIndex]?.textContent?.trim() || undefined;
}

/** Nearest enclosing section's heading. Bounded by TEXT_BLOCK_MAX_ANCESTOR_DEPTH so a deeply
 * nested node cannot walk the whole document. */
function getSectionHeading(el: Element): string | undefined {
  let node: Element | null = el;
  for (let depth = 0; node && depth < AEGIS_CONFIG.TEXT_BLOCK_MAX_ANCESTOR_DEPTH * 2; depth++) {
    const section: Element | null = node.closest('section, article, fieldset, [role=region], [role=group]');
    if (!section) break;
    const heading = section.querySelector('h1, h2, h3, h4, legend')?.textContent?.trim();
    if (heading) return heading;
    const label = section.getAttribute('aria-label');
    if (label) return label;
    node = section.parentElement;
  }
  return undefined;
}

/** Privacy markers on `el` or any ancestor up to and including `root`. Site authors put
 * `data-private` on a wrapper, not on every text node inside it. */
function getInheritedPrivacyAttrs(el: Element, root: Element): PrivacyAttr[] {
  const found = new Set<PrivacyAttr>();
  let node: Element | null = el;
  while (node) {
    for (const attr of getPrivacyAttrs(node)) found.add(attr);
    if (node === root) break;
    node = node.parentElement;
  }
  return Array.from(found);
}

export { buildFingerprintKey };

const nodeRefs = new WeakMap<Element, string>();
function localNodeRef(el: Element): string {
  let ref = nodeRefs.get(el);
  if (!ref) { ref = crypto.randomUUID(); nodeRefs.set(el, ref); }
  return ref;
}
