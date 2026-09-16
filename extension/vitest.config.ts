import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // e2e/ holds Playwright specs (`pnpm e2e`), which must not be collected by Vitest — they use
    // Playwright's own `test()` and need a real browser with the built extension loaded.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.output/**', '**/.wxt/**', 'e2e/**'],
  },
});
