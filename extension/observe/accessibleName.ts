/**
 * Accessible name/role computation, plus the separate "associated label text" field the
 * Observation type wants distinctly from the full AccName computation (Stage 1 Part C.3).
 *
 * Delegates the AccName-spec-correct parts (aria-labelledby, aria-label, native labelling,
 * placeholder/title fallback, etc.) to `dom-accessibility-api`, which implements the spec rather
 * than us re-deriving it. `dom-accessibility-api` is built against jsdom-shaped DOMs; it mostly
 * works under happy-dom too, but computed-style-dependent branches (e.g. treating
 * `display:none`-hidden subtrees as unnamed) can differ — see observe/__tests__/accessibleName.test.ts
 * for what's covered there vs. left to Playwright e2e.
 */

import { computeAccessibleName, getRole } from 'dom-accessibility-api';

export interface NameAndRole {
  name: string;
  role: string;
}

export function computeNameAndRole(el: Element): NameAndRole {
  return { name: computeName(el), role: computeRole(el) };
}

function computeName(el: Element): string {
  try {
    return computeAccessibleName(el) ?? '';
  } catch {
    return '';
  }
}

function computeRole(el: Element): string {
  try {
    return getRole(el) ?? implicitRoleFallback(el);
  } catch {
    return implicitRoleFallback(el);
  }
}

/** dom-accessibility-api's getRole returns null for a handful of tags it doesn't map (or under
 * DOM implementations missing APIs it needs) — fall back to the handful of roles Aegis actually
 * needs to distinguish for candidate classification. */
function implicitRoleFallback(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'summary') return 'button';
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'search') return 'searchbox';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    return 'textbox';
  }
  return 'generic';
}

/**
 * Finds the text of an explicitly associated <label> (label[for], or a wrapping <label>). Does
 * NOT fall back to aria-label/aria-labelledby/placeholder — those are already folded into
 * `name` via computeNameAndRole, and Observation wants `labelText` to specifically mean "there is
 * a real <label> element, and this is its text", for use as an independent fingerprint input and
 * for UI display.
 */
export function getAssociatedLabelText(el: Element, doc: Document = document): string {
  const id = el.getAttribute('id');
  if (id) {
    const escaped = cssEscapeId(id);
    const byFor = doc.querySelector(`label[for="${escaped}"]`);
    if (byFor?.textContent) return collapseWhitespace(byFor.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return collapseWhitespace(wrapping.textContent);
  return '';
}

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Minimal CSS.escape substitute for id selectors — avoids depending on CSS.escape's availability
 * (missing in some older test environments) for the one thing we need it for. */
function cssEscapeId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, '\\$&');
}
