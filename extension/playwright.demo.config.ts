import { defineConfig } from '@playwright/test';

/**
 * Separate config for the scripted, recordable demo path (demo-readiness session, Part C) — kept
 * out of `playwright.config.ts`/`./e2e` on purpose so it never counts toward or slows down the
 * checked `pnpm e2e` suite (66/66). Requires the same things `pnpm e2e` does: the extension built
 * (`pnpm build` — the demo runs the packaged build, not a dev server), the demo portal on :5174
 * (`pnpm portal`), and the server on :8000 (mock by default, or live — see README's Demo path
 * section for `AEGIS_DEMO_LIVE=1`).
 */
export default defineConfig({
  testDir: './e2e-demo',
  timeout: process.env.AEGIS_DEMO_LIVE ? 600_000 : 45_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
  },
});
