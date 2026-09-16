# eval

Not implemented yet — this is the planned shape for the Stage 4 evaluation harness
(see docs/STAGES.md Stage 4).

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
