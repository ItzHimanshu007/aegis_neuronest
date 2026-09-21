import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // e2e/, e2e-demo/, e2e-eval/ and e2e-evidence/ hold Playwright specs (`pnpm e2e`, `pnpm demo`,
    // `pnpm eval:fsr`, `pnpm evidence:*`), which must not be collected by Vitest — they use
    // Playwright's own `test()` and need a real browser with the built extension loaded.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      'e2e/**',
      'e2e-demo/**',
      'e2e-eval/**',
      'e2e-evidence/**',
    ],
  },
});
