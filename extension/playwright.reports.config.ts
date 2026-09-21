import { defineConfig } from '@playwright/test';

/**
 * The evidence-writing specs, run deliberately.
 *
 * Three specs under `./e2e` do not only assert — they WRITE the measurement reports this project
 * submits as evidence:
 *
 *   baseline.spec.ts        -> eval/reports/stage2-baseline.md + .json
 *   heldout.spec.ts         -> eval/reports/stage4-heldout.md, and the replay bundle
 *                              eval/replay/heldout/heldout-score.json
 *   privacy-timings.spec.ts -> eval/reports/stage2-timings.md
 *   probe-fixtures.spec.ts  -> eval/model_probe/fixtures/ (the sealed payloads the model probe
 *                              measures against)
 *
 * All three are cited by name as sources in `docs/deck-facts.md`. Until this config existed they
 * were collected by the default `playwright.config.ts`, so an ordinary `pnpm e2e` regression run
 * silently re-measured and rewrote them — which is how a committed Stage 4 status block was lost
 * once already, and the most likely origin of the bd62c26 -> b97ccfc held-out drift. They are now
 * excluded there (`testIgnore`) and reachable only through this config.
 *
 * `retries: 0`, unlike the regression suite's 1: a retried measurement silently resamples the very
 * number being measured, and the second sample is the one that would be written to the report.
 *
 * baseline.spec.ts and heldout.spec.ts must run TOGETHER and in that order — heldout reads the
 * machine-readable sidecar baseline writes in the same run to build its authored-vs-held-out
 * comparison. `pnpm eval:heldout` passes both, which is why it names them explicitly.
 *
 * Same preconditions as `pnpm e2e`: a current `wxt build --browser chrome`, the demo portal on
 * :5174, and the server on :8000.
 */
export default defineConfig({
  testDir: './e2e',
  // Only the evidence writers. Everything else stays in the regression suite.
  //
  // probe-fixtures.spec.ts is included because it is the same kind of thing and, since it was
  // added to the default config's `testIgnore`, its own documented command
  // (`npx playwright test e2e/probe-fixtures.spec.ts`) has silently matched nothing: `testIgnore`
  // removes a file from discovery, and a positional argument only filters what was discovered.
  // Naming it here gives it a config that can actually reach it again.
  testMatch: [
    '**/baseline.spec.ts',
    '**/heldout.spec.ts',
    '**/privacy-timings.spec.ts',
    '**/probe-fixtures.spec.ts',
  ],
  timeout: 600_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
  },
});
