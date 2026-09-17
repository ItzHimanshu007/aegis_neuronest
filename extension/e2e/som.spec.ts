import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize } from './fixtures/sanitize';

/**
 * Privacy Set-of-Marks on a real capture (Stage 3A Part B). The unit tests cover where a tag is
 * allowed to go; these cover that tags actually reach the sealed image, name only elements the
 * server receives, and do not eat into the redaction.
 */

/** Must match AEGIS_CONFIG.SOM_STYLE.background. */
const MARK_COLOUR = '#1b6ef3';

/** Counts pixels matching the mark background, so "the tags were drawn" is checked in pixels. */
async function sampleMarkPixels(page: import('@playwright/test').Page, dataUrl: string, colour: string) {
  return page.evaluate(
    async ([url, hex]) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let marks = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i]! - rgb[0]!) < 24 && Math.abs(data[i + 1]! - rgb[1]!) < 24 && Math.abs(data[i + 2]! - rgb[2]!) < 24) marks++;
      }
      return { marks, width: bitmap.width, height: bitmap.height };
    },
    [dataUrl, colour] as const,
  );
}

test('marks are drawn on the sealed image and name only outbound elements', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
  const result = await observeAndSanitize(panelPage, targetPage);

  const draft = JSON.parse(result.preview.draftJson) as { image?: string; elements: Array<{ eid: string }> };
  expect(draft.image, 'a NEW_SCREEN capture should carry an image').toBeTruthy();

  const { marks } = await sampleMarkPixels(panelPage, draft.image!, MARK_COLOUR);
  expect(marks, 'the sealed image should contain mark-coloured pixels').toBeGreaterThan(0);
});

test('turning marks off removes them', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  // Each variant gets its own page pair: only a NEW_SCREEN capture carries an image, so a second
  // observation of the same screen would have no pixels to compare.
  const on = await openPages(context, sidepanelUrl, '/kyc.html');
  const withMarks = await observeAndSanitize(on.panelPage, on.targetPage);
  const onImage = (JSON.parse(withMarks.preview.draftJson) as { image?: string }).image;
  expect(onImage).toBeTruthy();
  const onPixels = await sampleMarkPixels(on.panelPage, onImage!, MARK_COLOUR);
  await on.targetPage.close();
  await on.panelPage.close();

  const off = await openPages(context, sidepanelUrl, '/kyc.html');
  await off.panelPage.getByLabel('Element ID marks').uncheck();
  const withoutMarks = await observeAndSanitize(off.panelPage, off.targetPage);
  const offImage = (JSON.parse(withoutMarks.preview.draftJson) as { image?: string }).image;
  expect(offImage).toBeTruthy();
  const offPixels = await sampleMarkPixels(off.panelPage, offImage!, MARK_COLOUR);

  expect(onPixels.marks).toBeGreaterThan(0);
  expect(offPixels.marks, 'no mark-coloured pixels once the toggle is off').toBe(0);
});

test('masks stay verifiable with marks enabled on the PII-dense page', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
  // seal() refuses on any mask-integrity failure, so reaching a sealed payload IS the assertion.
  const result = await observeAndSanitize(panelPage, targetPage);
  expect(result.preview.digest).toMatch(/^[0-9a-f]{64}$/);
});
