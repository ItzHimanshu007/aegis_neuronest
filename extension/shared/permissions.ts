/**
 * Site-access permission requests (Stage 1 F2). `browser.permissions.request()` only succeeds
 * when called synchronously-ish within an active user gesture (MDN: "must be called from within a
 * user action, e.g. a click handler"). That transient-activation state does NOT survive a
 * `runtime.sendMessage` hop to the background service worker in either Chrome or Firefox — the
 * activation is a property of the calling document, not something that crosses execution
 * contexts. That's why this function is called directly from the side panel's click handler
 * (entrypoints/sidepanel/App.tsx), not proxied through background.ts as a message, even though
 * "requestSiteAccess lives in background" reads more naturally on paper. See the Stage 1 report
 * for this deviation.
 *
 * Requests the literal `<all_urls>` optional permission, not a scoped `origin + "/*"` pattern, for
 * a reason verified empirically while building this stage: `browser.tabs.captureVisibleTab` has a
 * special-cased permission check that only accepts the literal `<all_urls>` permission or an
 * active `activeTab` grant — an exactly-matching scoped host permission (e.g.
 * `http://localhost:5174/*`, even when `permissions.contains()` reports it as covering the tab)
 * is NOT sufficient and `captureVisibleTab` still throws "Either the '<all_urls>' or 'activeTab'
 * permission is required." `scripting.executeScript` (DOM reads) is not special-cased this way and
 * accepts scoped host permissions fine — it's specifically the screenshot capture step that forces
 * this. Since Aegis needs the screenshot every observation, requesting the scoped pattern here
 * would only work until the very first capture, so there is no useful narrower request to make.
 */

export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

const CAPTURE_PERMISSION_PATTERN = '<all_urls>';

export interface SiteAccessResult {
  granted: boolean;
  origin: string;
}

/** Requests the `<all_urls>` optional permission (see docblock above). `tabUrl` is used only to
 * report which origin triggered the request, for the panel's messaging — it does not change what
 * is actually requested. Must be called synchronously from a user-gesture event handler (a click),
 * not after an intervening `await`. */
export async function requestSiteAccess(tabUrl: string): Promise<SiteAccessResult> {
  const origin = originPattern(tabUrl);
  const granted = await browser.permissions.request({ origins: [CAPTURE_PERMISSION_PATTERN] });
  return { granted, origin };
}

export async function hasSiteAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: [CAPTURE_PERMISSION_PATTERN] });
}
