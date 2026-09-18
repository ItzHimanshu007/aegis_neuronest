import { test, expect } from './fixtures/extension';
import { observeAndSanitize } from './fixtures/sanitize';

/**
 * Stage 3B Part II carry-over: `docs/architecture.md` says lossless WebP is 0.28-0.32x of PNG's
 * bytes on measured Stage 3A captures, and that the saving "does not actually require giving up
 * bit-exact pixels" — but that claim was never actually checked pixel-by-pixel against a real
 * capture, in either browser. This does exactly that: draw the source into a canvas, re-encode
 * with `convertToBlob({ type: 'image/webp', quality: 1 })`, decode the result back into a canvas,
 * and diff every channel of every pixel.
 *
 * Measured on BOTH the raw captured screenshot (isolates the encoder's own fidelity from the
 * redaction pipeline) AND the actual REDACTED image `seal()` would ship (large solid-fill mask
 * regions compress very differently than a photographic screenshot, which is almost certainly
 * where the architecture doc's 0.28-0.32x figure came from — the raw-screenshot ratio measured
 * here is a different, and much less favourable, number; both are reported so neither is
 * mistaken for the other). `verifyMasks()` samples the exact bytes that ship, so an encoder that
 * silently alters even one channel on one pixel would make that verification meaningless — this
 * is the prerequisite check the switch-decision in `docs/STAGE-3B-CHECKPOINT-REPORT.md`'s
 * follow-up depends on. See scripts/firefox/e2e.py for the Firefox half; PNG is kept unless BOTH
 * browsers are pixel-identical on BOTH the raw and the redacted image.
 *
 * Measurement, not a regression gate (same convention as timings.spec.ts): the pipeline still
 * ships PNG regardless of what this measures, so a non-identical result is an expected, already
 * acted-on finding (see docs/architecture.md and eval/reports/stage3-tasks.md — Firefox's own
 * WebP encoder was NOT bit-exact at quality:1, which settled the decision), not something to fix.
 */
test('WebP quality:1 round-trips every pixel exactly, raw and redacted (Chromium)', async ({
  context,
  sidepanelUrl,
}) => {
  const rows: string[] = [];
  for (const pageName of ['kyc.html', 'pii-zoo.html']) {
    const targetPage = await context.newPage();
    await targetPage.goto(`/${pageName}`);
    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    const processed = await observeAndSanitize(panelPage, targetPage);
    expect(processed.preview.redactedImageDataUrl, `${pageName} must produce a redacted image`).toBeTruthy();

    for (const [label, dataUrl] of [
      ['raw', processed.preview.rawImageDataUrl],
      ['redacted', processed.preview.redactedImageDataUrl!],
    ] as const) {
      const result = await panelPage.evaluate(async (url: string) => {
        const decodeToImageData = async (u: string): Promise<{ w: number; h: number; data: Uint8ClampedArray }> => {
          const img = new Image();
          img.src = u;
          await img.decode();
          const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return { w: canvas.width, h: canvas.height, data: imageData.data };
        };

        const source = await decodeToImageData(url);
        const sourceCanvas = new OffscreenCanvas(source.w, source.h);
        const sourceCtx = sourceCanvas.getContext('2d')!;
        // Re-wrap into a fresh ArrayBuffer-backed array: getImageData()'s `.data` is typed against
        // ArrayBufferLike (SharedArrayBuffer-compatible), which the ImageData constructor's own
        // stricter ArrayBuffer-only overload rejects.
        sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.w, source.h), 0, 0);

        const pngBlob = await sourceCanvas.convertToBlob({ type: 'image/png' });
        const webpBlob = await sourceCanvas.convertToBlob({ type: 'image/webp', quality: 1 });
        const webpUrl = URL.createObjectURL(webpBlob);
        const decoded = await decodeToImageData(webpUrl);
        URL.revokeObjectURL(webpUrl);

        let mismatches = 0;
        let maxDelta = 0;
        if (decoded.w === source.w && decoded.h === source.h) {
          for (let i = 0; i < source.data.length; i++) {
            const delta = Math.abs(source.data[i]! - decoded.data[i]!);
            if (delta !== 0) {
              mismatches++;
              maxDelta = Math.max(maxDelta, delta);
            }
          }
        }
        return {
          width: source.w,
          height: source.h,
          decodedWidth: decoded.w,
          decodedHeight: decoded.h,
          totalChannels: source.data.length,
          mismatches,
          maxDelta,
          pngBytes: pngBlob.size,
          webpBytes: webpBlob.size,
        };
      }, dataUrl);

      // A decode-shape mismatch would mean the encode/decode round trip itself is broken, not a
      // measurement finding — that genuinely is a bug, so it stays a hard assertion.
      expect(result.decodedWidth, `${pageName}/${label} decoded width`).toBe(result.width);
      expect(result.decodedHeight, `${pageName}/${label} decoded height`).toBe(result.height);
      const identical = result.mismatches === 0;
      const ratio = (result.webpBytes / result.pngBytes).toFixed(3);
      rows.push(
        `| ${pageName} | ${label} | ${result.width}x${result.height} | ${result.pngBytes} | ${result.webpBytes} | ${ratio} | ${identical} | ${result.mismatches}/${result.totalChannels} | ${result.maxDelta} |`,
      );
      console.log(
        `[WEBP-IDENTITY][chromium] ${pageName}/${label}: identical=${identical} mismatches=${result.mismatches}/${result.totalChannels} maxDelta=${result.maxDelta} png=${result.pngBytes} webp=${result.webpBytes} ratio=${ratio}`,
      );
    }

    await targetPage.close();
    await panelPage.close();
  }
  console.log('[WEBP-IDENTITY][chromium][table]\n' + rows.join('\n'));
});
