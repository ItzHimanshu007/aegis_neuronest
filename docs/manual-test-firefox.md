# Manual test checklist — Firefox (Stage 1)

Automated Playwright e2e runs on Chromium only (Stage 1 Part G.2: "Firefox: automated e2e is
optional"). Playwright cannot load a temporary MV3 add-on into Firefox the way it can into
Chromium, so the same checks are run by hand here. Everything below mirrors a Chromium e2e test —
the test file each item corresponds to is named so failures can be compared directly.

## Setup

```sh
pnpm install
pnpm build                 # builds extension/.output/firefox-mv3
pnpm portal                # demo portal on http://localhost:5174
pnpm portal:alt            # second origin on http://localhost:5175 (needed for frames.html)
```

Load the add-on: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick any
file inside `extension/.output/firefox-mv3` (e.g. `manifest.json`).

Or, to have `web-ext` launch a clean profile with it already loaded:

```sh
cd extension && npx web-ext run --source-dir=.output/firefox-mv3
```

Note the add-on is removed when Firefox restarts (temporary add-ons always are), so permissions
granted below are re-requested on the next run. That is expected.

## 1. Toolbar button and sidebar (F1)

- [ ] An **Aegis** button is present in the toolbar (its tooltip reads "Aegis").
- [ ] Clicking it **opens** the sidebar showing the Aegis panel.
- [ ] Clicking it again **closes** the sidebar (Firefox uses `sidebarAction.toggle()`, called
      synchronously inside `action.onClicked` — see entrypoints/background.ts).
- [ ] The panel header shows "Aegis" with a status dot.

## 2. Permissions (F2)

- [ ] `about:addons` → Aegis → Permissions shows **no** `<all_urls>` granted at install time
      (only `http://localhost/*`, plus activeTab/scripting/storage).
- [ ] The panel shows the note: "Aegis will ask for screen-capture access the first time you click
      Observe."
- [ ] Clicking **Observe** raises Firefox's permission prompt for access to all sites.
- [ ] **Deny** it → the panel shows "Screen-capture access was denied (needed to observe …)".
- [ ] Click **Observe** again and **Allow** → the observation completes.
- [ ] Re-clicking Observe afterwards does **not** prompt again.
- [ ] Verify `tabs.captureVisibleTab` works with this permission set. (On Chrome, a scoped
      per-origin host permission is *not* sufficient for `captureVisibleTab` — only `<all_urls>`
      or `activeTab` — which is why `requestSiteAccess()` requests `<all_urls>`. Confirm Firefox
      behaves the same way, and note it here if it differs.)
- [ ] `about:debugging` → Inspect the background script → confirm no `content_scripts` entry
      exists in the manifest; the harvester is injected on demand via `scripting.executeScript`.

## 3. kyc.html — marks, roles, names (mirrors e2e/kyc.spec.ts)

Open `http://localhost:5174/kyc.html`, then Observe.

- [ ] The mark list contains `textbox "Full name"`, `textbox "Email address"`,
      `textbox "Password"`, and `button "Submit verification"`.
- [ ] **No raw value appears anywhere in the panel**: search the panel for `Asha Verma`,
      `hunter22`, `2345 6789 0123` — none must appear.
- [ ] There is **no** "Show values" toggle anywhere in the panel.
- [ ] The screenshot renders in the panel with the mark overlay aligned to the real controls.

## 4. calibration.html — alignment (mirrors e2e/calibration.spec.ts)

Open `http://localhost:5174/calibration.html`, then Observe.

- [ ] Each coloured square's overlay rectangle sits exactly on the square in the panel's
      screenshot view, at **100%**, **125%** and **67%** zoom (Ctrl/Cmd + `+` / `-`).
- [ ] Scroll halfway down and re-Observe: overlays still align.
- [ ] If they drift, note the reported `scaleX`/`scaleY` vs `window.devicePixelRatio` — a
      non-uniform scaleX vs scaleY means the capture and `window.innerHeight` disagree.

## 5. shadow.html — shadow DOM (mirrors e2e/shadow.spec.ts)

- [ ] The **open** shadow root's field ("Open-shadow name") appears in the mark list.
- [ ] The **closed** shadow root's field ("Closed-shadow email") appears too. Firefox exposes
      closed roots to extensions via `Element.openOrClosedShadowRoot`; if this field is missing,
      that API is unavailable in this Firefox version — record the version here.

## 6. frames.html — frame mapping (mirrors e2e/frames.spec.ts)

- [ ] The **same-origin** iframe's "Framed name" field appears, and its overlay box is drawn over
      the iframe (i.e. composed into top-level coordinates, not at the page origin).
- [ ] The **cross-origin** iframe (port 5175) is either mapped, or reported as an
      `iframe-unmapped` media region. Record which — this is the main Chrome/Firefox difference
      worth documenting, since Chrome and Firefox resolve frame ids differently.

## 7. dynamic.html — change detection and fingerprints (mirrors e2e/dynamic.spec.ts)

- [ ] Dismiss the auto-opening modal, Observe (baseline), then click **Open modal again** and
      Observe: the panel reports `NEW_SCREEN (dialog-appeared)`.
- [ ] Click **Re-render form**, Observe: the "Re-rendered field" mark keeps the **same `fp`** as
      before the re-render, despite its id and class changing.
- [ ] The three "Add" buttons share one `fp` and carry ordinals `0`, `1`, `2`.

## 8. hidden.html — visibility (mirrors e2e/hidden.spec.ts)

- [ ] Every hidden field is still listed, flagged hidden, with the right reason:
      `display-none`, `visibility-hidden`, `opacity-zero`, `aria-hidden`, `inert`, `zero-size`,
      and off-screen as `outside-viewport` (or `clipped`).
- [ ] The banner-covered "Click me" button is **visible** but reports `hitOk=false`.

## 9. Overlay and capture hygiene (mirrors e2e/overlay-and-throttle.spec.ts)

- [ ] After an observation, the debug overlay is drawn over the page.
- [ ] Observe a second time: **the overlay does not appear in the captured screenshot** shown in
      the panel (it is hidden for the capture, then restored).
- [ ] The overlay is visible again on the page after the capture finishes.
- [ ] Click Observe rapidly several times: every observation completes, none error out, and
      Firefox does not complain about capture rate limits.

## 10. Report

Record the Firefox version, and for each unchecked box, what happened instead. Anything that
differs from Chromium belongs in the Stage report's "Known issues" section.
