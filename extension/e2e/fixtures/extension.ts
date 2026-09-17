import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILT_EXTENSION = path.resolve(__dirname, '..', '..', '.output', 'chrome-mv3');

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  sidepanelUrl: string;
}

/**
 * Builds a test-only copy of the extension with `<all_urls>` moved from `optional_host_permissions`
 * into `host_permissions`.
 *
 * WHY: in production Aegis requests `<all_urls>` at runtime from the Observe click handler, which
 * raises Chrome's native permission bubble. That bubble is browser chrome, not page content —
 * Playwright cannot see or accept it, so `permissions.request()` never settles and every test
 * hangs. Pre-granting makes `permissions.request()` resolve immediately with `true` (Chrome
 * short-circuits when a permission is already held), so the SAME code path runs, with the same
 * `requestSiteAccess()` call, minus the un-automatable dialog.
 *
 * What this does NOT change: the pipeline under test, the manifest's structure, or the fact that
 * a real user sees and must accept that prompt. The prompt itself is covered by the manual
 * checklist in docs/manual-test-firefox.md and the Chrome manual verification in the stage report.
 */
function makeTestExtensionCopy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aegis-ext-'));
  cpSync(BUILT_EXTENSION, dir, { recursive: true });

  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };
  const optional = manifest.optional_host_permissions ?? [];
  manifest.host_permissions = Array.from(new Set([...(manifest.host_permissions ?? []), ...optional]));
  manifest.optional_host_permissions = [];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return dir;
}

/**
 * Loads the built Chrome MV3 extension into a persistent context, the officially supported way to
 * test MV3 extensions with Playwright (headless MV3 extension loading isn't supported by Chrome,
 * hence `headless: false` — see https://playwright.dev/docs/chrome-extensions).
 */
export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    // One patched copy per test, removed again in the teardown below — without that cleanup the
    // suite leaves a copy of the whole extension in the temp dir per test, which piles up fast
    // (a few hundred runs is a few hundred megabytes, and the recursive copy gets slower as the
    // directory fills).
    const extensionPath = makeTestExtensionCopy();
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      // Playwright's default is to apply a CDP viewport override (1280x720) to every page. That
      // override is a *virtual* viewport layered on top of whatever the real OS window is;
      // `window.innerWidth/innerHeight` reflect the override, but `tabs.captureVisibleTab` is a
      // native browser API that bypasses CDP emulation entirely and captures the REAL window. The
      // two normally agree by coincidence-of-defaults, but in this sandbox's small virtual display
      // the real window doesn't fit on screen, so they diverge — which is exactly the scaleY
      // mismatch the alignment test caught. `viewport: null` disables the override so
      // `window.innerWidth/innerHeight` report the real window size, matching what the native
      // capture actually sees (and matching normal real-desktop Chrome, where this cannot happen).
      viewport: null,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--window-position=0,0', '--window-size=1000,650'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    await use(context);
    await context.close();
    rmSync(extensionPath, { recursive: true, force: true });
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
