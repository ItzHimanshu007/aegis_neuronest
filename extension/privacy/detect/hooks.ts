/**
 * Detection hooks for later stages (Stage 2 Part C.6). Wired into the cascade (detect/index.ts)
 * so each stage only needs to implement its own body, not touch the orchestration.
 *
 * `visualDetect` is Stage 5A: a local ONNX face detector (`../../perception/faceModel.ts`,
 * `../../perception/faceRegionCrop.ts`), scoped to exactly one thing — faces — and to exactly the
 * regions the DOM cannot already describe (`observation.media`: img/canvas/video/svg-image/
 * unmapped cross-origin frame/embed/object). It never runs on the whole screenshot, and it never
 * runs on a region the rest of the cascade already understands. `nerDetect`/`ocrDetect` remain
 * Stage 6/7 stubs — implementing them is explicitly out of scope for this session.
 */

import type { Observation, RawMedia } from '../../observe/types';
import type { Detection } from './types';
import { AEGIS_CONFIG } from '../../shared/config';
import { toPaddedPixelRect } from '../redactor';
import { detectFaces, modelInputDims, type FaceModelSource } from '../../perception/faceModel';
import { cropAndResize, decodeScreenshot } from '../../perception/faceRegionCrop';
import { loadBundledAsset } from '../../net/network';
// Vite's `?url` import resolves to the SAME hashed asset URL the bundler already emits for this
// file (onnxruntime-web's own module internally references it too) — importing it here, instead
// of maintaining a second manually-copied file under `public/`, means it ships exactly once
// rather than twice. See the model-load size note in eval/reports/stage5-face.md.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

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

/** Extension-page URLs for the bundled model/runtime — the only production `FaceModelSource`.
 * The WASM binary's URL comes from Vite's own `?url` asset resolution (so it ships as the one
 * copy Vite already bundles, not a second manually-duplicated file); the model's bytes are
 * fetched from this same extension's own package via `net/network.ts -> loadBundledAsset()`.
 * Never a network host (AGENTS.md invariant 7: no remote code; models are bundled, not fetched
 * from the network at runtime). */
function productionFaceModelSource(): FaceModelSource {
  return {
    wasmBinaryUrl: ortWasmUrl,
    loadModelBytes: () => loadBundledAsset(browser.runtime.getURL('/models/face-yunet/face_detection_yunet_2026may.onnx')),
  };
}

function isBlindRegionCandidate(media: RawMedia): boolean {
  return media.visible && media.bbox.width >= AEGIS_CONFIG.FACE_DETECT_MIN_REGION_PX && media.bbox.height >= AEGIS_CONFIG.FACE_DETECT_MIN_REGION_PX;
}

export interface RegionTiming {
  regionIndex: number;
  cssWidth: number;
  cssHeight: number;
  modelWidth: number;
  modelHeight: number;
  ms: number;
}

/** Test/measurement-only: per-region crop+inference timing from the most recent `visualDetect`
 * call, reset at the start of each call — see eval/reports/stage5-face.md's per-region-size
 * latency table. Read by the panel's `__aegisLastFaceRegionTimings` hook, never by production
 * code. */
let lastRegionTimings: RegionTiming[] = [];
export function getLastFaceRegionTimings(): RegionTiming[] {
  return lastRegionTimings;
}

/**
 * Runs the local face detector over every DOM-blind region in this capture. Returns one
 * `Detection` per face, category `FACE`, target `{ kind: 'media', ref: 'media-<i>-face-<n>' }` —
 * deliberately NOT the same ref as `unscannedMedia.ts`'s whole-region `media-<i>` detection, so
 * `merge.ts` keeps them as two separate decisions instead of collapsing them into one. That
 * matters: it's what lets the redactor draw the region's fail-closed FILL_REGION mask first and
 * the face's tight BLUR mask on top of it (see `docs/policy.yaml`'s `biometric` class docblock —
 * blur only makes sense as "preserve visual context" when the rest of the region can still be
 * fail-closed FILL_REGION underneath it, not also blurred).
 *
 * Lazy-loads the model (via `faceModel.ts`'s session cache) only when at least one candidate
 * region exists, and never touches regions the DOM already describes.
 */
export async function visualDetect(observation: Observation, captureId: string): Promise<Detection[]> {
  const candidates = observation.media
    .map((media, index) => ({ media, index }))
    .filter(({ media }) => isBlindRegionCandidate(media));
  if (candidates.length === 0 || !observation.screenshot.dataUrl) return [];

  const { scaleX, scaleY, dataUrl, pxW, pxH } = observation.screenshot;
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeScreenshot(dataUrl);
  } catch {
    // Fail closed by omission: no FACE detections means the region keeps its default
    // UNSCANNED_MEDIA/FILL_REGION treatment (unscannedMedia.ts) — never less safe than today.
    return [];
  }

  const source = productionFaceModelSource();
  const detections: Detection[] = [];
  lastRegionTimings = [];
  try {
    for (const { media, index } of candidates) {
      const pxRect = toPaddedPixelRect(media.bbox, scaleX, scaleY, pxW, pxH, 0);
      if (pxRect.width <= 0 || pxRect.height <= 0) continue;

      const dims = modelInputDims(pxRect.width, pxRect.height);
      const regionStart = performance.now();
      let faces;
      try {
        const region = await cropAndResize(bitmap, pxRect, dims);
        faces = await detectFaces(region.rgba, dims, 4, source);
      } catch {
        continue; // this region's fail-closed default still applies; just no FACE detection on it
      }
      lastRegionTimings.push({
        regionIndex: index,
        cssWidth: media.bbox.width,
        cssHeight: media.bbox.height,
        modelWidth: dims.width,
        modelHeight: dims.height,
        ms: performance.now() - regionStart,
      });

      for (const [n, face] of faces.entries()) {
        // Map the box from MODEL space back to the media element's own CSS rect by fraction —
        // this is exact regardless of the crop/resize's intermediate pixel scale.
        const fx0 = Math.max(0, Math.min(1, face.x / dims.width));
        const fy0 = Math.max(0, Math.min(1, face.y / dims.height));
        const fx1 = Math.max(0, Math.min(1, (face.x + face.width) / dims.width));
        const fy1 = Math.max(0, Math.min(1, (face.y + face.height) / dims.height));
        if (fx1 <= fx0 || fy1 <= fy0) continue;

        const rect = {
          x: media.bbox.x + fx0 * media.bbox.width,
          y: media.bbox.y + fy0 * media.bbox.height,
          width: (fx1 - fx0) * media.bbox.width,
          height: (fy1 - fy0) * media.bbox.height,
        };

        detections.push({
          id: `${captureId}-visual-${index}-${n}`,
          capture_id: captureId,
          source: 'visual',
          category: 'FACE',
          confidence: face.score,
          target: { kind: 'media', ref: `media-${index}-face-${n}` },
          rects: [rect],
        });
      }
    }
  } finally {
    bitmap.close();
  }
  return detections;
}
