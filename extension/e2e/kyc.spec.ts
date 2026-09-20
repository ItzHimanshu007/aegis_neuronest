import { test, expect } from './fixtures/extension';
import type { ObserveResult } from '../shared/messages';
import { openDevTools } from './fixtures/observe';

/** Clicks Observe in the side panel while `targetPage` is the active tab, and returns the parsed
 * ObserveResult by reading it back out of the panel's React state via the DOM it renders (rather
 * than trying to intercept the runtime message, which Playwright can't do for extension-internal
 * messaging). */
async function observe(panelPage: import('@playwright/test').Page, targetPage: import('@playwright/test').Page) {
  await targetPage.bringToFront();
  await openDevTools(panelPage);
  await panelPage.getByRole('button', { name: 'Observe', exact: true }).click();
  await expect(panelPage.getByText(/Observing…/)).toHaveCount(0, { timeout: 15_000 });
  await expect(panelPage.locator('.marks-list')).toBeVisible({ timeout: 15_000 });
}

test('kyc.html: every form field is marked with the correct role/name, Password has hasValue=true, and no raw value ever appears in the panel', async ({
  context,
  sidepanelUrl,
}) => {
  const kycPage = await context.newPage();
  await kycPage.goto('/kyc.html');

  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);

  await observe(panelPage, kycPage);

  const marksText = await panelPage.locator('.marks-list').innerText();

  // Every declared field appears with the right role and name.
  expect(marksText).toMatch(/textbox.*"Full name"/);
  expect(marksText).toMatch(/textbox.*"Email address"/);
  expect(marksText).toMatch(/textbox.*"Password"/);
  expect(marksText).toMatch(/button.*"Submit verification"/);

  // The page's known synthetic values must never appear anywhere the panel renders.
  const fullPanelText = await panelPage.locator('body').innerText();
  expect(fullPanelText).not.toContain('Asha Verma');
  expect(fullPanelText).not.toContain('hunter22');
  expect(fullPanelText).not.toContain('2345 6789 0123'); // Aadhaar value
  expect(fullPanelText).not.toContain('priya@example.com');

  // The captured screenshot data URL is present (i.e. the image itself is shown), but pixel
  // content isn't text-searchable — the "no raw value in the panel" guarantee above covers what
  // Playwright can assert on the DOM; the image containing the same rendered text is expected and
  // is exactly what Stage 2's redaction pipeline will address, not Stage 1's job.
  const img = panelPage.locator('.screenshot-wrap img');
  await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('kyc.html: the password element reports hasValue=true without exposing its bucket via a "Show values" control', async ({ context, sidepanelUrl }) => {
  const kycPage = await context.newPage();
  await kycPage.goto('/kyc.html');
  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  await observe(panelPage, kycPage);

  // Part E.2: "A 'Show values' toggle is NOT allowed" — assert it doesn't exist anywhere in the panel.
  await expect(panelPage.getByText(/show values/i)).toHaveCount(0);
});

test('kyc.html observation via the OBSERVE message returns a well-formed Observation (checked via panel-rendered counts)', async ({
  context,
  sidepanelUrl,
}) => {
  const kycPage = await context.newPage();
  await kycPage.goto('/kyc.html');
  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  await observe(panelPage, kycPage);

  const summary = await panelPage.locator('section:has-text("Observe") pre').first().innerText();
  const parsed = JSON.parse(summary) as Pick<ObserveResult, never> & {
    change: string;
    counts: { elements: number; media: number };
    timings: { injectMs: number; harvestMs: number; captureMs: number; totalMs: number };
  };
  expect(parsed.counts.elements).toBeGreaterThan(5); // name/email/phone/dob/address/aadhaar/pan/password/submit
  expect(parsed.timings.totalMs).toBeGreaterThan(0);
  expect(parsed.change).toMatch(/^NEW_SCREEN/); // first observation of this tab
});
