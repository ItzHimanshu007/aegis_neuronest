# STAGE REPORT — Model selection (hardware preflight blocked)

## 1. Summary

- Adopted the user-specified proxy: A = 16 GiB RAM / 4 GiB VRAM; B = 16 GiB RAM, CPU-only.
- Verified that the local SIH26171 copy specifies no numeric limits; the assumption is explicit.
- Found the clean Stage 3B Part II checkout in Downloads, at commit `3f34aa3`.
- Measured host inventory: Apple M2, 16 GiB unified memory, existing swap approximately 5.2623 GiB.
- Both host preflights FAIL the no-swap requirement; A additionally lacks a separate VRAM envelope.
- Recorded model manifests, full digests, exact local 7B blob sizes and raw host telemetry in the repo.
- Verified that default 7B/3B tags alias their Q4_K_M variants: two distinct artifacts, not four.
- Fixed repetition accounting in the supplementary probe, with raw per-attempt data and 13 regression tests.
- Audited Firefox human-only checks and unverified flows; neither is represented as a new automated pass.
- **Model selection remains blocked:** no inference, model peaks, survivor task results or live adversarial results.

## 2. File tree (depth 3)

Tracked files only; node_modules/.venv/dist and generated build outputs excluded. Directories with
files below depth 3 are shown only to that depth. The two raw evidence files are under
`eval/model_selection/raw/`.

```text
.gitignore
.nvmrc
AGENTS.md
CLAUDE.md
README.md
demo-portal/
  calibration.html
  dynamic.html
  frame-form.html
  frames.html
  hidden.html
  index.html
  injection.html
  kyc.html
  login.html
  package.json
  pii-zoo.html
  search.html
  shadow.html
  src/
    dynamic.ts
    kyc.ts
    login.ts
    pii-zoo.ts
    shadow.ts
    style.css
  vite.alt.config.ts
  vite.config.ts
docs/
  STAGE-2.5-REPORT.md
  STAGE-3B-CHECKPOINT-REPORT.md
  STAGE-3B-PART-II-REPORT.md
  STAGE-MODEL-SELECTION-REPORT.md
  STAGES.md
  architecture.md
  identifier-sources.md
  manual-test-firefox.md
  model-selection.md
  policy.yaml
  threat_model.md
eslint.config.ts
eval/
  README.md
  model_probe/
    README.md
    fixtures
    probe.py
  model_selection/
    envelope.json
    preflight.py
    raw
  reports/
    firefox-stage2.5.json
    model-probe-mock.md
    model-probe-qwen2.5vl-7b-json-schema.md
    model-probe-qwen2.5vl-7b.md
    model-probe-qwen3-vl-4b.md
    screenshots
    stage2-baseline.md
    stage2-timings.md
    stage3-tasks.md
extension/
  .env.example
  agent/
    __tests__
    approval.ts
    checks.ts
    executor.ts
    reacquire.ts
    recovery.ts
    rehydrate.ts
    runAgentLoop.ts
    validator.ts
    verifier.ts
  agentHost/
    index.ts
    session.ts
    task
  audit/
    __tests__
    log.ts
    replay.ts
  authority/
    __tests__
    index.ts
  e2e/
    agent-authority.spec.ts
    agent-malicious.spec.ts
    agent-scenarios.spec.ts
    agent-stop.spec.ts
    baseline.spec.ts
    calibration.spec.ts
    dynamic.spec.ts
    fixtures
    frames.spec.ts
    hidden.spec.ts
    kyc.spec.ts
    occlusion.spec.ts
    overlay-and-throttle.spec.ts
    privacy-timings.spec.ts
    privacy.spec.ts
    probe-fixtures.spec.ts
    scene.spec.ts
    shadow.spec.ts
    smoke.spec.ts
    som.spec.ts
    task-kyc.spec.ts
    timings.spec.ts
    webp-pixel-identity.spec.ts
  entrypoints/
    background.ts
    content.ts
    sidepanel
  models/
    README.md
  net/
    __tests__
    network.ts
  observe/
    __tests__
    accessibleName.ts
    blockAncestor.ts
    captureAdapter.ts
    change.ts
    classify.ts
    compose.ts
    dhash.ts
    diff.ts
    fingerprint.ts
    frames.ts
    harvester.ts
    inputWatcher.ts
    overlay.ts
    rateLimiter.ts
    settle.ts
    spanRects.ts
    types.ts
    typingState.ts
    visibility.ts
  package.json
  perception/
    README.md
  playwright.config.ts
  privacy/
    __tests__
    categoryTypes.ts
    detect
    firewall.ts
    generated
    payloadBuilder.ts
    policy.ts
    policyData.ts
    redactor.ts
    rules
    sealedRegistry.ts
    sideChannels.ts
    som.ts
    vault.ts
  scene/
    __tests__
    index.ts
    registry.ts
    stateTokens.ts
    types.ts
  sensing/
    __tests__
    contextExpansion.ts
    index.ts
  shared/
    config.ts
    messages.ts
    permissions.ts
    schema
  tsconfig.json
  vitest.config.ts
  wxt.config.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/
  firefox/
    e2e.py
  gen-policy.mjs
  gen-types.mjs
  gen-validator.mjs
  print-manifests.mjs
  validate-fixtures.mjs
server/
  .env.example
  .python-version
  app/
    __init__.py
    api
    config.py
    main.py
    prompts
    schemas
    session_store.py
    vlm
  pyproject.toml
  tests/
    __init__.py
    conftest.py
    test_adapter.py
    test_health.py
    test_mock_scenarios.py
    test_model_selection.py
    test_plan.py
    test_prompts.py
    test_schema_agreement.py
    test_session_store.py
  uv.lock
shared/
  schema/
    agreement-cases.json
    examples
    payload.v2.schema.json
    plan.v2.schema.json
```

## 3. Commands run and results

Dependencies were already installed. No install or model pull was performed.

```text
python3 eval/model_selection/preflight.py --envelope eval/model_selection/envelope.json \
  --registry --out eval/model_selection/raw/2026-09-18-preflight.json
  exit 2 (expected gate refusal)
  A: FAIL / PREEXISTING_SWAP; blocker NO_SEPARATE_VRAM_ENVELOPE
  B: FAIL / PREEXISTING_SWAP
  model_fit: NOT_MEASURED; inference_started: false

curl --fail --silent --show-error --max-time 20 \
  https://registry.ollama.ai/v2/library/qwen2.5vl/manifests/<tag>
  exit 0 for 7b, 7b-q4_K_M, 3b, 3b-q4_K_M
  full JSON manifests plus SHA-256 and local blob stat sizes saved to
  eval/model_selection/raw/2026-09-18-registry-and-disk.json

uv run --project server pytest server/tests/test_model_selection.py -q
  13 passed, 2 warnings

AEGIS_IGNORE_ENV_FILE=1 AEGIS_ADAPTER=mock uv run --project server python \
  eval/model_probe/probe.py --runs 12 --out /private/tmp/aegis-model-selection/probe-smoke.md
  exit 0; checked 120 JSONL records = 10 fixtures x 12 attempts; metadata live=false
  synthetic serialization check only, never a candidate measurement; outputs kept outside the repo

pnpm check
  schema fixture validation: PASS
  TypeScript: PASS
  ESLint: PASS
  Test Files  45 passed (45)
       Tests  925 passed (925)
  Ruff: All checks passed! / 30 files already formatted
  pytest: 183 passed, 2 warnings

pnpm build
  Chrome production build: PASS
  Firefox production build: PASS

pnpm --filter aegis-extension exec web-ext lint --source-dir .output/firefox-mv3
  errors 0; notices 0; warnings 3; exit 0

git diff --check
  PASS
```

The initial `web-ext lint` invocation also targeted the Chrome output. Mozilla's Firefox validator
rejected Chrome-only service_worker/sidePanel and absence of a Gecko ID (2 errors, 4 warnings);
that was an inappropriate browser target, not evidence of a new extension regression. The correct
Firefox-target lint then passed with the warnings below. No manifest was changed to appease the
wrong validator.

Initial Python registry requests returned URLError; system-TLS curl succeeded without disabling
TLS verification. Both the original failure and successful metadata retrieval are retained.

The new tests cover p90 nearest-rank calculation, even median, too-small/invalid samples, preservation
of all repetitions, refusals in accuracy denominators, timed exceptions, duplicate/missing repetition
IDs, pre-existing swap, missing telemetry and the unified-memory distinction. Mock-only test results
are not hardware or VLM evidence.

No browser E2E suites were rerun: the extension/server implementation did not change, and live
inference was stopped at preflight. **61/61 Chromium and 30/30 Firefox remain inherited Stage 3B
Part II results**, not new measurements in this stage. The local build outputs were regenerated.

## 4. Generated manifests (full JSON)

Chrome:

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

Firefox:

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

## 5. Manual verification

Read-only host/Ollama inventory and filesystem model sizes were verified directly. No browser
interaction, subjective visual review or native permission prompt was manually exercised.

Firefox's remaining human-only items are overlay edges (KYC and calibration at 100%/125%/67% and
scroll), toolbar/sidebar appearance and permission wording. Native Firefox Allow/Deny is already
automated. The explicit unverified checklist additionally lists KYC Deny, search/form Enter,
answer display, banner dismissal, loop/impossible recovery, all seven attacks and all live-model
flows. These are missing coverage, not claimed manual passes. See
[`manual-test-firefox.md`](manual-test-firefox.md#coverage-audit-for-model-selection-2026-09-18).

## 6. Deviations from the requested evaluation and reasons

1. The full hardware sweep could not start. The only verified host already uses swap and cannot
   reproduce separate 4 GiB VRAM. Under the requested hard gate, running inference and calling it
   merely slow would be invalid. Existing swap is a host failure, not an attributable model OOM.
2. No peak RAM/VRAM figures are supplied: no candidate inference ran. Disk size is not substituted
   for peak memory. The 3B size is registry metadata; only 7B has measured local blob sizes.
3. No N >= 12 live task runs or per-model adversarial matrix were run because no candidate qualified.
   Historical single observations are not reused or promoted to repeated measurements.
4. No model recommendation or accuracy loss is asserted. Both candidates remain unqualified; the
   existing 7B development baseline is unchanged. See [`model-selection.md`](model-selection.md).
5. The existing seven-case browser matrix forces mock plans, so it cannot serve as a measured live
   7B visual-injection baseline. The live attack driver/corpus and runtime resource supervisor still
   need implementation/validation on a suitable host. The delivered script is a read-only preflight,
   not a completed benchmark orchestrator.
6. The supplementary first-action probe was fixed because its previous repetition loop discarded
   all but the last accuracy result. This is useful preparation, not a substitute for task evaluation.

## 7. Known issues / warnings

- No candidate is qualified for target A or B. This stage is **blocked**, not complete.
- On this M2, CPU-only testing requires a clean no-swap session; separate target-A VRAM evidence
  requires a discrete GPU with working telemetry. A larger device permits a labelled comparison,
  not a claim that a physical 4 GiB constraint was enforced.
- Metadata size/quantization aliases are resolved, but context, offload and cache settings have not
  been run through the resource gate. A limit change cannot reclassify an unrun or truncated test
  into a pass without further evidence.
- The existing client malicious tests tolerate an unrelated EXEC_FAILED in some scenarios; that
  alone must not count as a live model security pass.
- Firefox lint: one Android minimum-version/data_collection_permissions compatibility warning and
  two bundled-code UNSAFE_VAR_ASSIGNMENT warnings. No extension source changed in this stage.
- pytest: existing Starlette/httpx and anyio BlockingPortal deprecation warnings (2).

## 8. Next required inputs / work

The numeric envelope is resolved; there is no outstanding question about its values. No distinct
demo machine was identified. Resume on a clean no-swap evaluation host with target-A GPU telemetry;
record whether that machine is the actual demo device. Do not terminate unrelated user applications
or reboot to manufacture a clean host during an unattended evaluation.

Then implement/validate continuous resource monitoring and termination, run both candidate artifacts
through both gates, and measure only survivors through the complete task and live attack suites.
Keep actual peaks, any breach, every attempted task and baseline differences auditable. Select the
largest model only after both hardware gates and all security checks pass. Stage 4 remains unstarted.

Incremental commits before this report:

- `56ede0c` — hardware preflight/raw inventory, per-run probe accounting, regression tests.
- `6266eff` — model-selection report and Firefox coverage audit.
