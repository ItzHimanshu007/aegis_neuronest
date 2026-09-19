# Stage 5A — local face detection

Measured 2026-09-18 on this development machine: Apple Silicon (arm64), macOS 26.5 (build 25F71).
Chromium numbers via Playwright 1.63.0's bundled Chromium 153.0.8010.12, production `wxt build`
(`pnpm build`, not a dev server). Firefox numbers via Firefox 156.0 / geckodriver 0.37.1
(`scripts/firefox/e2e.py`), also a production `wxt build --browser firefox`. Both against the
**mock** server adapter — this stage does not touch the live-model path. All numbers below are
read directly from a test run in this session; none are estimated. Where a number could not be
measured honestly, this file says so rather than inferring one (AGENTS.md invariant 17).

---

## 1. Model

| | |
| --- | --- |
| Model | YuNet (anchor-free multi-scale CNN face detector), `face_detection_yunet_2026may.onnx` |
| Source | [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo), `models/face_detection_yunet/face_detection_yunet_2026may.onnx`, fetched 2026-09-18 |
| Licence | MIT, Copyright (c) 2020 Shiqi Yu — `extension/public/models/face-yunet/LICENSE` (copied verbatim from the same opencv_zoo path) |
| File size on disk | **229,738 bytes** (≈224 KiB) |
| Integrity | SHA-256 `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0`, verified against the Git LFS object's own recorded `oid` for this path at download time |
| Why this variant | `face_detection_yunet_2023mar.onnx` (the "default" file in that folder) has a **fixed static input shape** — verified empirically: it fails with "invalid dimensions" when run at 320x320 or 240x320 through plain ONNX Runtime. `2026may` re-exports the same weights with symbolic H/W dims and is opencv_zoo's own documented variant for "the ONNX Runtime engine" (as opposed to OpenCV's DNN module) — exactly the engine this project uses. No second candidate was needed; this one worked on the first real attempt once the shape issue was diagnosed. |
| Postprocessing | The ONNX graph exposes only raw per-stride `cls`/`obj`/`bbox`/`kps` heads (OpenCV's convenience `cv.FaceDetectorYN` wrapper does the score/box decode internally in C++, which isn't available to an OpenCV-free, ONNX-Runtime-only pipeline). `extension/perception/faceModel.ts`'s `decodeYuNet()` reimplements that decode faithfully from OpenCV's own C++ reference (`opencv/opencv`, `modules/objdetect/src/face_detect.cpp`, `FaceDetectorYNImpl::postProcess`, Apache-2.0): score = `sqrt(cls · obj)` (both already sigmoid outputs), box center/size from `bbox` via the stride-relative formula in that file, then greedy IoU NMS. Confidence/NMS thresholds (0.6 / 0.3) are YuNet's own reference-demo defaults (`opencv_zoo`'s `yunet.py`), not invented here. |

Full provenance detail, including why the `2023mar`/`int8bq` variants weren't used, is in
`extension/public/models/face-yunet/SOURCE.md`.

## 2. Runtime

- `onnxruntime-web` **1.30.0**, WASM execution provider only (`onnxruntime-web/wasm` subpath —
  excludes the WebGPU/WebGL backends from the JS bundle). No optional faster WebGPU path was
  wired: this development machine (and the demo target) can't be assumed to have WebGPU, and the
  stage prompt explicitly asks for WASM as the one thing that must work standalone.
- `numThreads: 1` — the side panel document is not cross-origin-isolated (no COOP/COEP headers
  set), and ORT Web's multithreaded WASM path needs `SharedArrayBuffer`, which requires that
  isolation. The one WASM binary supports both modes; single-thread is a config flag, not a
  separate artifact.
- **MV3 CSP**: Chrome's MV3 default `extension_pages` CSP (`script-src 'self'; object-src 'self'`)
  blocks WASM compilation outright (`WebAssembly.instantiate` throws `CompileError: Wasm code
  generation disallowed by embedder`) — this is MV3-specific, not a general CSP default. Fixed by
  adding `'wasm-unsafe-eval'` to `script-src` in `extension/wxt.config.ts`'s
  `content_security_policy.extension_pages`. This does **not** enable `eval`/`new Function`
  (AGENTS.md invariant 7, still enforced separately by ESLint) and does not touch any other CSP
  directive. Verified working under both browsers' generated manifests (Chrome and Firefox both
  passed the full e2e/Firefox suites with faces actually detected and blurred — see §5/§6).
- **Model loading path**: the extension does not call `fetch`/`XMLHttpRequest` directly outside
  `extension/net/network.ts` (AGENTS.md invariant 2, enforced by ESLint's `no-restricted-globals`
  everywhere else). Loading the bundled `.onnx` model bytes needed exactly that, so a fourth,
  narrowly-scoped sanctioned request — `loadBundledAsset(url)` — was added to `network.ts`,
  checked against `browser.runtime.getURL('/')` so it can never be pointed at a remote host (see
  AGENTS.md's updated invariant 2 text and `network.ts`'s own docblock). The ORT WASM binary's URL
  comes from Vite's own `?url` asset import instead (`onnxruntime-web/ort-wasm-simd-threaded.wasm?url`),
  so it ships as the ONE copy the bundler already emits, not a second manually duplicated file —
  see §4.

## 3. Where it runs (Part B)

The detector runs only on `observation.media` entries the DOM cannot already describe — `<img>`,
`<canvas>`, cross-origin unmapped frames, `<embed>`/`<object>` — never the whole screenshot, and
never a region the rest of the cascade already understands (`extension/privacy/detect/hooks.ts`'s
`visualDetect`, wired into `detect/index.ts`'s cascade as the async exception to an otherwise
synchronous pipeline — see that file's updated docblock). Regions smaller than 16 CSS px on either
side are skipped without loading anything (`AEGIS_CONFIG.FACE_DETECT_MIN_REGION_PX`).

Each detected face becomes a `Detection` with `category: 'FACE'`, `source: 'visual'`, and a target
ref `media-<i>-face-<n>` — **deliberately not** the same ref as `unscannedMedia.ts`'s whole-region
`media-<i>` detection. This is load-bearing: it keeps `merge.ts` from collapsing the two into one
decision. Without it, the merged detection's category becomes `FACE` (biometric outranks
`documents` in `merge.ts`'s risk order) and its `rects` becomes the union of both original rects —
meaning the redactor would BLUR the entire media region instead of fail-closed FILL_REGION-ing the
parts that aren't a face, weakening the existing default for content Aegis still can't see (a bug
caught and fixed during this session, before it ever shipped — see the git history for
`privacy/detect/hooks.ts`). With separate detections, the redactor draws the whole-region
FILL_REGION mask first (solid, fail-closed) and the tight face BLUR mask on top of it second,
exactly matching `docs/policy.yaml`'s own reasoning for why blur — not another solid fill — is
correct for faces ("destroys the visual context the agent needs").

A second real bug surfaced by this same design, in `privacy/redactor.ts`'s `verifyMasks()`: when a
face nearly fills its region (a close-up profile photo has almost no black margin left), the
FILL_REGION mask's own edge-ring colour-integrity check could sample a point that legitimately
falls inside the nested BLUR box — a false "not filled" failure, not a real leak. Fixed by
excluding sample points that fall inside a *different* mask's rect from the current mask's own
check (that mask's coverage is verified as a normal detection by `firewall.ts`'s coverage check
instead). Both fixes are covered by tests (`privacy/__tests__/firewall.test.ts`'s two new coverage
tests for `category: 'FACE'`/`action: 'BLUR'`, and the real end-to-end e2e/Firefox face tests below
— which failed with exactly this `mask-integrity` error before the `verifyMasks()` fix, and passed
after it).

## 4. Bundle size (Part A)

Measured by building the Chrome target (`wxt build --browser chrome`) with Stage 5A's changes
stashed out (`git stash push -u`) for "before", then restored for "after" — same commit otherwise.

| | Before | After | Added |
| --- | ---: | ---: | ---: |
| Total packed extension | 496.19 kB | 15.05 MB | **+14.55 MB** |
| `sidepanel` JS chunk (all panel code, not just Stage 5A) | 429.31 kB | 435.58–435.81 kB | +6.3–6.5 kB |
| ORT WASM binary (`assets/ort-wasm-simd-threaded-*.wasm`) | — | 14,239,897 B (14.24 MB) | new |
| Model (`models/face-yunet/face_detection_yunet_2026may.onnx`) | — | 229,738 B | new |
| Model licence/provenance text | — | ~3.5 KB | new |

The added weight is almost entirely the ORT WASM runtime binary (14.24 MB — the actual face model
is only ≈224 KiB). This is the current reality of `onnxruntime-web` 1.30.0's WASM CPU backend, not
a Stage-5A-specific inefficiency: the same single binary would be needed for any ONNX model run
through this execution provider. The 6.3–6.5 kB sidepanel JS delta covers `hooks.ts`'s new
orchestration, `perception/faceModel.ts` and `faceRegionCrop.ts`, and `network.ts`'s
`loadBundledAsset` — genuinely small, as expected for logic-only code. Identical on Firefox (same
`.output/firefox-mv3` totals, confirmed in this session's build output).

**Bytes are ships-with-the-extension bytes, not network egress** — the model and runtime are
bundled, never fetched over the network at inference time (AGENTS.md invariants 2/7).

## 5. Latency (Chromium; Part E)

Source: `extension/e2e/face-detect-timings.spec.ts`, `demo-portal/pii-zoo.html` (has all 4
face-bearing regions + the control), production build, mock adapter. "Cold" = the very first
capture in a fresh panel session (model not yet loaded — includes fetching + compiling the WASM
binary, loading the ~224 KiB model, and the first region's inference). "Warm" = every capture
after that in the same session (model already resident).

This machine was running several other things concurrently during measurement (the demo-portal
dev servers, the mock FastAPI server, and this same session's own earlier Playwright/Firefox
processes) — repeated runs showed real variance from that contention, not just normal jitter. Two
consecutive clean runs agreed closely; a third, earlier run (right after a fresh `wxt build`, isolated
from other load) was markedly faster. Both are reported rather than picking the flattering one:

| Run | Cold-start (ms) | Warm median (ms, n=14) | Warm p95 (ms) |
| --- | ---: | ---: | ---: |
| A (isolated, right after build) | 38.5 | 4.4 | 6.9 |
| B | 630.2 | 79.5 | 99.5 |
| C | 801.9 | 82.6 | 97.1 |

Runs B/C are the more representative figures for a loaded machine; run A is the more representative
figure for what the model/runtime costs in isolation. Neither is "the" number — this is exactly the
kind of measurement Stage 8 (adaptive sensing/caching consolidation) would need to budget against
properly; this session only measures what exists today.

### Per-region latency by region size (warm, run C, n=14 captures per region)

| Region (CSS size) | Model input size | Median (ms) | p95 (ms) |
| --- | --- | ---: | ---: |
| Canvas, 240×90 | 160×32 | 8.7 | 13.0 |
| `<img>` "specimen doc", 200×90 | 160×32 | 4.4 | 5.5 |
| Cross-origin iframe (unmapped fallback), ~302×92 | 160×32 | 4.4 | 9.4 |
| Profile photo, 180×180 | 160×160 | 13.3 | 19.3 |
| ID-card composite, 300×186 | 160×96 | 9.5 | 13.6 |
| Small/partial face, 48×64 | 96×128 (2x DPI capture) | 8.1 | 12.2 |

Latency scales loosely with model-input pixel area, as expected for a CNN — the 160×160 profile
photo costs roughly 2–3x the smaller 160×32 regions. The small/partial region's model input is
bigger than its CSS size suggests because the capture is taken at the browser's device pixel ratio
(2x on this machine), which matters for the recall note in §6 below.

## 6. Detection counts on the synthetic set (Part C/E)

**This set has 4 positive images and 1 negative image. That is a very small sample — these are not
generalizable recall/precision figures, only what was observed on this specific, self-authored set**
(same caveat `eval/reports/stage2-baseline.md` already states for the DOM-only cascade's own
numbers).

Images (`demo-portal/public/faces/`, provenance in `PROVENANCE.md` there): two public-domain,
StyleGAN-generated (AI, no real person) source photos from Wikimedia Commons, composited into a
profile photo, an ID-card mockup, a small/partial crop, and a canvas-drawn copy of the profile
photo; plus one purely procedural (non-photographic) control graphic.

| Image | Region kind | Result (this session's runs) |
| --- | --- | --- |
| Profile photo (180×180, whole-image face) | `<img>` | **TP**, every run, confidence 0.88–0.95 |
| ID-card composite (300×186, face in a photo box) | `<img>` | **TP**, every run, confidence ≈0.92 |
| Same profile photo, drawn into a `<canvas>` | `<canvas>` | **TP**, every run, confidence ≈0.93 |
| Small/partial face (48×64 crop, one eye/brow/part of nose) | `<img>` | **Borderline**: TP in the real extension pipeline at 2x DPI capture (confidence 0.62, just above the 0.6 threshold); **miss** in an isolated offline check at 1x-equivalent resolution (0 candidates above threshold). Genuinely on the edge, not a settled result either way. |
| Control: circle/square/triangle SVG graphic, no photographic content | `<img>` | **TN**, every run (Chromium ×2 independent test runs + Firefox): 0 false positives |

Honest summary: **3 of 4 positives detected reliably; the 4th (deliberately small/partial) is
resolution-sensitive and sits right at the threshold; 0 false positives on the one negative
tested.** No claim of general recall/precision is made or implied — see the caveat above.

## 7. Memory

**NOT MEASURED.** Peak memory during WASM inference was not captured this session (no reliable,
low-effort way to sample it from inside a Playwright/Selenium-driven browser was set up in the time
available — this is a real gap, not an oversight to gloss over). `eval/model_selection`'s existing
"NOT MEASURED" precedent for resource numbers (see `docs/deck-facts.md` §3.7) applies here too. Do
not present a memory figure for this stage in the deck.

## 8. Test coverage

- **Chromium** (`extension/e2e/face-detect.spec.ts`, 4 tests; `face-detect-timings.spec.ts`, 1
  measurement test; both pass as part of the full 66/66 `pnpm e2e` run in this session):
  face-in-`<img>` detected + `BLUR` action + irreversibility (pixel-variance drop, not just "pixels
  changed"); face-in-`<canvas>` detected; control produces zero matched detections; model does not
  load until a blind region is encountered (verified via a test-only `isFaceModelLoaded()` hook).
- **`verifyMasks()` fails closed on an uncovered face box**: covered at the unit level
  (`privacy/__tests__/firewall.test.ts`, two new tests) rather than e2e — there is no way to get a
  REAL uncovered face box through the real pipeline without bypassing the same mechanism the test
  needs to prove works, so the unit test constructs that scenario directly against the production
  `seal()` function, the same way the file's existing coverage tests for other categories already
  do.
- **Firefox** (`scripts/firefox/e2e.py`): the two required cases ported — face-in-`<img>` detected
  + blurred + irreversible (looser variance-drop bound, 0.6 vs Chromium's 0.35: real cross-browser
  canvas-resampling differences, not a weaker claim — see the script's own comment), and the
  face-free control. Both pass; full suite is 32/32 (30 previous + 2 new).
- **Real model, real inference, no mocking of the numeric pipeline**:
  `extension/perception/__tests__/faceModel.test.ts` runs the actual bundled ONNX model through
  the actual `onnxruntime-web` WASM backend (via a tiny local HTTP server standing in for
  `chrome-extension://` asset fetches — Node's `fetch` doesn't support `file://`), against two
  precomputed pixel fixtures derived from the same public-domain synthetic face photos — this is
  possible because WASM inference is genuinely pure numeric I/O, unlike the canvas-cropping half
  (`faceRegionCrop.ts`), which needs a real `OffscreenCanvas` and is covered only by the browser
  e2e suites, mirroring `privacy/redactor.ts`'s own existing test split.
- Orchestration/geometry logic (`extension/privacy/detect/__tests__/hooks.test.ts`, 11 tests):
  region gating, lazy-load gating, fail-closed behavior on decode/crop errors, and the MODEL-space
  → CSS-rect mapping math, with the model/crop layers mocked.
- `pnpm check` (952 extension Vitest tests, 183 server pytest tests, schema fixtures, typecheck,
  ESLint, ruff) passes. `pnpm e2e` (66/66) and `pnpm e2e:firefox` (32/32) pass. `pnpm build` (both
  browser targets) passes.

## 9. Side effects on existing measurements (full disclosure)

Adding face-bearing images to `demo-portal/pii-zoo.html` changed some auto-regenerated, timestamped
measurement files that scan that page:

- `eval/reports/stage2-baseline.md` (the Stage 2 DOM-only PII baseline) was at risk of corruption:
  its `[data-gt]` ground-truth scan would have counted the new FACE-labelled regions as guaranteed
  false negatives (it has no notion of vision at all) and picked up spurious FP/FN pairs from the
  new images' own `UNSCANNED_MEDIA` detections. Fixed by using a **separate** `data-face-gt`
  attribute for the new elements instead of `data-gt` — confirmed the report's numbers are
  unchanged (93 annotations, 59/34 pos/neg, TP=59/FP=3/FN=0, precision 0.952/recall 1.000, byte-for-byte identical except the timestamp and the capture count, which grew from 12 to 15 because the page is now taller).
- `eval/reports/stage2-timings.md` and its payload-size table legitimately changed: `kyc.html`'s
  own images now also run through the face detector (finding no faces — they're synthetic document
  mockups), adding real inference latency to the "detect" stage where none existed before; and
  `pii-zoo.html`'s payload is larger because it now has more image content. Both are accurate
  reflections of the current pipeline, not errors.
- `eval/model_probe/fixtures/*.json` picked up new auto-regenerated `capture_id`/timestamp fields
  from re-running `probe-fixtures.spec.ts`; no fixture content otherwise changed.

None of these needed a manual correction beyond the `data-face-gt` rename above.
