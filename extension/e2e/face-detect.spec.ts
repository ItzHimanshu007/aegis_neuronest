import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize } from './fixtures/sanitize';
import type { Page } from '@playwright/test';

/**
 * Stage 5A: the local ONNX face detector (extension/perception/faceModel.ts,
 * extension/privacy/detect/hooks.ts's `visualDetect`). Real bundled model, real WASM inference,
 * real browser — the numeric decode/NMS math is already unit-tested directly against the same
 * model in perception/__tests__/faceModel.test.ts; this suite checks it end to end through the
 * real cascade, redactor and firewall, against demo-portal/pii-zoo.html's synthetic faces
 * (see demo-portal/public/faces/PROVENANCE.md — every face here is AI-generated, no real person).
 *
 * Every test asserts its precondition before acting (Stage 3B Part II's rule): the state-diagram
 * bug that rule exists because of was found by testing what the real loop does, not what it's
 * supposed to do — the same reasoning applies to "was this image actually a face photo" and "was
 * this page actually free of media regions" here.
 */

type LastObserveResult = {
  observation: {
    viewport: { cssW: number; cssH: number };
    media: Array<{ bbox: { x: number; y: number; width: number; height: number } }>;
  };
};

async function readLastObserveResult(panelPage: Page): Promise<LastObserveResult> {
  const result = await panelPage.evaluate(() => (window as unknown as { __aegisLastObserveResult?: LastObserveResult }).__aegisLastObserveResult);
  if (!result) throw new Error('__aegisLastObserveResult was not set — observeAndSanitize should have set it');
  return result;
}

async function isFaceModelLoaded(panelPage: Page): Promise<boolean> {
  return panelPage.evaluate(() => (window as unknown as { __aegisIsFaceModelLoaded?: () => boolean }).__aegisIsFaceModelLoaded?.() ?? false);
}

/** Luminance mean/variance over a CSS-fraction rect of a data-URL image, decoded in the browser
 * (matching webp-pixel-identity.spec.ts's convention of decoding via a real Image/OffscreenCanvas
 * rather than a Node image library) — used for BOTH raw and redacted images, each with its own
 * natural pixel size, so the same fractional rect lands on the same visual region in both despite
 * the redacted image being downscaled relative to the raw one. */
async function regionLuminanceStats(
  page: Page,
  dataUrl: string,
  fracRect: { x: number; y: number; width: number; height: number },
): Promise<{ mean: number; variance: number; n: number }> {
  return page.evaluate(async ({ url, frac }) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const x = Math.max(0, Math.floor(frac.x * img.naturalWidth));
    const y = Math.max(0, Math.floor(frac.y * img.naturalHeight));
    const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(frac.width * img.naturalWidth)));
    const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(frac.height * img.naturalHeight)));
    const data = ctx.getImageData(x, y, w, h).data;
    let sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      sum += lum; sumSq += lum * lum; n++;
    }
    const mean = sum / n;
    return { mean, variance: sumSq / n - mean * mean, n };
  }, { url: dataUrl, frac: fracRect });
}

/** Scrolls the element into view and returns its CSS-px viewport bounding box, BEFORE observing —
 * callers combine this with the fresh `observation.viewport` dims (available only AFTER
 * `observeAndSanitize`) to get a fraction that lands on the same visual region in both the raw
 * and redacted images regardless of the redacted image's downscale. */
async function boundingBoxOf(targetPage: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  await targetPage.evaluate((sel) => document.querySelector(sel)!.scrollIntoView({ block: 'center' }), selector);
  const box = await targetPage.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box (not visible?)`);
  return box;
}

test.describe('Stage 5A: local face detection', () => {
  test('faces in <img> are detected and irreversibly blurred in the sealed bytes', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    const box = await boundingBoxOf(targetPage, '#zoo-face-profile');

    const result = await observeAndSanitize(panelPage, targetPage);
    const { observation } = await readLastObserveResult(panelPage);
    expect(observation.viewport.cssW, 'precondition: the capture must have a sane viewport to fraction against').toBeGreaterThan(0);

    const faceDetections = result.preview.detections.filter((d) => d.category === 'FACE');
    expect(faceDetections.length, 'the profile-photo face must be detected').toBeGreaterThan(0);
    for (const d of faceDetections) {
      expect(d.action, `FACE detection ${d.id} must resolve to BLUR (docs/policy.yaml biometric class)`).toBe('BLUR');
    }

    expect(result.preview.redactedImageDataUrl, 'a redacted image must exist to check').toBeTruthy();
    // Sample only the CENTRAL 30% of the element, not its whole bounding box: the profile photo
    // is a close-up (face fills most of the frame), but the element's own outer edges may fall
    // outside the detected face box, in the surrounding fail-closed FILL_REGION (solid black,
    // zero variance) rather than the BLUR box. Mixing a solid-black region with a blurred one in
    // one sample would raise, not lower, the combined variance (a bimodal distribution has higher
    // total variance than either part alone) — exactly the false failure this measurement must
    // avoid. The centre of a close-up portrait is reliably inside the face's own blur box.
    const centerFrac = {
      x: (box.x + box.width * 0.35) / observation.viewport.cssW,
      y: (box.y + box.height * 0.35) / observation.viewport.cssH,
      width: (box.width * 0.3) / observation.viewport.cssW,
      height: (box.height * 0.3) / observation.viewport.cssH,
    };

    const raw = await regionLuminanceStats(panelPage, result.preview.rawImageDataUrl, centerFrac);
    const redacted = await regionLuminanceStats(panelPage, result.preview.redactedImageDataUrl!, centerFrac);

    // Precondition: this must actually BE a textured photo region in the raw capture, or a low
    // variance in the redacted image would prove nothing about irreversibility.
    expect(raw.variance, 'precondition: the raw region must have real photographic texture').toBeGreaterThan(30);
    // The irreversible-blur claim: destroying detail, not merely "some pixels changed".
    expect(redacted.variance, 'blur must sharply reduce pixel variance, not just perturb it').toBeLessThan(raw.variance * 0.35);
  });

  test('a face inside a canvas-rendered region is detected', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    // Precondition: the canvas must have actually finished drawing the face image before we
    // observe it (pii-zoo.ts draws it via an async Image.onload).
    await targetPage.waitForFunction(() => {
      const canvas = document.getElementById('zoo-face-canvas') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Not still the canvas's default fully-transparent/blank buffer.
      return data.some((v, i) => i % 4 === 3 && v > 0);
    });
    await targetPage.evaluate(() => document.getElementById('zoo-face-canvas')!.scrollIntoView({ block: 'center' }));

    const result = await observeAndSanitize(panelPage, targetPage);
    const faceDetections = result.preview.detections.filter((d) => d.category === 'FACE');
    expect(faceDetections.length, 'the canvas-drawn face must be detected — canvas is just as DOM-blind as img').toBeGreaterThan(0);
  });

  test('the face-free control produces zero FACE detections on its own region', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    await targetPage.evaluate(() => document.getElementById('zoo-face-control')!.scrollIntoView({ block: 'center' }));
    const controlBox = await targetPage.locator('#zoo-face-control').boundingBox();
    expect(controlBox, 'precondition: the control image must be visible').toBeTruthy();

    const result = await observeAndSanitize(panelPage, targetPage);
    const { observation } = await readLastObserveResult(panelPage);

    const controlIndex = observation.media.findIndex(
      (m) => Math.abs(m.bbox.x - controlBox!.x) < 2 && Math.abs(m.bbox.y - controlBox!.y) < 2,
    );
    expect(controlIndex, 'precondition: the control <img> must be identifiable in the observation\'s media list').toBeGreaterThanOrEqual(0);

    const controlFaceDetections = result.preview.detections.filter(
      (d) => d.category === 'FACE' && d.targetRef.startsWith(`media-${controlIndex}-face-`),
    );
    expect(controlFaceDetections, 'a purely procedural, non-photographic control image must produce zero face detections').toEqual([]);
  });

  test('the model does not load until a blind (media) region is actually encountered', async ({ context, sidepanelUrl }) => {
    // login.html has zero <img>/<canvas>/<iframe> — see this test's own precondition check.
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/login.html');
    const mediaCount = await targetPage.evaluate(() => document.querySelectorAll('img, canvas, iframe, embed, object').length);
    expect(mediaCount, 'precondition: login.html must have no media regions at all').toBe(0);

    expect(await isFaceModelLoaded(panelPage), 'the model must not be loaded before any observation at all').toBe(false);
    await observeAndSanitize(panelPage, targetPage);
    expect(await isFaceModelLoaded(panelPage), 'a capture with zero media regions must never load the model').toBe(false);

    // Now observe a page that DOES have blind regions, in the SAME panel session, and confirm the
    // model becomes loaded — proving the false above was "not yet", not "can't happen at all".
    await targetPage.goto('/pii-zoo.html');
    await targetPage.evaluate(() => document.getElementById('zoo-face-profile')!.scrollIntoView({ block: 'center' }));
    await observeAndSanitize(panelPage, targetPage);
    expect(await isFaceModelLoaded(panelPage), 'a capture with a blind region must lazy-load the model').toBe(true);
  });
});
