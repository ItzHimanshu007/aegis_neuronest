// @vitest-environment node
//
// faceModel.ts has no DOM dependency at all (see its module docblock) — plain Node is more
// faithful here than the project's default happy-dom environment, which layers its own
// same-origin/CORS emulation on top of `fetch` and blocks the cross-port localhost request this
// suite's local HTTP server needs (a real browser extension page has no such restriction fetching
// its own bundled `chrome-extension://` resources).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectFaces,
  isFaceModelLoaded,
  modelInputDims,
  pixelsToBgrChw,
  releaseFaceModel,
  decodeYuNet,
  type FaceModelSource,
} from '../faceModel';

/**
 * Exercises the REAL bundled model end to end (no mocking of ONNX Runtime or the decode math) —
 * WASM inference is pure numeric I/O and runs identically under Node and a browser, so this gets
 * full fidelity without needing a browser (see the module docblock in `faceModel.ts`). Pixel
 * fixtures are raw RGBA buffers precomputed from two public-domain, StyleGAN-generated (no real
 * person) face photos and one purely synthetic non-face graphic — see
 * `demo-portal/public/faces/PROVENANCE.md` for where the source images came from.
 *
 * ONNX Runtime Web's `wasmPaths` map form fetches over HTTP in a browser; Node's `fetch` doesn't
 * support `file://`, so a tiny local HTTP server stands in for "an extension-page fetch of a
 * bundled asset" here — this is the same code path `hooks.ts` uses in production, just served
 * from localhost instead of `chrome-extension://`.
 */

const MODEL_PATH = resolve(__dirname, '../../public/models/face-yunet/face_detection_yunet_2026may.onnx');
const WASM_PATH = resolve(__dirname, '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');

let server: Server;
let source: FaceModelSource;

beforeAll(async () => {
  const wasmBytes = readFileSync(WASM_PATH);
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/wasm' });
    res.end(wasmBytes);
  });
  await new Promise<void>((done) => server.listen(0, done));
  const port = (server.address() as { port: number }).port;
  source = {
    wasmBinaryUrl: `http://127.0.0.1:${port}/ort-wasm-simd-threaded.wasm`,
    loadModelBytes: () => Promise.resolve(readFileSync(MODEL_PATH)),
  };
});

afterAll(async () => {
  releaseFaceModel();
  await new Promise((done) => server.close(done));
});

describe('modelInputDims', () => {
  it('rounds both dims up to the nearest multiple of 32 (the model errors on non-multiples)', () => {
    expect(modelInputDims(90, 90, 160)).toEqual({ width: 96, height: 96 });
    expect(modelInputDims(320, 240, 160)).toEqual({ width: 160, height: 128 });
  });

  it('never upscales past the region size, only caps the long side', () => {
    const dims = modelInputDims(1000, 500, 160);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(160);
    expect(dims.width % 32).toBe(0);
    expect(dims.height % 32).toBe(0);
  });

  it('never produces a zero dimension for a tiny region', () => {
    expect(modelInputDims(1, 1, 160)).toEqual({ width: 32, height: 32 });
  });
});

describe('pixelsToBgrChw', () => {
  it('swaps R and B and drops alpha, in planar CHW layout', () => {
    // 1x2 RGBA image: red pixel, then blue pixel.
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]);
    const chw = pixelsToBgrChw(rgba, 2, 1, 4);
    const plane = 2;
    // Pixel 0 (was red) -> B=0, G=0, R=255
    expect(chw[0]).toBe(0); // B plane, x=0
    expect(chw[plane + 0]).toBe(0); // G plane, x=0
    expect(chw[2 * plane + 0]).toBe(255); // R plane, x=0
    // Pixel 1 (was blue) -> B=255, G=0, R=0
    expect(chw[1]).toBe(255);
    expect(chw[plane + 1]).toBe(0);
    expect(chw[2 * plane + 1]).toBe(0);
  });
});

describe('decodeYuNet', () => {
  it('returns nothing when every score is below threshold', () => {
    const dims = { width: 32, height: 32 };
    const zeros = (n: number) => new Float32Array(n);
    const outputs = {
      cls_8: { data: zeros(16), dims: [1, 16, 1] },
      obj_8: { data: zeros(16), dims: [1, 16, 1] },
      bbox_8: { data: zeros(64), dims: [1, 16, 4] },
      cls_16: { data: zeros(4), dims: [1, 4, 1] },
      obj_16: { data: zeros(4), dims: [1, 4, 1] },
      bbox_16: { data: zeros(16), dims: [1, 4, 4] },
      cls_32: { data: zeros(1), dims: [1, 1, 1] },
      obj_32: { data: zeros(1), dims: [1, 1, 1] },
      bbox_32: { data: zeros(4), dims: [1, 1, 4] },
    };
    expect(decodeYuNet(outputs, dims)).toEqual([]);
  });

  it('suppresses overlapping duplicate boxes via NMS, keeping the higher-scoring one', () => {
    const dims = { width: 32, height: 32 };
    // Two grid cells (stride 32 => 1x1 grid, so use stride 8 => 4x4 grid) both predicting
    // (nearly) the same box, at two adjacent cells: NMS should keep only one.
    const cols = 4, rows = 4;
    const cls = new Float32Array(cols * rows).fill(0);
    const obj = new Float32Array(cols * rows).fill(0);
    const bbox = new Float32Array(cols * rows * 4).fill(0);
    const setCell = (r: number, c: number, score: number) => {
      const idx = r * cols + c;
      cls[idx] = score; obj[idx] = score;
      // exp(ln(3))=3 -> width=height=3*stride=24, vs. 8px between adjacent cell centers: the two
      // boxes below overlap by (24-8)/24 ≈ 67% on the shared axis, well past nmsThreshold.
      bbox[idx * 4 + 2] = Math.log(3); bbox[idx * 4 + 3] = Math.log(3);
    };
    setCell(1, 1, 0.95);
    setCell(1, 2, 0.90); // adjacent cell, heavily overlapping box of similar size
    const outputs = {
      cls_8: { data: cls, dims: [1, cols * rows, 1] },
      obj_8: { data: obj, dims: [1, cols * rows, 1] },
      bbox_8: { data: bbox, dims: [1, cols * rows, 4] },
      cls_16: { data: new Float32Array(0), dims: [1, 0, 1] },
      obj_16: { data: new Float32Array(0), dims: [1, 0, 1] },
      bbox_16: { data: new Float32Array(0), dims: [1, 0, 4] },
      cls_32: { data: new Float32Array(0), dims: [1, 0, 1] },
      obj_32: { data: new Float32Array(0), dims: [1, 0, 1] },
      bbox_32: { data: new Float32Array(0), dims: [1, 0, 4] },
    };
    const boxes = decodeYuNet(outputs, dims, { confThreshold: 0.5, nmsThreshold: 0.3 });
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.score).toBeCloseTo(0.95, 5);
  });
});

describe('detectFaces (real bundled model, real WASM inference)', () => {
  it('is not loaded until the first call', () => {
    expect(isFaceModelLoaded()).toBe(false);
  });

  it('detects a face in a real (public-domain, synthetic) portrait photo', async () => {
    const dims = { width: 160, height: 160 };
    const rgba = readFileSync(resolve(__dirname, 'fixtures/face-160x160.rgba'));
    const faces = await detectFaces(rgba, dims, 4, source);
    expect(faces.length).toBeGreaterThanOrEqual(1);
    expect(faces[0]!.score).toBeGreaterThan(0.6);
    // Sanity: the box should be a plausible fraction of the 160x160 frame, not the whole image
    // and not a sliver.
    expect(faces[0]!.width).toBeGreaterThan(20);
    expect(faces[0]!.width).toBeLessThan(160);
  }, 20_000);

  it('is loaded after a real detection call, and released after an explicit release', async () => {
    expect(isFaceModelLoaded()).toBe(true);
    releaseFaceModel();
    expect(isFaceModelLoaded()).toBe(false);
  });

  it('produces zero detections on a purely synthetic, face-free control graphic', async () => {
    const dims = { width: 160, height: 160 };
    const rgba = readFileSync(resolve(__dirname, 'fixtures/no-face-160x160.rgba'));
    const faces = await detectFaces(rgba, dims, 4, source);
    expect(faces).toEqual([]);
  }, 20_000);

  it('unloads the session after the configured idle window', async () => {
    // A short REAL window, not a faked one: `vi.useFakeTimers()` would also stub the timers the
    // real WASM/fetch machinery relies on internally during `detectFaces` itself.
    releaseFaceModel(); // force a fresh session so the custom idleUnloadMs below actually applies
    const dims = { width: 160, height: 160 };
    const rgba = readFileSync(resolve(__dirname, 'fixtures/face-160x160.rgba'));
    await detectFaces(rgba, dims, 4, { ...source, idleUnloadMs: 50 });
    expect(isFaceModelLoaded()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(isFaceModelLoaded()).toBe(false);
  }, 20_000);
});
