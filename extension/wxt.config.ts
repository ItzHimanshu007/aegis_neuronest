import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Aegis',
    description:
      'Aegis — a privacy-preserving browser vision agent. Redacts PII locally before any page data leaves the browser.',
    permissions: [
      'storage',
      'scripting',
      'tabs',
      'activeTab',
      ...(browser === 'chrome' ? ['sidePanel' as const] : []),
    ],
    host_permissions: ['<all_urls>'],
    // Firefox needs an explicit id for sidebar_action / persistent background APIs.
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'aegis@sih26171.local',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          }
        : undefined,
  }),
  // WXT defaults Firefox to MV2. Aegis targets MV3 on both browsers: force it here and
  // the generated background is an MV3 event page (background.scripts, persistent: false)
  // rather than a background page.
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox') {
        manifest.manifest_version = 3;
      }
    },
  },
});
