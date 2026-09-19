/**
 * Local face detector (Stage 5A). ONNX Runtime Web, WASM execution provider, running a bundled
 * YuNet model (`extension/public/models/face-yunet` — see SOURCE.md there for provenance/licence).
 *
 * Deliberately the ONLY vision model in the extension right now (AGENTS.md invariant 10: this
 * session implements face detection only — OCR/NER/UI-detection/screen-state stay Stage 6/7 TODOs).
 *
 * Everything in this file is pure numeric I/O (tensors in, `FaceBox[]` out) plus the ONNX Runtime
 * session's own lifecycle — no DOM, no OffscreenCanvas, no `chrome.*`. That split is deliberate:
 * WASM inference runs identically under Node and under a browser, so this module is fully
 * unit-testable in Vitest against the real bundled model (see `__tests__/faceModel.test.ts`). The
 * canvas-dependent half (cropping a region out of the raw screenshot) lives in
 * `faceRegionCrop.ts` and is covered by the Playwright e2e suite instead, mirroring
 * `privacy/redactor.ts`'s own split (see that file's test docblock).
 *
 * Runs single-threaded (`numThreads: 1`): a side panel document is not cross-origin-isolated, and
 * ORT Web's multi-threaded WASM path requires `SharedArrayBuffer`, which needs COOP/COEP headers
 * this extension does not set. The single wasm binary supports both modes; single-thread is just
 * a config flag, not a different artifact.
 */

import type * as ort from 'onnxruntime-web/wasm';
import { AEGIS_CONFIG } from '../shared/config';

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

export interface ModelDims {
  width: number;
  height: number;
}

/** YuNet's 3 output heads use strides 8/16/32; non-multiples of 32 crash the graph (a broadcast
 * shape mismatch between adjacent strides) — verified empirically against the bundled model
 * before this was written. Never upscales past the region's own size. */
export function modelInputDims(regionWidth: number, regionHeight: number, maxSide: number = AEGIS_CONFIG.FACE_DETECT_INPUT_MAX_SIDE): ModelDims {
  const longest = Math.max(regionWidth, regionHeight, 1);
  const scale = Math.min(1, maxSide / longest);
  const roundTo32 = (v: number) => Math.max(32, Math.round((v * scale) / 32) * 32);
  return { width: roundTo32(regionWidth), height: roundTo32(regionHeight) };
}

export interface FaceBox {
  /** sqrt(cls * obj), both already sigmoid outputs from the graph. 0..1. */
  score: number;
  /** All four in MODEL INPUT pixel space (0..dims.width / 0..dims.height), NOT clamped to the
   * frame — callers must clip before using these as a crop/mask rect. */
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------------------------
// Preprocessing
// ---------------------------------------------------------------------------------------------

/** RGBA (or RGB) interleaved, HWC -> BGR planar, CHW, float32, NO normalization (0..255 raw).
 * Matches OpenCV's `dnn::blobFromImage(image)` with default scale=1, mean=0, swapRB=false — the
 * preprocessing the model was trained/exported against (`cv.FaceDetectorYN`'s own C++ default). */
export function pixelsToBgrChw(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, channels: 3 | 4): Float32Array {
  const chw = new Float32Array(3 * width * height);
  const plane = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const dstIdx = y * width + x;
      const r = pixels[srcIdx] ?? 0;
      const g = pixels[srcIdx + 1] ?? 0;
      const b = pixels[srcIdx + 2] ?? 0;
      chw[dstIdx] = b; // B plane
      chw[plane + dstIdx] = g; // G plane
      chw[2 * plane + dstIdx] = r; // R plane
    }
  }
  return chw;
}

// ---------------------------------------------------------------------------------------------
// Decode (ported from OpenCV's C++ reference, Apache-2.0 — see SOURCE.md)
// ---------------------------------------------------------------------------------------------

const STRIDES = [8, 16, 32] as const;

interface YuNetOutputs {
  [key: string]: { data: Float32Array | Float64Array | number[]; dims: readonly number[] };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function iou(a: FaceBox, b: FaceBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Greedy NMS, highest score first. */
function nonMaxSuppress(boxes: FaceBox[], threshold: number): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const box of sorted) {
    if (kept.every((k) => iou(k, box) < threshold)) kept.push(box);
  }
  return kept;
}

/**
 * Decodes YuNet's raw per-stride `cls_S`/`obj_S`/`bbox_S` heads (kps_S carries 5 landmarks per
 * box; unused here — Aegis only needs the box) into face boxes in MODEL INPUT pixel space, then
 * applies NMS across all 3 strides together (a face straddling two strides' grid cells can fire
 * on both). Formula reproduced from `opencv/opencv`'s `face_detect.cpp`
 * (`FaceDetectorYNImpl::postProcess`, Apache-2.0): grid cell (r, c) at stride S predicts a box
 * centered at `((c + dx) * S, (r + dy) * S)` with size `(exp(dw) * S, exp(dh) * S)`.
 */
export function decodeYuNet(
  outputs: YuNetOutputs,
  dims: ModelDims,
  options: { confThreshold?: number; nmsThreshold?: number } = {},
): FaceBox[] {
  const confThreshold = options.confThreshold ?? AEGIS_CONFIG.FACE_DETECT_CONF_THRESHOLD;
  const nmsThreshold = options.nmsThreshold ?? AEGIS_CONFIG.FACE_DETECT_NMS_THRESHOLD;

  const raw: FaceBox[] = [];
  for (const stride of STRIDES) {
    const cols = dims.width / stride;
    const rows = dims.height / stride;
    const cls = outputs[`cls_${stride}`]?.data;
    const obj = outputs[`obj_${stride}`]?.data;
    const bbox = outputs[`bbox_${stride}`]?.data;
    if (!cls || !obj || !bbox) continue;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const score = Math.sqrt(clamp01(Number(cls[idx])) * clamp01(Number(obj[idx])));
        if (score < confThreshold) continue;

        const cx = (c + Number(bbox[idx * 4 + 0])) * stride;
        const cy = (r + Number(bbox[idx * 4 + 1])) * stride;
        const w = Math.exp(Number(bbox[idx * 4 + 2])) * stride;
        const h = Math.exp(Number(bbox[idx * 4 + 3])) * stride;
        raw.push({ score, x: cx - w / 2, y: cy - h / 2, width: w, height: h });
      }
    }
  }
  return nonMaxSuppress(raw, nmsThreshold);
}

// ---------------------------------------------------------------------------------------------
// Session lifecycle: lazy-load on first use, release after idle
// ---------------------------------------------------------------------------------------------

export interface FaceModelSource {
  /** Resolved URL of ORT Web's own `ort-wasm-simd-threaded.wasm` binary. Passed as an explicit
   * filename->URL map (not a directory-prefix string) so it works with WXT's typed, enumerated
   * `getURL()` — there is no `PublicPath` entry for a bare directory, only for the file itself. */
  wasmBinaryUrl: string;
  /** Fetches the bundled `.onnx` model bytes. Injected so tests can load straight from disk while
   * production fetches a `chrome.runtime.getURL(...)` extension asset — never a network URL
   * (AGENTS.md invariant: models are bundled, never fetched as remote code at runtime). */
  loadModelBytes: () => Promise<ArrayBuffer | Uint8Array>;
  /** Overrides `AEGIS_CONFIG.FACE_MODEL_IDLE_UNLOAD_MS` — tests use a short real window instead
   * of faking timers around real WASM/async inference calls. */
  idleUnloadMs?: number;
}

interface SessionState {
  session: ort.InferenceSession;
  idleTimer: ReturnType<typeof setTimeout>;
  idleUnloadMs: number;
}

let state: SessionState | undefined;
let ortModule: typeof ort | undefined;
let runtimeConfigured = false;

function scheduleIdleUnload(): void {
  if (!state) return;
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => releaseFaceModel(), state.idleUnloadMs);
}

/** True while a session is held in memory. Exposed for tests asserting lazy-load/idle-unload
 * timing without reaching into module-private state. */
export function isFaceModelLoaded(): boolean {
  return state !== undefined;
}

/** Releases the ONNX Runtime session (if any) and cancels the pending idle timer. Safe to call
 * when nothing is loaded. */
export function releaseFaceModel(): void {
  if (!state) return;
  clearTimeout(state.idleTimer);
  void state.session.release();
  state = undefined;
}

async function getSession(source: FaceModelSource): Promise<ort.InferenceSession> {
  if (state) {
    scheduleIdleUnload();
    return state.session;
  }

  if (!ortModule) ortModule = await import('onnxruntime-web/wasm');
  if (!runtimeConfigured) {
    ortModule.env.wasm.wasmPaths = { wasm: source.wasmBinaryUrl };
    // No cross-origin isolation in the side panel document — see module docblock.
    ortModule.env.wasm.numThreads = 1;
    ortModule.env.wasm.simd = true;
    ortModule.env.wasm.proxy = false;
    runtimeConfigured = true;
  }

  const modelBytes = await source.loadModelBytes();
  const session = await ortModule.InferenceSession.create(
    modelBytes instanceof Uint8Array ? modelBytes : new Uint8Array(modelBytes),
    { executionProviders: ['wasm'] },
  );
  const idleUnloadMs = source.idleUnloadMs ?? AEGIS_CONFIG.FACE_MODEL_IDLE_UNLOAD_MS;
  state = { session, idleUnloadMs, idleTimer: setTimeout(() => releaseFaceModel(), idleUnloadMs) };
  return session;
}

/**
 * Full numeric pipeline for ONE region: preprocess -> (lazy-load +) infer -> decode -> NMS.
 * `pixels` must already be resized to `dims` (the caller — `faceRegionCrop.ts` in production,
 * a fixture buffer in tests — owns the crop/resize since that step needs a real canvas).
 */
export async function detectFaces(
  pixels: Uint8Array | Uint8ClampedArray,
  dims: ModelDims,
  channels: 3 | 4,
  source: FaceModelSource,
): Promise<FaceBox[]> {
  const chw = pixelsToBgrChw(pixels, dims.width, dims.height, channels);
  const session = await getSession(source);
  const ortLib = ortModule!;
  const tensor = new ortLib.Tensor('float32', chw, [1, 3, dims.height, dims.width]);
  const inputName = session.inputNames[0];
  if (!inputName) return [];
  const outputs = await session.run({ [inputName]: tensor });
  scheduleIdleUnload();
  return decodeYuNet(outputs as unknown as YuNetOutputs, dims);
}
