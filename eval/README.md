# eval

The harness itself is Stage 4 work (see docs/STAGES.md). What exists today is `reports/`, written
by the Playwright specs that already measure things:

- `reports/stage2-baseline.md` — per-category precision and recall for the DOM-only detection
  cascade against `demo-portal/pii-zoo.html`'s `data-gt` ground truth. This is the floor Stages 6
  (vision) and 7 (OCR/NER) have to beat. Regenerate with
  `pnpm --filter aegis-extension exec playwright test e2e/baseline.spec.ts`.
- `reports/stage2-timings.md` — pipeline stage timings and sealed payload sizes per capture mode.
  Regenerate with `... playwright test e2e/privacy-timings.spec.ts`.
- `reports/screenshots/` — a raw-vs-redacted capture pair, showing exactly what `seal()` accepted.

Detectors are forbidden from reading `data-gt`; `extension/privacy/detect/__tests__/dataGtGuard.test.ts`
fails the build if any detection source file so much as mentions it.

The rest is the planned shape for the Stage 4 harness:

- `page_factory/` — generates synthetic pages/screens with known PII and known ground-truth
  elements, for reproducible evaluation without touching real user data.
- `labeler/` — tooling to hand-label or review ground truth for a captured page.
- `metrics/` — computes the five judging metrics: visual context accuracy, PII detection
  recall/precision, redaction precision, client resource use, end-to-end latency
  (see docs/architecture.md "Judging metrics").
- `leakage_test/` — adversarial tests asserting that no raw PII ever appears in a `SanitizedPayload`.
  Becomes a blocking part of `pnpm check` starting Stage 4.
- `bench/` — latency and resource benchmarking harness across Fast/Balanced/Accurate modes.
- `pareto/` — plots accuracy-vs-latency and accuracy-vs-resource-use tradeoff curves across modes
  and configurations, to support the Stage 8 performance work.
