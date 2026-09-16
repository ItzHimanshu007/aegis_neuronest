import { defineConfig } from '@playwright/test';

/**
 * Chromium only, per Stage 1 Part G.2 ("Firefox: automated e2e is optional" — see
 * docs/manual-test-firefox.md for the Firefox checklist instead). Requires the extension to
 * already be built (`pnpm build` inside extension/, or the top-level `pnpm e2e` which builds
 * first) and the demo portal running on :5174 (`pnpm portal`) and, for the frames test, :5175
 * (`pnpm portal:alt`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // Each test launches its own fresh persistent context with the extension loaded; a cold
  // browser start occasionally exceeds the timeout on a loaded machine, so allow one retry.
  retries: 1,
  fullyParallel: false, // one persistent browser context is shared per test file's worker
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
});
