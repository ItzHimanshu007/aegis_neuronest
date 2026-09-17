import { test, expect } from './fixtures/extension';
import type { ObserveResult } from '../shared/messages';

/** Clicks the real Observe button (a genuine, CDP-dispatched, trusted input event — required for
 * `permissions.request()` to succeed; see shared/permissions.ts) and reads back the full
 * ObserveResult via the test-only `window.__aegisLastObserveResult` hook App.tsx sets right after
 * rendering it — the alignment check needs the actual `screenshot.dataUrl` + `scaleX`/`scaleY`,
 * not just what's rendered as visible text. */
async function observeAndGetResult(panelPage: import('@playwright/test').Page, targetPage: import('@playwright/test').Page): Promise<ObserveResult> {
  await targetPage.bringToFront();
  await panelPage.getByRole('button', { name: 'Observe', exact: true }).click();
  await panelPage.waitForFunction(() => Boolean((window as unknown as { __aegisLastObserveResult?: unknown }).__aegisLastObserveResult), {
    timeout: 15_000,
  });
  return panelPage.evaluate(() => (window as unknown as { __aegisLastObserveResult: ObserveResult }).__aegisLastObserveResult);
}

/** Sets the browser's real page-zoom level (Ctrl/Cmd +/-, not a CDP viewport-scale emulation) via
 * the extension's own `chrome.tabs.setZoom`, run from the service worker (which already has the
 * tab in scope by the time this is called). This is the zoom the alignment test needs to exercise
 * — it changes devicePixelRatio-independent layout scale exactly the way a real user's zoom
 * shortcut would, which is what Part D.4's scaleX/scaleY mapping has to stay correct under. */
async function setPageZoom(panelPage: import('@playwright/test').Page, targetPage: import('@playwright/test').Page, factor: number) {
  await targetPage.bringToFront();
  await panelPage.evaluate(async (factor) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.setZoom(tab!.id!, factor);
  }, factor);
  // Browser zoom may preserve a document anchor rather than scrollY=0. Explicitly
  // reset both axes before the top-of-page measurement, then wait for a sample to be visible.
  await targetPage.evaluate(() => window.scrollTo(0, 0));
  await targetPage.waitForFunction(() => [...document.querySelectorAll('[data-square-id]')].some(el => {
    const r = el.getBoundingClientRect();
    return r.x+r.width/2 >= 0 && r.x+r.width/2 < innerWidth && r.y+r.height/2 >= 0 && r.y+r.height/2 < innerHeight;
  }));
}

/** Reads the RGB colour of the screenshot at a given top-level CSS *viewport* position (i.e. the
 * same coordinate space getBoundingClientRect() returns), using the observation's own
 * scaleX/scaleY (Stage 1 Part D.4) — this IS the alignment gate: if the scale mapping or the
 * coordinate composition is wrong, the sampled pixel won't match the square's declared colour. */
async function samplePixelAtCssPoint(page: import('@playwright/test').Page, dataUrl: string, scaleX: number, scaleY: number, cssX: number, cssY: number) {
  return page.evaluate(
    async ({ dataUrl, scaleX, scaleY, cssX, cssY }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = Math.round(cssX * scaleX);
      const py = Math.round(cssY * scaleY);
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 };
    },
    { dataUrl, scaleX, scaleY, cssX, cssY },
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function closeEnough(a: number, b: number, tolerance = 30): boolean {
  return Math.abs(a - b) <= tolerance;
}

interface LiveSquare {
  id: string;
  color: string;
  cx: number; // viewport-relative centre, at the moment of capture
  cy: number;
  visible: boolean;
}

async function readLiveSquares(calPage: import('@playwright/test').Page): Promise<LiveSquare[]> {
  return calPage.evaluate(() => {
    const squares = Array.from(document.querySelectorAll<HTMLElement>('[data-square-id]'));
    return squares.map((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      return {
        id: el.dataset.squareId!,
        color: el.dataset.expectedColor!,
        cx,
        cy,
        visible: cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth,
      };
    });
  });
}

async function assertAllVisibleSquaresAlign(calPage: import('@playwright/test').Page, panelPage: import('@playwright/test').Page) {
  const liveSquares = await readLiveSquares(calPage);
  const visibleSquares = liveSquares.filter((s) => s.visible);
  expect(visibleSquares.length, 'at least one square must be on screen for this scenario to test anything').toBeGreaterThan(0);

  const result = await observeAndGetResult(panelPage, calPage);
  const { dataUrl, scaleX, scaleY } = result.observation.screenshot;

  for (const square of visibleSquares) {
    const sampled = await samplePixelAtCssPoint(panelPage, dataUrl, scaleX, scaleY, square.cx, square.cy);
    const expected = hexToRgb(square.color);
    expect(closeEnough(sampled.r, expected.r), `${square.id} red (got ${JSON.stringify(sampled)}, want ${JSON.stringify(expected)})`).toBe(true);
    expect(closeEnough(sampled.g, expected.g), `${square.id} green`).toBe(true);
    expect(closeEnough(sampled.b, expected.b), `${square.id} blue`).toBe(true);
  }
}

test.describe('calibration.html: screenshot/coordinate alignment', () => {
  test('top of page: sampled pixel colour matches each visible square (zoom 100%)', async ({ context, sidepanelUrl }) => {
    const calPage = await context.newPage();
    await calPage.goto('/calibration.html');
    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await assertAllVisibleSquaresAlign(calPage, panelPage);
  });

  test('scrolled down: sampled pixel colour matches the centre square (zoom 100%)', async ({ context, sidepanelUrl }) => {
    const calPage = await context.newPage();
    await calPage.goto('/calibration.html');
    // Scroll so #sq-center (declared at page y=1480) is centred in whatever the real viewport
    // height turns out to be, rather than guessing a fixed scroll offset.
    await calPage.evaluate(() => {
      const rect = document.getElementById('sq-center')!.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, rect.y + window.scrollY - window.innerHeight / 2));
    });
    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await assertAllVisibleSquaresAlign(calPage, panelPage);
  });

  // Part H acceptance criteria: "Alignment test passes at the three zoom levels and when
  // scrolled." 125% and 67% are Chrome's own preset zoom levels.
  for (const zoomPercent of [125, 67]) {
    test(`top of page: sampled pixel colour matches each visible square (zoom ${zoomPercent}%)`, async ({ context, sidepanelUrl }) => {
      const calPage = await context.newPage();
      await calPage.goto('/calibration.html');
      const panelPage = await context.newPage();
      await panelPage.goto(sidepanelUrl);
      await setPageZoom(panelPage, calPage, zoomPercent / 100);
      await assertAllVisibleSquaresAlign(calPage, panelPage);
    });
  }
});
