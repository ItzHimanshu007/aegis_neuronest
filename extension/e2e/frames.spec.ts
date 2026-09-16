import { test, expect } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';

test('frames.html: the same-origin frame is mapped into top-level coordinates', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/frames.html');
  const result = await observe(panelPage, targetPage);

  // The same-origin frame's field is harvested and reported under a non-top frameId.
  const framedField = result.observation.elements.find((el) => el.name === 'Framed name');
  expect(framedField, 'the same-origin iframe field should be harvested').toBeDefined();
  expect(framedField!.frameId).not.toBe(0);

  const frameInfo = result.observation.frames.find((f) => f.frameId === framedField!.frameId);
  expect(frameInfo?.mapping).toBe('same-origin');

  // Its bbox must be composed into TOP-LEVEL coordinates: the iframe sits well down the page,
  // so the field's y must be at least the iframe element's own offset, not a frame-local ~10px.
  const iframeRect = await targetPage.evaluate(() => {
    const rect = document.getElementById('same-origin-frame')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(framedField!.bbox.y).toBeGreaterThanOrEqual(iframeRect.y);
  expect(framedField!.bbox.y).toBeLessThanOrEqual(iframeRect.y + iframeRect.height);
  expect(framedField!.bbox.x).toBeGreaterThanOrEqual(iframeRect.x);
});

test('frames.html: the cross-origin frame is either mapped or recorded as iframe-unmapped', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/frames.html');
  const result = await observe(panelPage, targetPage);

  const crossOriginRect = await targetPage.evaluate(() => {
    const rect = document.getElementById('cross-origin-frame')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  // Stage 1 Part C.6 explicitly allows either outcome for a cross-origin frame: resolved via the
  // FRAME_HELLO src+size match, or left as an `iframe-unmapped` RawMedia region for Stage 6
  // vision to cover. Both are correct; silently dropping it is not.
  const unmapped = result.observation.media.find(
    (m) => m.kind === 'iframe-unmapped' && Math.abs(m.bbox.x - crossOriginRect.x) < 2 && Math.abs(m.bbox.y - crossOriginRect.y) < 2,
  );
  const mappedFrame = result.observation.frames.find((f) => f.mapping === 'src-size-match');

  expect(Boolean(unmapped) || Boolean(mappedFrame), 'cross-origin iframe must be either mapped or reported as iframe-unmapped').toBe(true);
});
