import { defineConfig } from '@playwright/test';

/**
 * Stage 4 evaluation runs. Separate from `playwright.config.ts` because these are MEASUREMENTS,
 * not tests: they are slow, they are not part of `pnpm e2e`, and they must never retry — a retried
 * run would silently resample the very number being measured.
 *
 * Preconditions: `pnpm portal` (:5174), the server on :8000, and a generated held-out corpus.
 */
export default defineConfig({
  testDir: './e2e-eval',
  timeout: 7_200_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    // Playwright's default action timeout is 0 — meaning NO timeout, bounded only by the test
    // timeout. That is wrong for a measurement loop: a locator that never appears (a task summary
    // for a task that never started) makes an auto-waiting call like `innerText()` hang forever,
    // and a hang is not an exception, so a try/catch around it cannot recover. One stuck task then
    // consumes the entire run budget and the whole measurement is lost. Bounding actions turns
    // that into a per-task error the spec records and moves past.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
