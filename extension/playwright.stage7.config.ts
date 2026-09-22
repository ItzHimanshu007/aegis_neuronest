import { defineConfig } from '@playwright/test';

/**
 * The Stage 7 measurement, run deliberately.
 *
 * `e2e/stage7.spec.ts` WRITES `eval/reports/stage7-label-independence.md`. Commit 17eda7a records
 * what happens when an evidence-writing spec is collected by the ordinary regression config: a
 * `pnpm e2e` run silently re-measured and overwrote submitted numbers, destroying a committed
 * Stage 4 status block once already. So this spec is in `playwright.config.ts`'s `testIgnore` and
 * reachable only here, through `pnpm eval:stage7`.
 *
 * `retries: 0`, unlike the regression suite's 1: a retried measurement silently resamples the very
 * number being measured, and the second sample is the one that would be written to the report.
 *
 * Unlike `playwright.reports.config.ts`, this config touches NOTHING of Stage 4's. It reads
 * `demo-portal/stage7/` and writes one report that did not exist before. `pnpm eval:heldout` and
 * `pnpm eval:timings` remain the only way to regenerate the Stage 4 and Stage 2 evidence.
 *
 * Preconditions: a current `wxt build --browser chrome`, the demo portal on :5174, and the alt
 * portal on :5175 (the cross-origin frame in `stage7/iframe.html`). The server is not involved —
 * detection is scored locally, before `send()`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/stage7.spec.ts'],
  timeout: 3_600_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
  },
});
