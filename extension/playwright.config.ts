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
  // probe-fixtures.spec.ts regenerates model-probe fixtures from a live browser run. It is a
  // deliberate, manually-triggered measurement (see eval/model_probe/), not a test suite. Running
  // it under `pnpm e2e` would silently overwrite committed fixtures and contaminate the held-out
  // evaluation corpus. Run it explicitly: npx playwright test e2e/probe-fixtures.spec.ts
  testIgnore: ['**/probe-fixtures.spec.ts'],
  use: {
    baseURL: 'http://localhost:5174',
    // Replay remains off; Stage 4 supplies explicit local Eval/Judge recording.
    trace: 'off',
  },
});

