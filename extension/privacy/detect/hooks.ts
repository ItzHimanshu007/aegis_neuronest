/**
 * Detection hooks for later stages (Stage 2 Part C.6). Each returns `[]` today — wired into the
 * cascade (detect/index.ts) so Stages 6/7 only need to implement the body, not touch the
 * orchestration.
 */

import type { Observation } from '../../observe/types';
import type { Detection } from './types';

// TODO(stage-5): classify visual regions (face/ID document/card/signature/QR) from the local
// vision model's output and turn matches into Detections targeting `visual_regions[]` entries.
export function visualDetect(_observation: Observation, _captureId: string): Detection[] {
  return [];
}

// TODO(stage-7): lazily-loaded named-entity recognition over text blocks, for names/addresses
// that regex + field-context miss (free-text bios, comment fields, etc.).
export function nerDetect(_observation: Observation, _captureId: string): Detection[] {
  return [];
}

// TODO(stage-6): OCR spans inside detector-only image regions (Stage 1/6's unified detector marks
// a region as text-bearing but DOM has nothing there — e.g. a canvas-rendered form).
export function ocrDetect(_observation: Observation, _captureId: string): Detection[] {
  return [];
}
