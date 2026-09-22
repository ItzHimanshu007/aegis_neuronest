import { describe, expect, it } from 'vitest';
import { pageUrlOrThrow, pageOriginOrThrow, isUsablePageUrl, NO_PAGE_URL } from '../pageUrl';

/**
 * Regression for a real-browser failure: a task started from a new tab died with the bare DOM
 * exception `Failed to construct 'URL': Invalid URL` as its entire failure message.
 *
 * `<all_urls>` does not cover browser pages, so `browser.tabs.get()` returns a Tab with an id and
 * no url even when every permission is granted. `background.ts` turned that into `url: tab.url ?? ''`
 * and `scene/index.ts` / `scene/registry.ts` then called `new URL('')`. The empty string was the
 * bug: it looks like a URL to the type system and is not one.
 *
 * Every demo-portal test missed this because `http://localhost/*` is a STATIC host permission, so
 * `tab.url` is always readable there — the one shape of page the suite never exercised.
 */
describe('page address', () => {
  it.each([
    ['undefined, as an unpermitted tab reports it', undefined],
    ['null', null],
    ['the empty string background.ts used to substitute', ''],
    ['a bare title that is not an address', 'New Tab'],
  ])('refuses %s with something the user can act on', (_name, url) => {
    expect(() => pageUrlOrThrow(url)).toThrow(NO_PAGE_URL);
    expect(isUsablePageUrl(url)).toBe(false);
  });

  it('names the page kind and the way out, never the DOM exception', () => {
    expect(NO_PAGE_URL).toMatch(/new tab/i);
    expect(NO_PAGE_URL).not.toMatch(/Failed to construct/i);
  });

  it.each([
    ['https://www.netflix.com/browse', 'https://www.netflix.com'],
    ['http://localhost:5174/kyc.html', 'http://localhost:5174'],
  ])('accepts %s and reports its origin', (url, origin) => {
    expect(pageUrlOrThrow(url)).toBe(url);
    expect(pageOriginOrThrow(url)).toBe(origin);
    expect(isUsablePageUrl(url)).toBe(true);
  });

  // Browser pages parse fine; they are refused earlier, by the permission that never covers them.
  // This only pins that parsing is the test, so a readable chrome:// URL is not rejected here.
  it('treats a parseable browser URL as parseable', () => {
    expect(isUsablePageUrl('chrome://newtab/')).toBe(true);
  });
});
