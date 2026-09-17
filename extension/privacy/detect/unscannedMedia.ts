/**
 * Unscanned-media detection (Stage 2 Part C.5). Every visible `RawMedia` (img/canvas/video/
 * embed/object/iframe-unmapped) becomes a fail-closed UNSCANNED_MEDIA detection — Aegis cannot
 * see what's inside an image or an unmapped cross-origin frame until Stage 6's vision layer
 * exists, so the safe default is to mask it entirely (see docs/policy.yaml's `documents` class).
 *
 * TODO(stage-6): replace this blanket treatment with real visual classification — most images on
 * a real page are decorative (logos, icons) and don't need masking at all; this stage can't yet
 * tell the difference, so it treats all of them the same, conservatively.
 */

import type { RawMedia } from '../../observe/types';
import type { Detection } from './types';

export function detectUnscannedMedia(media: RawMedia[], captureId: string, idFor: (suffix: string) => string): Detection[] {
  const detections: Detection[] = [];
  for (const [index, m] of media.entries()) {
    if (!m.visible) continue;
    detections.push({
      id: idFor(`unscanned-${index}`),
      capture_id: captureId,
      source: 'unscanned',
      category: 'UNSCANNED_MEDIA',
      confidence: 1,
      target: { kind: 'media', ref: `media-${index}` },
      rects: [m.bbox],
    });
  }
  return detections;
}
