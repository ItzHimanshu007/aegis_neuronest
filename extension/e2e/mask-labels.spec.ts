import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';

/**
 * Labelled masks, Part B: `verifyMasks()` against a deterministic re-render.
 *
 * These are the regression cases the strictness claim rests on, and they need a real canvas, so
 * they live here rather than in Vitest (the same split the repo already uses for `redactor.ts`
 * and `faceModel.ts`). Each one builds a SYNTHETIC source image in the side-panel document and
 * drives `redact()` / `verifyMasks()` through the test-only `window.__aegisRedactProbe` hook, so
 * nothing here depends on a captured page or on what a demo portal happens to render.
 *
 * The four cases Part B asks for:
 *   1. a correct label passes
 *   2. original pixels leaking through fails
 *   3. a label outside the closed vocabulary fails
 *   4. a label rendered outside its box fails
 *
 * Plus the two constraints that are only checkable in pixels: a label never escapes its box
 * (constraint 3) and it stays high-contrast after the downscale (constraint 4).
 */

const TOKEN = '[[PII:EMAIL:k3f7qa2b]]';

interface ProbeCase {
  /** How to corrupt the redaction before verifying. 'none' verifies what redact() produced. */
  tamper: 'none' | 'leak-full' | 'leak-shipped' | 'wrong-label' | 'label-overflow' | 'paint-over';
  labels: boolean;
  /** Mask box width in CSS px — narrow boxes exercise the step-down to category-only and to none. */
  boxWidth?: number;
}

interface ProbeResult {
  ok: boolean;
  reasons: string[];
  label?: string;
  /** Non-fill pixels found in a 6px ring just OUTSIDE the mask box, at full resolution. */
  outsideInk: number;
  /** Darkest and brightest luminance inside the label band of the SHIPPED (downscaled) image. */
  shippedMin: number;
  shippedMax: number;
}

/**
 * Runs one redact+verify cycle in the panel document.
 *
 * The source image is deliberately loud — saturated magenta text-like bars on white — so "the
 * original pixels are still there" is unmistakable in a luminance check and so a leak cannot hide
 * inside a dark page.
 */
async function runProbe(panelPage: import('@playwright/test').Page, probeCase: ProbeCase): Promise<ProbeResult> {
  return panelPage.evaluate(async (input: ProbeCase & { token: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const probe = (window as unknown as { __aegisRedactProbe?: { redact: Function; verifyMasks: Function } }).__aegisRedactProbe;
    if (!probe) throw new Error('__aegisRedactProbe missing — App.tsx should expose it');

    const W = 800;
    const H = 400;
    const BOX = { x: 100, y: 150, width: input.boxWidth ?? 260, height: 40 };

    // --- a loud synthetic "page" -----------------------------------------------------------
    const source = new OffscreenCanvas(W, H);
    const sctx = source.getContext('2d')!;
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, W, H);
    sctx.fillStyle = '#ff00aa';
    for (let y = BOX.y + 4; y < BOX.y + BOX.height - 4; y += 6) sctx.fillRect(BOX.x + 4, y, BOX.width - 8, 3);
    const toDataUrl = async (canvas: OffscreenCanvas) => {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of buffer) binary += String.fromCharCode(byte);
      return `data:image/png;base64,${btoa(binary)}`;
    };

    const result = await probe.redact({
      dataUrl: await toDataUrl(source),
      capture_id: 'probe-capture',
      scaleX: 1,
      scaleY: 1,
      mode: 'balanced',
      maskLabelsEnabled: input.labels,
      somEnabled: false,
      masks: [{ rid: 'r0', kind: 'LABELLED_FILL', type: 'EMAIL', rect: BOX, token: input.token }],
    });

    const mask = result.image.masks[0];
    const rect = mask.pxRect;
    const fullCtx = result.fullResolution.canvas.getContext('2d')!;

    // --- tampering -------------------------------------------------------------------------
    // Each of these is a thing that MUST fail closed. They are applied after redact() and before
    // verifyMasks(), which is exactly where a bug (or an attacker who reached this far) would sit.
    if (input.tamper === 'leak-full' || input.tamper === 'leak-shipped') {
      const leak = (ctx: OffscreenCanvasRenderingContext2D, scale: number) => {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          source,
          rect.x, rect.y, rect.width, rect.height,
          rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale,
        );
        ctx.restore();
      };
      if (input.tamper === 'leak-full') {
        leak(fullCtx, 1);
        // Re-export so the shipped image matches the tampered canvas; otherwise this would be
        // caught only because the two disagree, which is a weaker thing to prove.
        const exported = new OffscreenCanvas(result.image.pxW, result.image.pxH);
        const ectx = exported.getContext('2d')!;
        ectx.imageSmoothingEnabled = true;
        ectx.drawImage(result.fullResolution.canvas, 0, 0, W, H, 0, 0, result.image.pxW, result.image.pxH);
        result.image.dataUrl = await toDataUrl(exported);
      } else {
        // Only the SHIPPED bytes leak; the full-resolution canvas stays clean.
        const exported = new OffscreenCanvas(result.image.pxW, result.image.pxH);
        const ectx = exported.getContext('2d')!;
        ectx.imageSmoothingEnabled = true;
        ectx.drawImage(result.fullResolution.canvas, 0, 0, W, H, 0, 0, result.image.pxW, result.image.pxH);
        leak(ectx, result.image.pxW / W);
        result.image.dataUrl = await toDataUrl(exported);
      }
    }

    if (input.tamper === 'wrong-label' || input.tamper === 'label-overflow' || input.tamper === 'paint-over') {
      fullCtx.save();
      fullCtx.fillStyle = '#ffffff';
      fullCtx.textBaseline = 'middle';
      fullCtx.font = '18px monospace';
      if (input.tamper === 'wrong-label') {
        // Anything at all outside the closed vocabulary — here, the value the mask exists to hide.
        fullCtx.fillStyle = '#000000';
        fullCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
        fullCtx.fillStyle = '#ffffff';
        fullCtx.textAlign = 'center';
        fullCtx.fillText('ravi@example.com', rect.x + rect.width / 2, rect.y + rect.height / 2);
      } else if (input.tamper === 'label-overflow') {
        // The right label, drawn so it runs past the box edge into the page.
        fullCtx.textAlign = 'left';
        fullCtx.fillText('[EMAIL#k3f7qa2b]', rect.x + rect.width - 30, rect.y + rect.height / 2);
      } else {
        // Something painted on top of a correct mask after the fact — the case ring sampling in
        // the label band could never see.
        fullCtx.fillStyle = '#1b6ef3';
        fullCtx.fillRect(rect.x + rect.width / 2 - 8, rect.y + rect.height / 2 - 4, 16, 8);
      }
      fullCtx.restore();
      const exported = new OffscreenCanvas(result.image.pxW, result.image.pxH);
      const ectx = exported.getContext('2d')!;
      ectx.imageSmoothingEnabled = true;
      ectx.drawImage(result.fullResolution.canvas, 0, 0, W, H, 0, 0, result.image.pxW, result.image.pxH);
      result.image.dataUrl = await toDataUrl(exported);
    }

    const verdict = await probe.verifyMasks(result);

    // --- measurements ----------------------------------------------------------------------
    // Ink just OUTSIDE the box: proves a label never escapes its mask (constraint 3).
    let outsideInk = 0;
    const ringPad = 6;
    const rx = Math.max(0, rect.x - ringPad);
    const ry = Math.max(0, rect.y - ringPad);
    const rw = Math.min(W, rect.x + rect.width + ringPad) - rx;
    const rh = Math.min(H, rect.y + rect.height + ringPad) - ry;
    const ring = fullCtx.getImageData(rx, ry, rw, rh).data;
    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const ax = rx + px;
        const ay = ry + py;
        const inside = ax >= rect.x && ax < rect.x + rect.width && ay >= rect.y && ay < rect.y + rect.height;
        if (inside) continue;
        const i = (py * rw + px) * 4;
        // The synthetic page is white or magenta. Anything dark outside the box is mask ink.
        const lum = 0.299 * ring[i]! + 0.587 * ring[i + 1]! + 0.114 * ring[i + 2]!;
        if (lum < 100) outsideInk++;
      }
    }

    // Contrast inside the label band of the SHIPPED, downscaled image (constraint 4).
    const shipped = await createImageBitmap(await (await fetch(result.image.dataUrl)).blob());
    const shippedCanvas = new OffscreenCanvas(shipped.width, shipped.height);
    const shippedCtx = shippedCanvas.getContext('2d')!;
    shippedCtx.drawImage(shipped, 0, 0);
    const scale = shipped.width / W;
    const bx = Math.round(rect.x * scale);
    const by = Math.round((rect.y + rect.height * 0.3) * scale);
    const bw = Math.max(1, Math.round(rect.width * scale));
    const bh = Math.max(1, Math.round(rect.height * 0.4 * scale));
    const band = shippedCtx.getImageData(bx, by, bw, bh).data;
    let shippedMin = 255;
    let shippedMax = 0;
    for (let i = 0; i < band.length; i += 4) {
      const lum = 0.299 * band[i]! + 0.587 * band[i + 1]! + 0.114 * band[i + 2]!;
      shippedMin = Math.min(shippedMin, lum);
      shippedMax = Math.max(shippedMax, lum);
    }

    return {
      ok: verdict.ok,
      reasons: verdict.failures.map((f: { reason: string }) => f.reason),
      label: mask.label,
      outsideInk,
      shippedMin,
      shippedMax,
    };
  }, { ...probeCase, token: TOKEN });
}

test.describe('labelled masks — verifyMasks() against a deterministic re-render', () => {
  test('a correct label passes, and says what the payload says', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'none', labels: true });

    expect(result.label, 'the drawn label should carry the payload token ID').toBe('[EMAIL#k3f7qa2b]');
    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('an unlabelled mask still passes, so the flag-off arm is verified too', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'none', labels: false });

    expect(result.label, 'no label should be drawn with the flag off').toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test('original pixels leaking through the mask fails closed', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'leak-full', labels: true });

    expect(result.ok, 'a mask with the original pixels back in it must not verify').toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('a leak in the shipped bytes only — full resolution clean — still fails closed', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'leak-shipped', labels: true });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('shipped-image');
  });

  test('a label outside the closed vocabulary fails closed', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'wrong-label', labels: true });

    // The mask itself is a perfectly good solid black box with white text in it — the OLD ring
    // check passes this. It fails now because the text is not the text the re-render produces.
    expect(result.ok, 'a mask labelled with anything but its own vocabulary entry must not verify').toBe(false);
    expect(result.reasons.join(' ')).toContain('differs-from-expected-render');
  });

  test('a label rendered past the edge of its box fails closed', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'label-overflow', labels: true });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('differs-from-expected-render');
  });

  test('anything painted over a correct mask fails closed', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await runProbe(panelPage, { tamper: 'paint-over', labels: true });

    expect(result.ok, 'the ring check skips the label band; the re-render does not').toBe(false);
  });
});

test.describe('labelled masks — the label stays inside its box and stays readable', () => {
  test('never draws ink outside the mask, at any box width', async ({ context, sidepanelUrl }) => {
    test.setTimeout(180_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');

    // 300px fits the full label; 90px forces the step down to [EMAIL]; 24px fits neither and must
    // produce no label at all rather than a truncation (constraint 3).
    for (const boxWidth of [300, 90, 24]) {
      const result = await runProbe(panelPage, { tamper: 'none', labels: true, boxWidth });
      expect(result.ok, `width ${boxWidth} should verify`).toBe(true);
      expect(result.outsideInk, `width ${boxWidth} drew ink outside the mask`).toBe(0);
      if (result.label !== undefined) {
        expect(result.label, `width ${boxWidth} produced a non-vocabulary label`).toMatch(
          /^(\[[A-Z][A-Z_]*(#[a-z2-7]{8})?\]|\[IMAGE — not checked\]|\[FACE\])$/,
        );
      }
    }
  });

  test('keeps high contrast in the sealed, downscaled PNG', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const { panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const labelled = await runProbe(panelPage, { tamper: 'none', labels: true });
    const plain = await runProbe(panelPage, { tamper: 'none', labels: false });

    // With no label the band is uniformly the fill colour; with one it spans near-black to near-
    // white even after the downscale and the PNG round trip (constraint 4).
    expect(plain.shippedMax, 'an unlabelled mask band should be flat fill').toBeLessThan(40);
    expect(labelled.shippedMin).toBeLessThan(40);
    expect(labelled.shippedMax, 'label glyphs should survive the downscale bright').toBeGreaterThan(150);
  });
});
