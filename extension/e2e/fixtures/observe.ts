import type { Page } from '@playwright/test';
import type { ObserveResult } from '../../shared/messages';

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
  await panelPage.evaluate(() => {
    delete (window as unknown as { __aegisLastObserveResult?: unknown }).__aegisLastObserveResult;
  });
  await panelPage.getByRole('button', { name: 'Observe' }).click();
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
  return { targetPage, panelPage };
}
