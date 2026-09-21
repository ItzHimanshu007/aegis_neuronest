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
  // Specs that WRITE evidence rather than only assert are excluded here and run deliberately
  // instead. A regression suite must be safe to run at any time; these rewrite files that are
  // submitted as measurements, and one of them destroyed a committed Stage 4 status block by being
  // run as part of an ordinary `pnpm e2e`.
  //
  //   probe-fixtures.spec.ts  regenerates the model-probe fixtures (eval/model_probe/), which would
  //                           contaminate the held-out evaluation corpus.
  //   baseline.spec.ts        writes eval/reports/stage2-baseline.md + .json
  //   heldout.spec.ts         writes eval/reports/stage4-heldout.md and the replay bundle
  //   privacy-timings.spec.ts writes eval/reports/stage2-timings.md
  //
  // The last three are cited by name as sources in docs/deck-facts.md. All four are reachable
  // through playwright.reports.config.ts — `pnpm eval:heldout` and `pnpm eval:timings`. This does
  // not make them harder to run on purpose; it makes them impossible to run BY ACCIDENT.
  testIgnore: [
    '**/probe-fixtures.spec.ts',
    '**/baseline.spec.ts',
    '**/heldout.spec.ts',
    '**/privacy-timings.spec.ts',
  ],
  use: {
    baseURL: 'http://localhost:5174',
    // Replay remains off; Stage 4 supplies explicit local Eval/Judge recording.
    trace: 'off',
  },
});

