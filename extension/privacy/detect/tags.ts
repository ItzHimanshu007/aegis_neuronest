/**
 * Privacy-tag detection (Stage 2 Part C.1) — the cascade's cheapest, first layer. Reads
 * `RawElement.privacyAttrs`, which the Stage 1 harvester already computed
 * (observe/classify.ts's `getPrivacyAttrs`) from `data-private`, `data-pii`, `data-hj-suppress`,
 * `data-clarity-mask`, `rr-mask`, `rr-block`, `sentry-mask` and `type=password`.
 *
 * `type=password` is unambiguous (-> PASSWORD, high confidence). The generic markers just say
 * "the site itself thinks this is sensitive" without saying *what* — they produce a low-confidence
 * PRIVATE_GENERIC placeholder that `merge.ts` upgrades if a rule or field-context detection finds
 * a more specific category on the same element.
 */

import type { RawElement } from '../../observe/types';
import type { Detection } from './types';

export const GENERIC_PRIVACY_ATTRS = new Set(['data-private', 'data-pii', 'data-hj-suppress', 'data-clarity-mask', 'rr-mask', 'rr-block', 'sentry-mask']);

export function detectFromTags(el: RawElement, captureId: string, idFor: (suffix: string) => string): Detection[] {
  const detections: Detection[] = [];
  const rects = [el.bbox];

  if (el.privacyAttrs.includes('type-password')) {
    detections.push({
      id: idFor('tag-password'),
      capture_id: captureId,
      source: 'tag',
      category: 'PASSWORD',
      confidence: 1,
      target: { kind: 'element', ref: el.fp },
      rects,
    });
    return detections; // password is unambiguous; no need to also emit the generic marker
  }

  if (el.privacyAttrs.some((attr) => GENERIC_PRIVACY_ATTRS.has(attr))) {
    detections.push({
      id: idFor('tag-generic'),
      capture_id: captureId,
      source: 'tag',
      category: 'PRIVATE_GENERIC',
      confidence: 0.5,
      target: { kind: 'element', ref: el.fp },
      rects,
    });
  }

  return detections;
}
