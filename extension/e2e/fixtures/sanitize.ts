import type { Page } from '@playwright/test';
import type { ProcessResult } from '../../agentHost';

/**
 * Drives the Privacy Preview's "Observe & Sanitize" button and reads back the full ProcessResult
 * via the test-only `window.__aegisLastProcessResult` hook the panel sets.
 *
 * The click must be a real, Playwright-dispatched input event: `permissions.request()` inside the
 * handler only succeeds under genuine user activation (see extension/shared/permissions.ts).
 */
export async function observeAndSanitize(panelPage: Page, targetPage: Page, task = ''): Promise<ProcessResult> {
  await targetPage.bringToFront();
  await panelPage.evaluate(() => {
    delete (window as unknown as { __aegisLastProcessResult?: unknown }).__aegisLastProcessResult;
  });

  if (task) {
    await panelPage.getByPlaceholder(/Fill in the KYC form/).fill(task);
  }

  await panelPage.getByRole('button', { name: 'Observe & Sanitize' }).click();

  await panelPage.waitForFunction(
    () => {
      const w = window as unknown as { __aegisLastProcessResult?: unknown };
      const errorEl = document.querySelector('pre.error');
      return Boolean(w.__aegisLastProcessResult) || Boolean(errorEl?.textContent);
    },
    { timeout: 30_000 },
  );

  const result = await panelPage.evaluate(() => (window as unknown as { __aegisLastProcessResult?: ProcessResult }).__aegisLastProcessResult);
  if (result) return result;

  // Only look for the error element once we know there's no result — `locator.textContent()`
  // auto-waits for the element to appear, so calling it on the happy path burns the whole default
  // timeout (30s) waiting for an error that will never come.
  const errorCount = await panelPage.locator('pre.error').count();
  const error = errorCount > 0 ? await panelPage.locator('pre.error').first().textContent() : null;
  throw new Error(`Observe & Sanitize failed: ${error ?? 'no result and no error shown'}`);
}

/** Reads the sealed payload's exact bytes back as a string (what `send()` would transmit). */
export function sealedText(result: ProcessResult): string {
  return result.preview.draftJson;
}

/** Collects every `data-gt` ground-truth annotation from the page: category -> the values the
 * page says belong to it. Only tests read these — detectors are forbidden from doing so, which is
 * enforced by privacy/detect/__tests__/dataGtGuard.test.ts. */
export async function readGroundTruth(page: Page): Promise<Array<{ category: string; value: string }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-gt]')).map((el) => {
      const category = (el as HTMLElement).dataset.gt!;
      const value = el instanceof HTMLInputElement ? el.value : (el.textContent ?? '').trim();
      return { category, value };
    }),
  );
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}
