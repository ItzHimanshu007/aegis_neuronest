import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markLocalOnly, type Observation, type RawMedia } from '../../../observe/types';

/**
 * Orchestration logic for Stage 5A's `visualDetect` (region selection, lazy-load gating,
 * MODEL-space -> CSS-rect mapping), tested with the model/crop layers mocked out. The real
 * numeric pipeline (real bundled model, real decode/NMS) is covered directly in
 * `perception/__tests__/faceModel.test.ts`; the real canvas crop is covered by the Playwright
 * e2e suite (needs a real `OffscreenCanvas`, which happy-dom doesn't provide — same split as
 * `privacy/redactor.ts`'s own tests).
 */

const detectFaces = vi.fn();
const cropAndResize = vi.fn();
const decodeScreenshot = vi.fn();

vi.mock('../../../perception/faceModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../perception/faceModel')>();
  return { ...actual, detectFaces };
});
vi.mock('../../../perception/faceRegionCrop', () => ({ cropAndResize, decodeScreenshot }));

// `browser.runtime.getURL` (WXT's global) — visualDetect calls it once per invocation to build a
// FaceModelSource; the actual URL value doesn't matter since detectFaces is mocked.
vi.stubGlobal('browser', { runtime: { getURL: (p: string) => `chrome-extension://test/${p}` } });

const { visualDetect } = await import('../hooks');

function media(overrides: Partial<RawMedia> = {}): RawMedia {
  return { kind: 'img', bbox: { x: 0, y: 0, width: 100, height: 100 }, alt: '', title: '', srcFilename: '', visible: true, frameId: 0, ...overrides };
}

function observationWith(mediaList: RawMedia[], overrides: Partial<Observation> = {}): Observation {
  return markLocalOnly({
    capture_id: 'cap1',
    ts: 0,
    url: 'https://example.test/a',
    title: 'Example',
    viewport: { cssW: 800, cssH: 600, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [{ frameId: 0, parentFrameId: null, url: 'https://example.test/a', mapping: 'top' }],
    elements: [],
    media: mediaList,
    textBlocks: [],
    screenshot: { dataUrl: 'data:image/png;base64,AAAA', pxW: 800, pxH: 600, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 0, harvestMs: 0, captureMs: 0, totalMs: 0 },
    counts: { elements: 0, visibleElements: 0, hiddenInteractive: 0, media: mediaList.length, textBlocks: 0, frames: 1 },
    ...overrides,
  });
}

const FAKE_BITMAP = { close: vi.fn() } as unknown as ImageBitmap;

beforeEach(() => {
  detectFaces.mockReset();
  cropAndResize.mockReset();
  decodeScreenshot.mockReset();
  decodeScreenshot.mockResolvedValue(FAKE_BITMAP);
  cropAndResize.mockResolvedValue({ rgba: new Uint8ClampedArray(4), dims: { width: 32, height: 32 } });
});

describe('visualDetect: lazy gating', () => {
  it('never decodes the screenshot or loads the model when there are no media regions', async () => {
    const detections = await visualDetect(observationWith([]), 'cap1');
    expect(detections).toEqual([]);
    expect(decodeScreenshot).not.toHaveBeenCalled();
    expect(detectFaces).not.toHaveBeenCalled();
  });

  it('skips invisible media entirely', async () => {
    await visualDetect(observationWith([media({ visible: false })]), 'cap1');
    expect(decodeScreenshot).not.toHaveBeenCalled();
  });

  it('skips regions smaller than the configured minimum on either side', async () => {
    await visualDetect(observationWith([media({ bbox: { x: 0, y: 0, width: 4, height: 100 } })]), 'cap1');
    expect(decodeScreenshot).not.toHaveBeenCalled();
  });

  it('returns nothing (fails closed) when there is no screenshot at all', async () => {
    const obs = observationWith([media()], { screenshot: { dataUrl: '', pxW: 0, pxH: 0, scaleX: 1, scaleY: 1 } });
    const detections = await visualDetect(obs, 'cap1');
    expect(detections).toEqual([]);
    expect(decodeScreenshot).not.toHaveBeenCalled();
  });

  it('fails closed (no detections, no throw) when the screenshot fails to decode', async () => {
    decodeScreenshot.mockRejectedValue(new Error('bad png'));
    const detections = await visualDetect(observationWith([media()]), 'cap1');
    expect(detections).toEqual([]);
  });

  it('closes the decoded bitmap even when a region crop throws', async () => {
    cropAndResize.mockRejectedValue(new Error('boom'));
    const detections = await visualDetect(observationWith([media()]), 'cap1');
    expect(detections).toEqual([]);
    expect(FAKE_BITMAP.close).toHaveBeenCalled();
  });
});

describe('visualDetect: detection shape and geometry', () => {
  it('produces no detections when the model finds nothing', async () => {
    detectFaces.mockResolvedValue([]);
    const detections = await visualDetect(observationWith([media()]), 'cap1');
    expect(detections).toEqual([]);
  });

  it('maps a face box from MODEL space back to the media element\'s CSS rect', async () => {
    // Region is a 100x100 CSS box at (0,0) -> modelInputDims(100, 100) rounds up to 96x96; the
    // mocked face box is exactly its top-left HALF, so the mapped CSS rect should be exactly half
    // of the 100x100 region too, regardless of the 100->96 rounding in between.
    detectFaces.mockResolvedValue([{ score: 0.88, x: 0, y: 0, width: 48, height: 48 }]);
    const detections = await visualDetect(observationWith([media({ bbox: { x: 0, y: 0, width: 100, height: 100 } })]), 'cap1');
    expect(detections).toHaveLength(1);
    const [d] = detections;
    expect(d).toMatchObject({
      capture_id: 'cap1',
      source: 'visual',
      category: 'FACE',
      confidence: 0.88,
      target: { kind: 'media', ref: 'media-0-face-0' },
    });
    expect(d!.rects).toEqual([{ x: 0, y: 0, width: 50, height: 50 }]);
  });

  it('offsets by the media element\'s own bbox position, not just its size', async () => {
    // Same 100x100 region (-> 96x96 model dims) as above, offset to (200, 300); face box is the
    // bottom-right half this time (starts at the midpoint, runs to the edge).
    detectFaces.mockResolvedValue([{ score: 0.9, x: 48, y: 48, width: 48, height: 48 }]);
    const detections = await visualDetect(observationWith([media({ bbox: { x: 200, y: 300, width: 100, height: 100 } })]), 'cap1');
    expect(detections[0]!.rects[0]).toEqual({ x: 200 + 50, y: 300 + 50, width: 50, height: 50 });
  });

  it('gives each face on the same region a distinct target ref, and each region its own index', async () => {
    detectFaces.mockResolvedValue([
      { score: 0.7, x: 0, y: 0, width: 8, height: 8 },
      { score: 0.9, x: 16, y: 16, width: 8, height: 8 },
    ]);
    const detections = await visualDetect(
      observationWith([media({ bbox: { x: 0, y: 0, width: 50, height: 50 } }), media({ bbox: { x: 200, y: 200, width: 50, height: 50 } })]),
      'cap1',
    );
    // Two faces on region 0 (from the mocked detectFaces call for EVERY region), plus two more
    // on region 1 — target refs must all be distinct.
    const refs = detections.map((d) => d.target.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toEqual(
      expect.arrayContaining(['media-0-face-0', 'media-0-face-1', 'media-1-face-0', 'media-1-face-1']),
    );
  });

  it('never produces a target ref shared with unscannedMedia.ts\'s whole-region detection', async () => {
    // unscannedMedia.ts always uses `media-${index}` with no suffix — merge.ts groups purely by
    // exact target ref, so this detection must never collide with that one.
    detectFaces.mockResolvedValue([{ score: 0.8, x: 0, y: 0, width: 16, height: 16 }]);
    const detections = await visualDetect(observationWith([media()]), 'cap1');
    expect(detections[0]!.target.ref).not.toBe('media-0');
  });
});
