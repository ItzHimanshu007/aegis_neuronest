/**
 * Stage 7D — evidence AGAINST classification.
 *
 * This is the half of the evidence layer that makes the other half safe. Intrinsic shape detection
 * without it does not improve the detector, it just redacts more: a 12-digit number is a batch
 * reference as often as an identifier, '₹4,533.00' is a product price as often as a balance, and
 * the page factory's own negative corpus is built from exactly these near-misses —
 * `eval/page_factory/data.py::batch_number` rejection-samples digit runs specifically so they are
 * "genuine near-misses", and renders them under a 'Recent reference numbers' heading.
 *
 * So the goal is not "detect everything that looks sensitive". It is "detect sensitive information
 * while minimizing unnecessary redaction", and that needs the detector to be able to say no.
 *
 * Everything here is deterministic and local. No model, no network, no page text retained.
 */

import { AEGIS_CONFIG } from '../../../shared/config';
import { normalizeLabel } from '../labels';
import type { CandidateContext, EvidenceSignal, ShapeHint } from './types';

/**
 * Container wording that means "this section is bookkeeping, not personal data". Matched against
 * the nearest heading / legend / column header only — never against the value, and never against
 * the whole page, because a checkout page legitimately contains both an order table and a card
 * field and must not have the whole thing written off.
 *
 * NOTE these are NOT label-dictionary phrases and this is not the dictionary growing sideways:
 * a hit here can only ever SUBTRACT points. There is no wording in this list that can cause a
 * value to be detected, so a hostile page cannot use it to force a classification.
 */
const NON_PII_CONTAINER_TERMS = [
  'catalogue', 'catalog', 'reference number', 'reference numbers', 'references',
  'order id', 'order number', 'invoice', 'invoices', 'receipt number',
  'sku', 'batch', 'lot number', 'product', 'products', 'item', 'items',
  'quantity', 'qty', 'stock', 'inventory', 'docket', 'shipment', 'consignment',
  'tracking', 'specification', 'specifications', 'part number', 'model number',
];

/**
 * Shapes that are definitively NOT personal data, whatever else they might also match. Checked
 * against the candidate's own text.
 */
const NON_PII_SHAPES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'sku', pattern: /^[A-Z]{2,5}-\d{2,6}(?:-\d{1,6})?$/i },
  { name: 'iso-timestamp', pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/ },
  { name: 'semver', pattern: /^v?\d+\.\d+\.\d+(?:[-+][\w.]+)?$/ },
  { name: 'hex-colour', pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i },
  { name: 'percentage', pattern: /^\d{1,3}(?:\.\d+)?%$/ },
  { name: 'dimensions', pattern: /^\d+\s?[x×]\s?\d+(?:\s?[x×]\s?\d+)?$/i },
  { name: 'file-size', pattern: /^\d+(?:\.\d+)?\s?(?:[kmgt]i?b|bytes?)$/i },
];

/** A username, not an identifier: short, lowercase-ish, no long digit run. Only ever used to damp
 * the opaque-token shape, which is the one shape loose enough to match a handle. */
const GENERIC_USERNAME = /^[a-z][a-z0-9_.]{2,15}$/;

export function matchesNonPiiShape(value: string): string | undefined {
  const trimmed = value.trim();
  return NON_PII_SHAPES.find((entry) => entry.pattern.test(trimmed))?.name;
}

export function isNonPiiContainer(containerText: string | undefined): boolean {
  if (!containerText) return false;
  const normalized = normalizeLabel(containerText);
  if (!normalized) return false;
  return NON_PII_CONTAINER_TERMS.some((term) => {
    const normalizedTerm = normalizeLabel(term);
    return new RegExp(`(?:^|\\s)${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(normalized);
  });
}

/**
 * Every negative signal that applies to this candidate.
 *
 * One asymmetry is deliberate: a container that names a non-PII section damps the candidate even
 * when a bound label disagrees, but only by points — it can never veto outright. A page that says
 * "Order summary" over a field labelled "Aadhaar number" containing a Verhoeff-valid Aadhaar still
 * scores far above the threshold, because checksum_pass (+5) and inline_label_bound (+3) together
 * outweigh non_pii_container (-3). Negative evidence argues; it does not overrule.
 */
export function negativeSignals(shape: ShapeHint, context: CandidateContext, value: string): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];

  // A checksum that FAILED on a shape whose checksum is definitional is the strongest negative
  // evidence available: a 12-digit run that fails Verhoeff is provably not an Aadhaar.
  if (shape.checksum === 'fail') signals.push({ name: 'checksum_fail_definitional', points: -4 });

  if (isNonPiiContainer(context.containerText)) signals.push({ name: 'non_pii_container', points: -3 });

  if (matchesNonPiiShape(value)) signals.push({ name: 'non_pii_shape', points: -3 });

  if ((context.repeatCount ?? 0) >= AEGIS_CONFIG.EVIDENCE_REPEAT_NEGATIVE_N) {
    signals.push({ name: 'repeated_across_page', points: -2 });
  }

  // A value the user typed into a search box is a query, not a record. It is still sanitized by
  // the side-channel path; it just should not be classified as the page's own personal data.
  if (context.inSearchScope) signals.push({ name: 'in_search_scope', points: -2 });

  if (shape.category === 'SECRET' && GENERIC_USERNAME.test(value.trim())) {
    signals.push({ name: 'generic_username_shape', points: -2 });
  }

  return signals;
}
