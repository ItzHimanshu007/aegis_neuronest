/**
 * Candidate / media classification (Stage 1 Part C.2). Pure predicates over a single Element so
 * they're unit-testable without a full page.
 */

import type { PrivacyAttr, RawMediaKind } from './types';

const CANDIDATE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

const INTERACTIVE_ARIA_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
]);

const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);

/** Elements we never walk into or record. */
export function isSkippable(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') return true;
  if (el.hasAttribute('data-aegis-overlay')) return true;
  return false;
}

export function isDialogElement(el: Element): boolean {
  if (el.tagName === 'DIALOG' && (el as HTMLDialogElement).open) return true;
  const role = el.getAttribute('role');
  if (role && DIALOG_ROLES.has(role)) return true;
  if (el.getAttribute('aria-modal') === 'true') return true;
  return false;
}

export function hasInteractiveAncestor(el: Element): boolean {
  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 40) {
    if (isCandidateShallow(node)) return true;
    node = node.parentElement;
    depth++;
  }
  return false;
}

/** The tag/attribute/role part of candidacy — doesn't do the cursor:pointer style check, which
 * is comparatively expensive and only needed as a last resort. Exported so hasInteractiveAncestor
 * can reuse it without the style read. */
export function isCandidateShallow(el: Element): boolean {
  if (el.tagName === 'A') return el.hasAttribute('href');
  if (CANDIDATE_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return true;
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && tabindex !== '-1') return true;
  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ARIA_ROLES.has(role)) return true;
  if (isDialogElement(el)) return true;
  return false;
}

export interface CandidateOptions {
  /** Reads `cursor` off computed style — injectable so classification stays testable without a
   * full style engine. Real callers pass `(el) => getComputedStyle(el).cursor`. */
  getCursor?: (el: Element) => string;
}

/** Full candidacy check, including the `cursor: pointer` fallback (Stage 1 Part C.2, third
 * bullet: "elements with cursor: pointer that have no interactive ancestor"). */
export function isCandidate(el: Element, options: CandidateOptions = {}): boolean {
  if (isCandidateShallow(el)) return true;
  if (options.getCursor) {
    const cursor = options.getCursor(el);
    if (cursor === 'pointer' && !hasInteractiveAncestor(el)) return true;
  }
  return false;
}

const MEDIA_TAG_KIND: Record<string, RawMediaKind> = {
  IMG: 'img',
  CANVAS: 'canvas',
  VIDEO: 'video',
  EMBED: 'embed',
  OBJECT: 'object',
};

export function classifyMedia(el: Element): RawMediaKind | null {
  if (el.tagName === 'IFRAME') return 'iframe-unmapped'; // downgraded to a mapped frame if resolved
  if (el.tagName === 'IMAGE' && el.namespaceURI === 'http://www.w3.org/2000/svg') return 'svg-image';
  return MEDIA_TAG_KIND[el.tagName] ?? null;
}

const PRIVACY_ATTR_NAMES: PrivacyAttr[] = [
  'data-private',
  'data-pii',
  'data-hj-suppress',
  'data-clarity-mask',
  'rr-mask',
  'rr-block',
  'sentry-mask',
];

export function getPrivacyAttrs(el: Element): PrivacyAttr[] {
  const found: PrivacyAttr[] = [];
  for (const attr of PRIVACY_ATTR_NAMES) {
    if (el.hasAttribute(attr)) found.push(attr);
  }
  const autocomplete = el.getAttribute('autocomplete');
  if (autocomplete && autocomplete.toLowerCase().startsWith('cc-')) found.push('autocomplete-cc');
  if (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'password') {
    found.push('type-password');
  }
  return found;
}

const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'form']);

export function isLandmarkOrForm(el: Element): boolean {
  if (el.tagName === 'FORM') return true;
  const role = el.getAttribute('role');
  return role != null && LANDMARK_ROLES.has(role);
}
