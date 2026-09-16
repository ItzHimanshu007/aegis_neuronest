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
    // F1: an explicit `action` so the toolbar has a clickable button at all — without it, Chrome
    // has nothing to open the side panel from and Firefox's sidebar_action doesn't add a toolbar
    // button by itself. No default_popup: the click is handled in code (see background.ts) so it
    // can open the panel (Chrome) / toggle the sidebar (Firefox) instead of showing a popup.
    action: {
      default_title: 'Aegis',
    },
    // F2 (least privilege): activeTab + scripting + storage only. Chrome additionally needs
    // sidePanel. `tabs` was dropped — nothing here reads tab.url/title beyond what activeTab
    // already exposes for the current tab, and the one place we need another tab's URL
    // (background.ts's runObservationPipeline) only ever runs against a tab the user just
    // explicitly granted host permission for via requestSiteAccess (shared/permissions.ts), which
    // makes that tab's `url`/`title` visible to `tabs.get`/`tabs.query` without the blanket `tabs`
    // permission.
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      ...(browser === 'chrome' ? ['sidePanel' as const] : []),
    ],
    // F2: no required <all_urls>. `http://localhost/*` is required only so DOM reads
    // (scripting.executeScript) work on the demo portal out of the box, without an extra
    // permission prompt, during development. `optional_host_permissions: ['<all_urls>']` is
    // requested at runtime by requestSiteAccess() (shared/permissions.ts) the first time the user
    // clicks Observe — see that file's docblock for why it has to be `<all_urls>` and not a
    // scoped per-origin pattern (tabs.captureVisibleTab specifically requires the literal
    // `<all_urls>`/`activeTab` permission; empirically verified, a scoped host permission does
    // NOT satisfy it even when it exactly matches the tab's origin — see the Stage 1 report).
    host_permissions: ['http://localhost/*'],
    optional_host_permissions: ['<all_urls>'],
    // Firefox needs an explicit id for sidebar_action / persistent background APIs.
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'aegis@sih26171.local',
              strict_min_version: '140.0',
              // F3: Aegis sends sanitized page content (redacted screenshots, element labels,
              // tokens) to a user-configured server once Stage 2/3 land — "none" would be
              // inaccurate. "websiteContent" is the category MDN/Extension Workshop define as
              // covering visible page content (text, images, embedded data): see
              // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
              data_collection_permissions: { required: ['websiteContent'] },
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
