# Aegis — Build Stages

One stage at a time. **Do not work ahead** — see rule 10 in [`../AGENTS.md`](../AGENTS.md).
Code that belongs to a later stage is left as a `TODO(stage-N)` stub.
Every stage adds tests, and a stage is only done when `pnpm check` passes.

| Stage | Name | Goal |
| ----: | ---- | ---- |
| 0 | Foundations | Repo, contracts, shells, rules |
| 1 | Observe | See the page |
| 2 | Privacy core | Never leak |
| 3 | First end-to-end loop | Actually do something |
| 4 | Judge Mode + eval | Prove it |
| 5 | Vision I | Local eyes |
| 6 | Vision II | Fusion and occlusion |
| 7 | Detection depth | Catch the hard PII |
| 8 | Performance | Make it fast and cheap |
| 9 | Hardening + demo | Ship it |

---

## Stage 0 — Foundations

Repository layout, pnpm workspace, WXT extension shell building MV3 for Chrome **and** Firefox,
FastAPI server skeleton with a `MockAdapter`, JSON Schema contracts with generated TS types and
mirrored Pydantic models, the demo portal, and the invariants in `AGENTS.md`.
No agent logic, no ML, no PII code.

## Stage 1 — Observe

The Set-of-Marks harvester: number interactive elements, compute stable fingerprints, collect text
rectangles and visibility, detect screen change, capture screenshots on change only, capture side
channels, and watch user input. Screen-state JSON is produced but still never leaves the browser.

**Delivered:** `extension/observe/` — harvester (DOM walk incl. open *and* closed shadow roots,
candidate/media classification, AccName roles+names, visibility with `visibilityReason` and
`hitOk` hit-testing, text blocks, salted cyrb53 fingerprints with duplicate ordinals), frame
composition (same-origin recursion; cross-origin via FRAME_HELLO size match, else
`iframe-unmapped`), capture pipeline (settle wait, state-token retry, capture throttle +
coalescing queue, scale mapping), NEW_SCREEN/SAME_SCREEN detector with dHash fallback, closed-shadow
debug overlay (hidden for every capture), and a debounced input watcher that reports only
`{fp, hasValue, valueLenBucket}`. All of it is branded `LocalOnly<T>` and provably cannot reach
`net/network.ts`. Also landed the Stage 0 fix-ups F1–F5 (toolbar action, least-privilege
permissions with on-demand injection, accurate Firefox data-collection declaration, the
`credential` policy class, and `shared/config.ts`).

## Stage 2 — Privacy core

The real `firewall.seal()`, the HMAC token vault with a non-extractable session key, the policy
engine reading `policy.yaml`, the redactor (solid fill / face blur), the side-channel sanitizer, and
token-like-string neutralization. Fail-closed verification: if anything is uncertain, nothing ships.
Heavy adversarial unit tests.

## Stage 3 — First end-to-end loop

The agent loop end to end on the demo KYC form: seal → send → plan → validate → approve → reacquire →
re-hydrate → execute → `expect` check → repeat. Real `OpenAICompatibleAdapter` on the server, with
JSON-schema-constrained output.

## Stage 4 — Judge Mode + eval

Judge Mode shows the exact payload leaving the browser next to the original screen. The `eval/`
harness lands: `page_factory`, `labeler`, `metrics`, `leakage_test`, `bench`, `pareto`. Leakage tests
become part of `pnpm check`.

## Stage 5 — Vision I

ONNX Runtime Web in a side-panel worker, WebGPU with a WASM fallback. The unified UI detector reads
the screen from pixels alone. Image-only mode for canvas / PDF / video.

## Stage 6 — Vision II

Sensitive visual classes — face, ID document, card, signature, QR. DOM–vision IoU fusion, occlusion
checking, and OCR restricted to detector-only regions. A synthetic face lands in the demo portal.

## Stage 7 — Detection depth

Checksums (Luhn, Verhoeff, PAN, IFSC, UPI), field-context label pairing, lazily loaded NER, OCR span
detection, and the quasi-identifier rule (tokenize a quasi-identifier only when an identity item is
present on the same screen).

## Stage 8 — Performance

The text delta path for same-screen updates, the verdict cache, Fast/Balanced/Accurate mode tuning,
static prompt prefix caching on the server, model quantization, and the latency/resource budget
enforced by `bench`.

## Stage 9 — Hardening + demo

Prompt-injection resistance, stale-UI handling, permission and consent UX, `web-ext lint` clean,
packaging for both stores, the demo script, and the final report against the judging metrics.
