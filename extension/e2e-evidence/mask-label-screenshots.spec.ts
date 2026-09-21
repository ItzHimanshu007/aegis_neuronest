import { test } from '../e2e/fixtures/extension';
import { openPages } from '../e2e/fixtures/observe';
import { observeAndSanitize } from '../e2e/fixtures/sanitize';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures the before/after evidence for the labelled-masks report: the sealed image and the
 * privacy receipt, with the flag off and on, from a real capture of the same page.
 *
 * Deliberate and manually triggered. It lives in e2e-evidence/ rather than e2e/ because it writes
 * into eval/reports/ and exists to produce evidence, not to assert anything — the same split
 * `e2e-eval/` already uses for Stage 4's measurements. Run it with:
 *   pnpm --filter aegis-extension evidence:screenshots
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', '..', 'eval', 'reports', 'mask-labels');

for (const arm of [
  { name: 'labelled', labels: true },
  { name: 'unlabelled', labels: false },
]) {
  test(`receipt screenshots — ${arm.name}`, async ({ context, sidepanelUrl, extensionId }) => {
    test.setTimeout(180_000);
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');

    const toggle = panelPage.getByLabel('Labelled masks');
    if (arm.labels) await toggle.check();
    else await toggle.uncheck();

    const result = await observeAndSanitize(panelPage, targetPage, 'Fill in my full name');

    // Hand the preview to the full-page receipt view, which is the same component the in-task
    // panel renders — just wide enough to photograph.
    await panelPage.evaluate((preview) => {
      (window as unknown as { __aegisPublishReceipt: (p: unknown) => void }).__aegisPublishReceipt(preview);
    }, result.preview);

    const receiptPage = await context.newPage();
    await receiptPage.setViewportSize({ width: 1400, height: 1100 });
    await receiptPage.goto(`chrome-extension://${extensionId}/receipt.html`);
    await receiptPage.waitForSelector('.receipt', { timeout: 30_000 });
    // The side-by-side image compare is the part the labels change; wait for both to decode so the
    // screenshot never catches a half-painted <img>.
    await receiptPage.waitForFunction(
      () => Array.from(document.querySelectorAll('.image-compare img')).every((img) => (img as HTMLImageElement).complete),
      { timeout: 30_000 },
    );

    await receiptPage.locator('.receipt').screenshot({ path: path.join(OUT_DIR, `receipt-${arm.name}.png`) });
    await receiptPage
      .locator('.image-compare')
      .screenshot({ path: path.join(OUT_DIR, `receipt-images-${arm.name}.png`) });

    await receiptPage.close();
    await targetPage.close();
    await panelPage.close();
  });
}
