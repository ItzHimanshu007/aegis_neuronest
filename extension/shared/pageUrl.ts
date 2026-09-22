/**
 * A tab's address, or a clear reason Aegis cannot work on it.
 *
 * `browser.tabs.get()` omits `url` entirely for any page the extension holds no host permission
 * for, and the `<all_urls>` grant Aegis asks for deliberately does NOT cover `chrome://`,
 * `about:`, `edge://`, the Web Store, or a new-tab page. So an ordinary situation — the side panel
 * open on a fresh tab, the user typing "go to <site>" as the very first instruction — produces a
 * Tab with an `id` but no `url`, with every permission correctly granted.
 *
 * That was tolerated in one place and fatal in the next: `background.ts` already caught the empty
 * URL for change detection ("tab.url can be empty (e.g. chrome://newtab in some states)"), then
 * passed `tab.url ?? ''` straight into the observation, where `scene/index.ts` and
 * `scene/registry.ts` call `new URL(observation.url)` unguarded. The task died on a bare DOM
 * exception — `Failed to construct 'URL': Invalid URL` — as its whole failure message, naming
 * nothing the user could act on and pointing at no page. Found by asking a task to navigate to a
 * site from a new tab; every demo-portal test missed it because `http://localhost/*` is a static
 * host permission, so `tab.url` is always readable there.
 *
 * Fail closed and say what to do instead. An unreadable address is also a real privacy boundary:
 * consent, re-hydration and the authority gate are all keyed on origin, and none of them mean
 * anything if Aegis cannot tell which site it is on.
 */
export const NO_PAGE_URL =
  'Aegis cannot read this tab\'s address, so it cannot tell which site it would be acting on. ' +
  'Browser pages like a new tab are not readable even with permission granted. Open the site you ' +
  'want in an ordinary tab, then start the task there.';

/** The tab's URL, or a message the user can act on. Never returns an unparseable string. */
export function pageUrlOrThrow(url: string | undefined | null): string {
  if (!url) throw new Error(NO_PAGE_URL);
  try { new URL(url); } catch { throw new Error(NO_PAGE_URL); }
  return url;
}

/** The tab's origin, or the same actionable message. */
export function pageOriginOrThrow(url: string | undefined | null): string {
  return new URL(pageUrlOrThrow(url)).origin;
}

/** Whether a tab address is one Aegis can act on, for UI that needs to ask rather than throw. */
export function isUsablePageUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}
