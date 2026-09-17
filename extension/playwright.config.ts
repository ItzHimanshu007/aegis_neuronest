import { defineConfig } from '@playwright/test';

/**
 * Chromium harness. Firefox runs separately through pnpm e2e:firefox using
 * Selenium and a temporary unmodified MV3 add-on (docs/manual-test-firefox.md). Requires the extension to
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
    // Replay remains off; Stage 4 supplies explicit local Eval/Judge recording.
    trace: 'off',
  },
});
