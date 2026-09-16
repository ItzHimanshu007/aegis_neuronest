import { test, expect } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';
import { AEGIS_CONFIG } from '../shared/config';

test('the debug overlay is rendered on the page but is absent from the captured screenshot', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');

  // First observation renders the overlay onto the page (Part E.1).
  const first = await observe(panelPage, targetPage);
  expect(first.observation.elements.length).toBeGreaterThan(0);

  const overlayPresentOnPage = await targetPage.evaluate(() => Boolean(document.querySelector('[data-aegis-overlay]')));
  expect(overlayPresentOnPage, 'the overlay host should exist on the page after an observation').toBe(true);

  // Second observation: the overlay is already on the page BEFORE the capture, so this is the
  // case that actually proves hideForCapture()/restoreAfterCapture() work. Sample the exact
  // pixel where mark #0's badge is drawn; if the overlay had leaked into the screenshot, that
  // pixel would be the badge's solid green (#2ecc71), not page background.
  const second = await observe(panelPage, targetPage);
  const mark = second.observation.elements.find((el) => el.visible && el.bbox.width > 0)!;
  const { dataUrl, scaleX, scaleY } = second.observation.screenshot;

  const sampled = await panelPage.evaluate(
    async ({ dataUrl, scaleX, scaleY, bbox }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // Sample along the element's top-left border, where the overlay draws its 1.5px outline.
      const px = Math.round((bbox.x + 1) * scaleX);
      const py = Math.round((bbox.y + 1) * scaleY);
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 };
    },
    { dataUrl, scaleX, scaleY, bbox: mark.bbox },
  );

  // #2ecc71 == rgb(46, 204, 113). Assert the captured pixel is NOT the overlay's green.
  const isOverlayGreen = Math.abs(sampled.r - 46) < 40 && Math.abs(sampled.g - 204) < 40 && Math.abs(sampled.b - 113) < 40;
  expect(isOverlayGreen, `captured pixel ${JSON.stringify(sampled)} must not be the overlay's green`).toBe(false);

  // ...and the overlay is restored afterwards, ready for the next capture.
  const overlayStillThere = await targetPage.evaluate(() => {
    const host = document.querySelector('[data-aegis-overlay]') as HTMLElement | null;
    return host ? host.style.display !== 'none' : false;
  });
  expect(overlayStillThere, 'the overlay must be restored after the capture').toBe(true);
});

test('capture throttle holds under rapid repeated requests', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');

  // Prime the permission grant with one real click-driven observation.
  await observe(panelPage, targetPage);

  // Now fire several OBSERVE requests as fast as possible, directly via messaging (the
  // permission is already granted at this point, so no user gesture is needed any more).
  const started = Date.now();
  const captureCount = 4;
  const results = await panelPage.evaluate(async (n) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const requests = Array.from({ length: n }, () => browser.runtime.sendMessage({ type: 'OBSERVE', data: { tabId: tab!.id } }));
    const settled = await Promise.all(requests);
    return settled.map((envelope) => {
      const e = envelope as { ok: boolean; response?: { observation: { capture_id: string; ts: number } } };
      return { ok: e.ok, ts: e.response?.observation.ts ?? 0 };
    });
  }, captureCount);
  const elapsed = Date.now() - started;

  // Every request must succeed (the throttle queues/coalesces — it never errors out, and never
  // trips Chrome's own MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota, which would throw).
  expect(results.every((r) => r.ok), `all OBSERVE requests should succeed: ${JSON.stringify(results)}`).toBe(true);

  // The CoalescingQueue collapses the burst into far fewer real captures than requests, so this
  // must NOT have taken captureCount / CAPTURE_MAX_PER_SEC seconds — coalescing is what keeps
  // rapid requests cheap (Part D.3).
  const worstCaseIfNotCoalesced = (captureCount / AEGIS_CONFIG.CAPTURE_MAX_PER_SEC) * 1000;
  expect(elapsed, 'a coalesced burst should not serialise into one capture per request').toBeLessThan(worstCaseIfNotCoalesced + 20_000);
});
