import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..', '.output', 'chrome-mv3');

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  sidepanelUrl: string;
}

/**
 * Loads the built Chrome MV3 extension (run `pnpm build` — or the `pretest`-style build step in
 * `pnpm e2e` — first) into a persistent context, the officially supported way to test MV3
 * extensions with Playwright (headless MV3 extension loading isn't supported by Chrome, hence
 * `headless: false` here — see https://playwright.dev/docs/chrome-extensions).
 */
export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      // Playwright's default (when `viewport` is omitted) is to apply a CDP viewport override —
      // 1280x720 — to every page. That override is a *virtual* viewport layered on top of
      // whatever the real OS window actually is; `window.innerWidth/innerHeight` reflect the
      // override, but `tabs.captureVisibleTab` is a native browser API that bypasses CDP
      // emulation entirely and captures the REAL window's real content area. The two normally
      // agree by coincidence-of-defaults, but in this sandbox's small (1280x720) virtual display
      // the real window (content + tab strip/omnibox chrome) doesn't fit on screen, so they
      // diverge — which is exactly the scaleY mismatch the alignment test caught. `viewport: null`
      // disables the CDP override so `window.innerWidth/innerHeight` report the *real* window
      // size instead, which is what `captureVisibleTab` actually captures — matching normal
      // real-desktop Chrome behavior, where this divergence cannot happen in the first place.
      viewport: null,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-first-run', '--window-position=0,0', '--window-size=1000,650'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const id = extractExtensionId(background);
    await use(id);
  },

  sidepanelUrl: async ({ extensionId }, use) => {
    await use(`chrome-extension://${extensionId}/sidepanel.html`);
  },
});

function extractExtensionId(worker: Worker): string {
  const match = /^chrome-extension:\/\/([a-z]+)\//.exec(worker.url());
  if (!match) throw new Error(`Could not extract extension id from service worker URL: ${worker.url()}`);
  return match[1]!;
}

export { expect } from '@playwright/test';
