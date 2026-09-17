# STAGE REPORT — Stage 2.5

Measured on macOS, 2026-09-17. Scope: Parts 0–I of the approved Stage 2.5 prompt.

## 1. Summary

- Brought up the unmodified Firefox MV3 extension with Selenium/geckodriver and added `pnpm e2e:firefox`.
- Updated architecture v6, stages and invariants around a trusted local control plane and untrusted remote proposals.
- Added fill-state handling, policy v3 identifiers, PIN disambiguation, specific labels and independent image/detector sizes.
- Migrated observations, detections, masks, preview and debug overlay to registry-issued EIDs; composed frame identity before assigning ordinals.
- Added Scene Graph projections, opaque state tokens, schema v2, generated validators, Pydantic mirrors and mock responses.
- Added pure plan/action checks and L0–L5 authority classification, including batch aborts and mandatory commit approval.
- Added bounded local audit, an off-by-default replay stub, per-origin linkability and pure sensing/context-expansion decisions.
- Regenerated baseline v2 and timing measurements; future planner/executor/consent/model work remains in its assigned stages.

## 2. File tree

Depth 3. Excludes `node_modules`, `.venv`, `dist`, Git metadata, browser build output, WXT/cache directories and ephemeral test results. Generated manifests are reproduced in section 4.

```text
├── demo-portal/
│   ├── src/
│   │   ├── dynamic.ts
│   │   ├── kyc.ts
│   │   ├── pii-zoo.ts
│   │   ├── shadow.ts
│   │   └── style.css
│   ├── calibration.html
│   ├── dynamic.html
│   ├── frame-form.html
│   ├── frames.html
│   ├── hidden.html
│   ├── index.html
│   ├── kyc.html
│   ├── package.json
│   ├── pii-zoo.html
│   ├── shadow.html
│   ├── vite.alt.config.ts
│   └── vite.config.ts
├── docs/
│   ├── STAGE-2.5-REPORT.md
│   ├── STAGES.md
│   ├── architecture.md
│   ├── identifier-sources.md
│   ├── manual-test-firefox.md
│   ├── policy.yaml
│   └── threat_model.md
├── eval/
│   ├── reports/
│   │   ├── screenshots/
│   │   ├── firefox-stage2.5.json
│   │   ├── stage2-baseline.md
│   │   └── stage2-timings.md
│   └── README.md
├── extension/
│   ├── agent/
│   │   ├── approval.ts
│   │   ├── checks.ts
│   │   ├── executor.ts
│   │   ├── reacquire.ts
│   │   ├── rehydrate.ts
│   │   ├── runAgentLoop.ts
│   │   └── validator.ts
│   ├── agentHost/
│   │   ├── index.ts
│   │   └── session.ts
│   ├── audit/
│   │   ├── __tests__/
│   │   ├── log.ts
│   │   └── replay.ts
│   ├── authority/
│   │   ├── __tests__/
│   │   └── index.ts
│   ├── e2e/
│   │   ├── fixtures/
│   │   ├── baseline.spec.ts
│   │   ├── calibration.spec.ts
│   │   ├── dynamic.spec.ts
│   │   ├── frames.spec.ts
│   │   ├── hidden.spec.ts
│   │   ├── kyc.spec.ts
│   │   ├── overlay-and-throttle.spec.ts
│   │   ├── privacy-timings.spec.ts
│   │   ├── privacy.spec.ts
│   │   ├── scene.spec.ts
│   │   ├── shadow.spec.ts
│   │   ├── smoke.spec.ts
│   │   └── timings.spec.ts
│   ├── entrypoints/
│   │   ├── sidepanel/
│   │   ├── background.ts
│   │   └── content.ts
│   ├── models/
│   │   └── README.md
│   ├── net/
│   │   ├── __tests__/
│   │   └── network.ts
│   ├── observe/
│   │   ├── __tests__/
│   │   ├── accessibleName.ts
│   │   ├── blockAncestor.ts
│   │   ├── captureAdapter.ts
│   │   ├── change.ts
│   │   ├── classify.ts
│   │   ├── compose.ts
│   │   ├── dhash.ts
│   │   ├── diff.ts
│   │   ├── fingerprint.ts
│   │   ├── frames.ts
│   │   ├── harvester.ts
│   │   ├── inputWatcher.ts
│   │   ├── overlay.ts
│   │   ├── rateLimiter.ts
│   │   ├── settle.ts
│   │   ├── spanRects.ts
│   │   ├── types.ts
│   │   ├── typingState.ts
│   │   └── visibility.ts
│   ├── perception/
│   │   └── README.md
│   ├── privacy/
│   │   ├── __tests__/
│   │   ├── detect/
│   │   ├── generated/
│   │   ├── rules/
│   │   ├── categoryTypes.ts
│   │   ├── firewall.ts
│   │   ├── payloadBuilder.ts
│   │   ├── policy.ts
│   │   ├── policyData.ts
│   │   ├── redactor.ts
│   │   ├── sealedRegistry.ts
│   │   ├── sideChannels.ts
│   │   └── vault.ts
│   ├── scene/
│   │   ├── __tests__/
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   ├── stateTokens.ts
│   │   └── types.ts
│   ├── sensing/
│   │   ├── __tests__/
│   │   ├── contextExpansion.ts
│   │   └── index.ts
│   ├── shared/
│   │   ├── schema/
│   │   ├── config.ts
│   │   ├── messages.ts
│   │   └── permissions.ts
│   ├── package.json
│   ├── playwright.config.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── wxt.config.ts
├── scripts/
│   ├── firefox/
│   │   └── e2e.py
│   ├── gen-policy.mjs
│   ├── gen-types.mjs
│   ├── gen-validator.mjs
│   ├── print-manifests.mjs
│   └── validate-fixtures.mjs
├── server/
│   ├── app/
│   │   ├── api/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   ├── vlm/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── main.py
│   │   └── session_store.py
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_health.py
│   │   ├── test_plan.py
│   │   └── test_schema_agreement.py
│   ├── .python-version
│   ├── pyproject.toml
│   └── uv.lock
├── shared/
│   └── schema/
│       ├── examples/
│       ├── agreement-cases.json
│       ├── payload.v2.schema.json
│       └── plan.v2.schema.json
├── .gitignore
├── .nvmrc
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── eslint.config.ts
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

## 3. Commands run and results

Browser checks use the synthetic portals on ports 5174/5175 and the mock API on port 8000. The existing stale v1 mock process was restarted with `pnpm run server`; plain `pnpm server` is a pnpm command collision.

| Command | Result / key output |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | PASS — `Lockfile is up to date, resolution step is skipped`; `Already up to date`; pnpm 10.22.0 |
| `uv sync --project server --frozen --offline` | PASS — `Checked 34 packages in 12ms` |
| `pnpm gen:all` | PASS — regenerated schema TS, policy data, standalone payload/plan validators |
| `pnpm build` | PASS — Chrome MV3 and Firefox MV3 production builds; browser suites also rebuild their target |
| `pnpm check` | PASS — typecheck/ESLint; `42 passed` Vitest files, `825 passed` tests; Ruff `All checks passed!`, `22 files already formatted`; pytest `68 passed, 2 warnings` |
| Schema validation within `pnpm check` | PASS — both example fixtures; `55 positive/negative schema agreement cases` |
| `pnpm e2e` | PASS — `33 passed (1.4m)` |
| `pnpm e2e:firefox` | PASS — all 21 recorded checks; unmodified Firefox MV3 |
| `pnpm --filter aegis-extension exec web-ext lint --source-dir=.output/firefox-mv3` | PASS — `errors 0`, `notices 0`, `warnings 3` |
| `pnpm --filter aegis-extension exec web-ext lint --source-dir=.output/chrome-mv3` | Mozilla compatibility validator: 2 errors, 4 warnings; see section 7 |
| `git diff --check` | PASS — no whitespace errors |
| Source scan for `mark_id` | No production/outbound references; occurrences are rejection fixtures and negative assertions |

Failures encountered and resolved: Firefox lost the permission-request gesture after an awaited tab query; a later native-click harness timeout was fixed by waiting for the enabled Observe button; Chromium frame composition exposed a child-local frame ID of zero and now uses the router-assigned frame ID for elements/media/text. Each code fix was followed by the relevant checks. No failure was suppressed by weakening the privacy assertions.

### Baseline v2 and linkability ablation

Corpus: authored `pii-zoo.html`, 93 annotations (59 positive, 34 negative), 12 overlapping viewport captures, Chromium 153.0.8010.12, balanced mode, DOM cascade only. Labelled malformed identifiers are positive; unlabelled near-misses are negative. The page adds 32 unlabelled catalogue/prose/table negatives, alongside two planted-token negatives. Matching deduplicates exact annotated instances/categories using EID geometry and text span/value containment; it does not estimate true positives from category counts. Off-annotation detections and side channels are outside this metric.

| Rule | TP | FP | FN | Detection precision | Recall | Protection precision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Without linkability | 58 | 4 | 1 | 0.935 | 0.983 | 0.935 |
| With linkability, K=3 | 58 | 4 | 1 | 0.935 | 0.983 | 0.935 |

Both policy arms consume the same measured detection stream with `necessity=not_needed`, no overrides and the identity-seen rule enabled. **Zero decisions changed**: this page exposes identity before its quasi categories. Quasi-only threshold behavior, origin isolation and session reset are tested separately. This is no measured improvement claim.

The latest run includes one IFSC and two tracking false positives from previously vaulted strings/numeric substrings in unlabelled values, plus CITY inside an ADDRESS annotation. An earlier run had 3 FPs instead of 4; these browser/viewport measurements are not claimed to be deterministic or generalizable. The NAME annotation miss remains counted. A separate centered-field browser test verifies an EID mask and absence of that raw value in sealed bytes. See [full baseline](../eval/reports/stage2-baseline.md) and [methodology](../eval/README.md).

Timing conditions: 10 top-viewport observations per page, balanced mode, first NEW_SCREEN then repeated captures; SAME_SCREEN still runs local DOM privacy work while omitting the outbound image. Latest medians: KYC detect 1.6 ms, policy 0.4 ms, redact 39.9 ms, seal 54 ms; zoo 4.4 / 0.6 / 48 / 77.2 ms. Fresh NEW_SCREEN sessions measured sealed sizes of 116,421 / 181,213 / 250,637 bytes for fast/balanced/accurate. These are measurements, not a performance-budget claim. See [timing report](../eval/reports/stage2-timings.md) for p95, mask-integrity cost and image contributions; tuning belongs to Stage 8.

### EID stability and action checks

| Case | Result / evidence |
| --- | --- |
| id/class rerender | PASS — real harvester unit test and Firefox dynamic page retain EID/fingerprint |
| Scroll and SPA route change | PASS — persistent header keeps EID in registry tests |
| Insert new element | PASS — existing EID retained, new key gets new EID |
| Remove then reinsert | PASS — retired EID is never reused within the session |
| Duplicate reorder or duplicate removal | PASS — uncertain match becomes ambiguous; L3+ action aborts |
| Same fingerprint in separate frames | PASS — separate EIDs; insertions in another frame do not shift ordinals |
| Independently harvested child frame | PASS — local frame zero remapped before identity assignment; text refs cannot collide with top-frame refs |
| Empty → partial sensitive input | PASS — Chromium keeps EID and changes value-free hint to mask |
| Outbound projection | PASS — builder accepts only branded projection; raw values/references and legacy marks excluded |
| Unknown/stale state token | PASS — whole plan rejected; only latest sealed mapping retained |
| NEW_SCREEN during batch | PASS — remaining actions dropped; same-screen field A mutation permits field B |
| Token mismatch / forbidden placement | PASS — abort batch; no select/key/URL restoration; consented origin and matching type required |

### Schema v1 → v2

| Area | v2 change |
| --- | --- |
| Protocol | `schema: "aegis/2"`; required opaque `state_token` echoed by responses |
| Elements | `eid` replaces numeric marks; action target is `{eid, fp}`; redactions can carry EID |
| Empty fields | Optional value-free `field_hints` with category and empty fill state |
| Response | Exactly one of `plan`, `answer`, `extract`, `request_context`; bounded `plan_steps` only on first response |
| Verification | Structured nonempty `expect`; `done` requires structured evidence |
| Context requests | Reason and kind only; no element/region identifiers |
| Enforcement | Closed schemas and action-specific fields; precompiled CSP-safe validators; Pydantic mirrors agree on 55 positive/negative cases |
| Transport | Existing `POST /v1/plan` route retained; envelope version and contracts are v2; digest verification remains |

### Authority classifier tests

The classifier suite has **55 tests**: 30 base-table rows, 23 English/Hindi commit-label rows and 2 additional assertions.

| Level | Base-table rows | Representative coverage |
| --- | ---: | --- |
| L0 | 5 | wait, scroll, ask_user, done, fail |
| L1 | 4 | same/cross-origin links and navigation; cross-origin requires user |
| L2 | 8 | checkbox/radio/switch/tab/combobox, non-sensitive select, hover, non-Enter key |
| L3 | 3 | email/high-risk type and token-bearing select classification |
| L4 | 2 | password field and password token, always user-required |
| L5 | 8 | implicit submit button, submit/image input, formaction, Enter, download, ambiguous/unknown form button |

The 23 extra label rows all resolve to L5, including Hindi. The two remaining tests cover a high-risk grant never weakening L5 and token-bearing URLs being flagged for rejection. Classification does not authorize restoration: token-bearing select is rejected by action checking even though its authority classification is L3. Additional plan/action tests enforce ambiguity, visibility, hit testing, disabled controls and token/category mismatches.

## 4. Generated manifests

Full JSON from the production output, both MV3.

### Chrome

```json
{
  "manifest_version": 3,
  "name": "Aegis",
  "description": "Aegis — a privacy-preserving browser vision agent. Redacts PII locally before any page data leaves the browser.",
  "version": "0.1.0",
  "action": {
    "default_title": "Aegis"
  },
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "http://localhost/*"
  ],
  "optional_host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### Firefox

```json
{
  "manifest_version": 3,
  "name": "Aegis",
  "description": "Aegis — a privacy-preserving browser vision agent. Redacts PII locally before any page data leaves the browser.",
  "version": "0.1.0",
  "action": {
    "default_title": "Aegis"
  },
  "permissions": [
    "activeTab",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "http://localhost/*"
  ],
  "optional_host_permissions": [
    "<all_urls>"
  ],
  "browser_specific_settings": {
    "gecko": {
      "id": "aegis@sih26171.local",
      "strict_min_version": "140.0",
      "data_collection_permissions": {
        "required": [
          "websiteContent"
        ]
      }
    }
  },
  "background": {
    "scripts": [
      "background.js"
    ]
  },
  "sidebar_action": {
    "default_panel": "sidepanel.html",
    "default_title": "Aegis"
  }
}
```

## 5. Browser and manual verification

Firefox 156.0, geckodriver 0.37.1, Selenium 4.49.0. Selenium installed the temporary add-on into a fresh profile with the **unmodified** manifest. Classic WebDriver/BiDi do not expose the actual auxiliary sidebar as a normal tab, so the harness uses Firefox's existing Marionette actor via geckodriver `--allow-system-access`. Native toolbar and permission controls are clicked; app code and permissions are not patched. Checks inspect raw values/pixels within the browser and report booleans/counts.

| Firefox item | Result | Notes |
| --- | --- | --- |
| Sidebar page loads | PASS | Firefox 156.0; unmodified MV3 manifest |
| Manifest permissions and on-demand injection | PASS | {"initialAll": false, "mv": 3, "noContentScripts": true} |
| Scoped permission capture rejected | PASS | Missing activeTab permission |
| action.onClicked toggles sidebar | PASS | Closed then opened by native toolbar clicks |
| activeTab-only capture after toolbar click | PASS | Succeeded without all_urls grant |
| permissions.request from sidebar: Deny | PASS | Native permission dialog; trusted Observe click |
| permissions.request from sidebar: Allow; Observe KYC marks | PASS | {"noValueText": true, "passwordNotRead": true, "roles": true} |
| OffscreenCanvas export + non-extractable HMAC | PASS | {"nonExtractable": true, "png": "image/png", "signatureBytes": 32, "webp": "image/webp"} |
| Privacy Preview seals KYC with zero known raw values | PASS | Exact sealed bytes inspected locally |
| Sidebar lifetime | PASS | Close/reopen destroys prior document and in-memory session result |
| Element.openOrClosedShadowRoot | PASS | 1 closed-shadow controls found |
| Frame mapping | PASS | {"framed": 2, "methods": ["top", "same-origin", "src-size-match"], "unmapped": 0} |
| Dynamic rerender and duplicate ordinals | PASS | {"duplicates": true, "eid": true, "fp": true} |
| Dynamic modal NEW_SCREEN | PASS | dialog-appeared |
| Hidden controls and covered button | PASS | {"all": true, "covered": true, "off": true} |
| Overlay capture hygiene | PASS | {"clean": true, "overlayRestored": true} |
| Rapid capture throttle | PASS | 4 concurrent Observe requests completed |
| Screenshot alignment at 100% | PASS | 1 visible calibration squares |
| Screenshot alignment at 125% | PASS | 1 visible calibration squares |
| Screenshot alignment at 67% | PASS | 2 visible calibration squares |
| Screenshot alignment at 100% scrolled | PASS | 1 visible calibration squares |

All eight requested capability areas were exercised: capture permission, sidebar permission request, action-driven sidebar toggle, closed shadow root, OffscreenCanvas exports, non-extractable HMAC, frame mapping and sidebar document lifetime. Closing/reopening destroys the document sentinel and old session result; the vault/key live only in that document's memory. The test does not inspect a garbage collector or persisted key material.

Chromium loaded a temporary extension test copy, exercised observation/privacy/schema-v2 send, and sampled calibration pixels at 100%, 125%, 67% and after scroll. Known synthetic raw values are absent from inspected sealed bytes; planted tokens, secrets, side channels, stale span fallback and opaque media have separate tests. This does not prove detection of arbitrary unlabelled PII or every pixel on arbitrary pages.

**Remaining human check:** Chrome's native optional-permission bubble. Load `extension/.output/chrome-mv3` unpacked in `chrome://extensions`, open `http://localhost:5174/kyc.html`, open Aegis, click Observe yourself and press Allow. The Chromium harness pre-grants the permission in its test copy, so it cannot certify this path. Firefox's real Allow/Deny path is automated and verified. Optional human visual checks for overlay edges, permission wording and toolbar placement are documented in [the Firefox checklist](manual-test-firefox.md); center/border sampling is not a whole-screen visual review.

Replay/trace recording stays off. No new screenshot recording was added; historical Stage 2 screenshots remain unchanged. The server LLM adapter, action loop, executor, consent UI and perception models were not implemented in this stage.

## 6. Deviations and reasons

- All six new identifier rules require labels because their shapes overlap ordinary data. Passport and driving-licence lexical forms could not be established as universal; broad label-required detection is explicitly documented instead of claiming official validity. [Authoritative sources and limits](identifier-sources.md) are linked in rule comments.
- Enter is conservatively L5 even when local form context is missing; unknown form-button intent also stays L5. This avoids silently treating a possible commit as harmless.
- Removed an old unstructured delta field from the payload contract; Stage 8 will define text deltas under a constrained schema.
- Retained the HTTP `/v1/plan` route while upgrading the message contracts to v2, avoiding an unnecessary transport-route migration.
- Added conservative recognition of already-vaulted values when they reappear without labels, closed a firewall image-slot bypass, and removed the legacy select-restoration exception. These were necessary to preserve the existing privacy invariants during migration; their false-positive cost is reported.
- The debug overlay now uses registry-issued EIDs too. Only the existing privacy preview is wired to the new shared foundations; action control remains pure until Stage 3 and context expansion until Stage 8.
- Frame composition now assigns the router's frame identity consistently to element/media/text records. The final browser run exposed the previous local-frame-zero mismatch after ordinal grouping became frame-specific.

## 7. Known issues and warnings

- Latest baseline: 4 FPs and 1 FN, with the measurement exclusions and run variation described above. No held-out generalization or deck benchmark is claimed; Stage 4 owns held-out evaluation.
- Firefox web-ext warnings: Android minimum version 140 versus data-collection-permission support at 142, and two `innerHTML` warnings in bundled React. No application-source `innerHTML`/`dangerouslySetInnerHTML` usage was found outside tests. The desktop target tested here is Firefox 156.
- Running Mozilla's validator on the Chrome manifest reports two Firefox-specific errors (missing background-scripts fallback and Gecko add-on ID), plus unsupported `sidePanel`, missing Firefox data-collection metadata, and two bundled React warnings. Chrome's MV3 service worker/side panel are intentional; the Firefox manifest supplies its own background scripts/sidebar/Gecko metadata. This Chrome-on-Mozilla lint run is not reported as passing.
- Pytest emits two dependency deprecations: Starlette's httpx test-client integration and the anyio BlockingPortal alias. Browser tooling also reports the existing NO_COLOR/FORCE_COLOR conflict.
- PNG and DOM privacy work remain relatively costly; SAME_SCREEN currently avoids outbound image bytes, not all local redaction work. Stage 8 owns caching/encoding budgets.
- No vision/OCR/NER, autonomous execution, consent UI or replay implementation exists yet. A closed audit vocabulary prevents free-text retention; the future executor must append only those bounded records.
- Chrome's native Allow click remains the explicit human check above. Firefox visual UX checks are optional follow-up, not claims of completed manual inspection.

## 8. Questions for the next stage

No unanswered question blocks Stage 2.5. The consent and recovery decisions are recorded: per-site/per-task grants; medium group; separate high-risk and credential rows; expiry at task end; every L5 asks; mismatch aborts the batch, re-observes and counts toward stuck detection.

Stage 3 should confirm the chosen local/open-weight model endpoint and model identifier before wiring the currently stubbed adapter. Implement Privacy SoM, planner, authority/consent wiring, executor, verifier and recovery under the v2 contracts; leave context-expansion integration and tuning for Stage 8.
