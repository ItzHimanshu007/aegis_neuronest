# Firefox verification — Stage 2.5 through Stage 3B Part II

Measured on macOS, Firefox **156.0**, geckodriver **0.37.1**, Selenium **4.49.0**, 2026-09-18.
`pnpm e2e:firefox` passed all 30 recorded checks against the unmodified generated MV3 manifest.
The machine-readable result is [firefox-stage2.5.json](../eval/reports/firefox-stage2.5.json).

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm portal                 # separate terminal, port 5174
pnpm portal:alt             # separate terminal, port 5175
pnpm run server             # mock API on port 8000 (needed for Chromium send test AND this one)
pnpm e2e:firefox
```

The harness uses a fresh temporary Firefox profile/add-on, native toolbar clicks, and native
Allow/Deny permission responses. It closes that profile at the end. Firefox must be installed;
the defaults are `/Applications/Firefox.app/Contents/MacOS/firefox` and
`/opt/homebrew/bin/geckodriver`; override with `FIREFOX_BINARY` / `GECKODRIVER` if needed.
`uv run` resolves the pinned Selenium dependency from the script metadata.

Classic WebDriver/BiDi do not expose Firefox's auxiliary sidebar as a normal tab. After Selenium's
temporary install, the harness addresses the sidebar through Firefox's existing Marionette actor
with geckodriver `--allow-system-access`. It does not patch the manifest, the app, or its permissions.
Checks return booleans/counts; raw values and image pixels are inspected inside the browser.

**Stage 3B Part II's scenario proxy.** Selenium/Firefox has no equivalent of Playwright's
`context.route()` (which is how Chromium's `extension/e2e/fixtures/task.ts -> forceScenario()`
injects `X-Aegis-Mock-Scenario`), so the agent-loop checks below that need a specific deterministic
scenario (`kyc_submit`, `login_credential`, `stale_state`) go through a small local reverse proxy
`scripts/firefox/e2e.py` starts on `127.0.0.1:8001`, sitting in front of the real mock server on
`:8000` and injecting the header only while `force_scenario()` has armed one. `pnpm e2e:firefox`
builds the Firefox extension with `WXT_SERVER_URL=http://localhost:8001` for exactly this reason
(see `package.json`); the real server still only ever needs to run on `:8000`, unchanged from
before. When no scenario is armed, every byte passes through unmodified — the file's original
default-plan check (no scenario forcing at all) is what actually proves that.

## Results

| Item | Result | Measured behavior |
| --- | --- | --- |
| Sidebar load/header | PASS | Actual sidebar document rendered Aegis under MV3 |
| Toolbar open/close | PASS | Native action clicks closed/opened sidebar via `sidebarAction.toggle()` |
| Initial permissions/injection | PASS | No `<all_urls>` at install; no manifest content scripts; on-demand injection |
| Single-site capture permission | PASS | Before an action/activeTab grant, localhost host permission alone failed with `Missing activeTab permission` |
| activeTab capture | PASS | After a toolbar action grant, capture succeeded without `<all_urls>` |
| Sidebar `permissions.request` | PASS | Trusted Observe click displayed native prompt; Deny showed an error; subsequent Allow completed capture |
| Subsequent Observe | PASS | Repeated observations completed without another permission prompt |
| KYC controls and text | PASS | Name/email/password/submit found; no known raw value in panel text; password absent from harvested values |
| Privacy Preview | PASS | Exact sealed KYC bytes contain none of the known synthetic raw values; sanitized image produced |
| OffscreenCanvas | PASS | Both PNG and WebP MIME exports succeeded in the sidebar document |
| WebCrypto HMAC | PASS | Non-extractable SHA-256 HMAC key signed 32 bytes; raw export rejected |
| Sidebar lifetime | PASS | Close/reopen destroyed document sentinel and prior process result; in-memory session/key references cannot survive that document |
| Open/closed shadow roots | PASS | Both found, including one closed-shadow control through extension-only closed-root access |
| Frames | PASS | Methods `top`, `same-origin`, `src-size-match`; two framed controls; zero `iframe-unmapped` regions |
| Dynamic page | PASS | Modal transition `NEW_SCREEN / dialog-appeared`; id/class rerender retained fp and EID; identical Add ordinals 0/1/2 |
| Hidden elements | PASS | All six hide reasons and off-screen case correct; covered button visible with hitOk=false |
| Capture hygiene | PASS | Overlay restored; sampled screenshot border had no overlay green |
| Capture burst | PASS | Four concurrent Observe requests completed |
| Alignment 100%, 125%, 67% | PASS | Pixel colors matched at 1, 1, 2 visible calibration-square centers respectively |
| Alignment after scroll, 100% | PASS | Center square matched |
| Agent loop: default plan round-trip | PASS | Consent → planner client → Authority Gate → executor → reacquire/rehydrate → verify, with no scenario forced; name round-tripped, task stopped from the ask_user question |
| Agent loop: kyc_submit | PASS | L5 approval dialog shown before the commit; form actually submitted after Approve |
| Agent loop: login_credential | PASS | L4 (type) then L5 (click) both approved; signed in; session ended cleanly; raw password never appeared in anything the proxy relayed to the server |
| Agent loop: stale_state | PASS | Mismatched `state_token` rejected client-side on every attempt; name field never touched |
| Agent loop: Stop mid-task | PASS | Aborted in under 3s while a fill was in flight; `endSession` called with only `{session}`; no raw value leaked into panel text; no stale dialog |
| WebP quality:1 pixel identity | measurement only | Raw screenshots identical in both browsers; **redacted** images are NOT pixel-identical in Firefox (≈1,260/6.45M channel values differ, max delta 6/255) — the reason PNG stays the shipped format; see `docs/architecture.md` and `eval/reports/stage3-tasks.md` |

Firefox capture requires **`activeTab` or `<all_urls>`**, not just a host permission for the current
site, at the tested operating point. A toolbar click can confer activeTab; a sidebar Observe click
alone is a different gesture, so the existing explicit optional `<all_urls>` request remains.
See [MDN captureVisibleTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab),
[closed-root access](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot),
and [geckodriver flags](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html).

## Fixed during bring-up

The click handler used to await `tabs.query` before calling `permissions.request`. Firefox lost the
user gesture across that await and rejected the request. The handler now starts the permission
request synchronously in the click and obtains tab context concurrently; there is no browser sniff.

## Remaining human checks

All programmatically drivable Firefox checklist items above ran. A visual review of overlay edges,
toolbar placement and permission wording is still useful: load
`extension/.output/firefox-mv3/manifest.json` via `about:debugging#/runtime/this-firefox`, open
`http://localhost:5174/kyc.html`, click the toolbar, click Observe, then review the list/screenshot.
On `calibration.html`, compare overlay edges at 100%, 125%, 67% and after scrolling; automated tests
sample centers and a border, not every pixel or subjective layout.

The **Chrome native permission bubble remains a user check**: load the unmodified
`extension/.output/chrome-mv3` in `chrome://extensions`, open KYC, open Aegis, click Observe yourself
and press Allow. Chromium Playwright uses a temporary test copy with the optional host permission
pre-granted; it cannot certify that native bubble. This does not affect the real Firefox prompt test.
