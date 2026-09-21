import { defineConfig } from '@playwright/test';

/**
 * Evidence runs for the labelled-masks work. Separate from `playwright.config.ts` for the same
 * reason `playwright.eval.config.ts` is: these specs PRODUCE artifacts — the probe's two fixture
 * arms and the report's screenshots — rather than assert anything about the build. Running them
 * under `pnpm e2e` would overwrite committed evidence on every test run.
 *
 * Retries are off. A retried run would silently regenerate a fixture arm halfway through, leaving
 * the two arms built from different captures and the comparison meaningless.
 *
 * Preconditions: a current `wxt build --browser chrome`, and `pnpm portal` on :5174.
 */
export default defineConfig({
  testDir: './e2e-evidence',
  timeout: 900_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
});
