# eval

## Baseline v2 labelling and measurement

A value beside a label naming a sensitive type is **positive**, even when its checksum fails: it
may be a user typo of a real identifier. A truly **unlabelled** near-miss is negative. The zoo
includes 32 unlabelled catalogue/prose/table negatives plus two planted token-string negatives.
The cascade never reads these annotations. The mapped iframe is evaluated through its contents,
not falsely labelled as an opaque unscanned container.

Baseline v2 uses annotation-index matching with geometry and normalized text spans, not a
category-count estimate of true positives. Repeated captures and repeated detector sources are
deduplicated per annotation/category. Only annotated regions enter precision/recall; side-channel
leakage has separate tests. The linkability comparison replays the same measured detections through
the pure policy with K=3 enabled/disabled, leaving identity-seen enabled in both. It reports both
detector precision (unchanged by policy) and protection precision. The authored page is not a
generalization benchmark or a deck claim. Held-out splits arrived in Stage 4 — see
`page_factory/` and `reports/stage4-heldout.md`.


`page_factory/` (Stage 4) generates the held-out corpus. Everything else in the planned harness
below is still Stage 4+ work (see docs/STAGES.md). What exists today:

- `reports/stage2-baseline.md` — per-category precision and recall for the DOM-only detection
  cascade against `demo-portal/pii-zoo.html`'s `data-gt` ground truth. This is the floor Stages 5–7
  (vision/OCR/NER) have to beat. Regenerate with
  `pnpm --filter aegis-extension exec playwright test e2e/baseline.spec.ts`.
- `reports/stage2-timings.md` — pipeline stage timings and sealed payload sizes per capture mode.
  Regenerate with `... playwright test e2e/privacy-timings.spec.ts`.
- `reports/stage4-heldout.md` — per-category precision and recall for the same cascade against
  the HELD-OUT generated corpus, beside the authored baseline with the delta in percentage points,
  plus the false-success rate on impossible tasks. Regenerate with `pnpm eval:heldout`
  (`reports/stage2-baseline.json` is a machine-readable sidecar the held-out spec reads to build
  the authored column).
- `reports/screenshots/` — historical Stage 2 synthetic artifacts. Stage 2.5 does not write new
  screenshot or trace recordings; Stage 4 adds explicit local Eval recording with expiry.
- `page_factory/` — **exists (Stage 4).** Generates synthetic portal pages with automatically
  derived ground truth, plus impossible-task sets, split into a committed TRAIN corpus and a
  sealed, gitignored, never-inspected HELD-OUT corpus. See `page_factory/README.md` for the split
  contract and the enforcement. Run with `pnpm pagegen -- --split train|heldout`.
- `replay/` — recorded eval bundles (synthetic pages only, screenshot pixels stripped) that
  `extension/eval/replay.ts` rescores in Node with no browser. Gitignored output.

Detectors are forbidden from reading `data-gt`; `extension/privacy/detect/__tests__/dataGtGuard.test.ts`
fails the build if any detection source file so much as mentions it.

The rest is still the planned shape:

- `labeler/` — tooling to hand-label or review ground truth for a captured page. Stage 4's page
  factory derives ground truth from the generator instead, so this is only needed for corpora that
  were not generated (i.e. real captured pages).
- `metrics/` — computes the five judging metrics: visual context accuracy, PII detection
  recall/precision, redaction precision, client resource use, end-to-end latency
  (see docs/architecture.md "Judging metrics").
- `leakage_test/` — adversarial tests asserting that no raw PII ever appears in a `SanitizedPayload`.
  Becomes a blocking part of `pnpm check` starting Stage 4.
- `bench/` — latency and resource benchmarking harness across Fast/Balanced/Accurate modes.
- `pareto/` — plots accuracy-vs-latency and accuracy-vs-resource-use tradeoff curves across modes
  and configurations, to support the Stage 8 performance work.
