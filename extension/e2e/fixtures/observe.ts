import type { Page } from '@playwright/test';
import type { ObserveResult } from '../../shared/messages';

/** The Stage-2 pipeline controls live inside a collapsed `<details class="dev-tools">`, so the panel
 * opens on one task input. Playwright reports their children as not visible while it is closed and
 * `click()` times out, so every fixture that drives those controls opens it first. */
export async function openDevTools(panelPage: Page): Promise<void> {
  await panelPage.locator('details.dev-tools').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

/**
 * Clicks the real Observe button in the side panel while `targetPage` is the active tab, then
 * reads the full ObserveResult back via the test-only `window.__aegisLastObserveResult` hook
 * App.tsx sets (see its comment there).
 *
 * The click has to be a real, Playwright-dispatched input event rather than a direct
 * `runtime.sendMessage`, because `permissions.request()` inside the handler only succeeds under a
 * genuine user gesture — see shared/permissions.ts.
 */
export async function observe(panelPage: Page, targetPage: Page): Promise<ObserveResult> {
  await targetPage.bringToFront();
  await openDevTools(panelPage);
  await panelPage.evaluate(() => {
    delete (window as unknown as { __aegisLastObserveResult?: unknown }).__aegisLastObserveResult;
  });
  await panelPage.getByRole('button', { name: 'Observe', exact: true }).click();
  await panelPage.waitForFunction(() => Boolean((window as unknown as { __aegisLastObserveResult?: unknown }).__aegisLastObserveResult), {
    timeout: 20_000,
  });
  return panelPage.evaluate(() => (window as unknown as { __aegisLastObserveResult: ObserveResult }).__aegisLastObserveResult);
}

/** Opens the demo page and the side panel page, returning both. */
export async function openPages(context: import('@playwright/test').BrowserContext, sidepanelUrl: string, pagePath: string) {
  const targetPage = await context.newPage();
  await targetPage.goto(pagePath);
  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  // Covers specs that touch a dev-tools control (the marks checkbox, the Mode select) before
  // reaching observe()/observeAndSanitize(), which open it themselves.
  await openDevTools(panelPage);
  return { targetPage, panelPage };
}
