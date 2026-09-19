# Aegis — Build stages (architecture v6)

Current stage: **3B, complete** (checkpointed, then Part II: carry-overs, remaining demo scenarios,
the malicious-scenario matrix re-run through the full agent loop, a Firefox core-flow pass, and
task-level evaluation numbers — see `eval/reports/stage3-tasks.md` and the STAGE REPORT). Stage 4
is next and has not started. Implement one stage at a time; future implementation is a throwing
`TODO(stage-N)` stub where a silent default could be unsafe. Every stage adds tests and requires
`pnpm check`, browser checks and a stage report. Architecture describes intended interfaces, not
claims that later-stage modules are already implemented.

**Deliberate reordering (2026-09-18): Stage 4 deferred, not skipped or cancelled.** A narrow slice
of Stage 5 — local face detection only, "Stage 5A" — is pulled forward ahead of Stage 4. Reason:
the SIH26171 idea-submission deadline is two weeks out, and "a client-side vision model running in
the browser that evaluates the current screen state" is the problem statement's first named
deliverable. Stage 4 (held-out splits, impossible tasks, false-success rate) improves the rigor of
numbers we already have; Stage 5A produces a capability the deck needs that does not exist yet.
Stage 4 remains next in line once Stage 5A closes. The rest of the Stage 5-9 plan below is
unchanged and unrenumbered — Stage 5A is a subset of Stage 5's scope (face detection only; coarse
form-state classification and the remaining Stage 5 scope are still pending), not a new stage.

| Stage | Scope |
| --- | --- |
| 0 | Foundations: WXT MV3 Chrome/Firefox, contracts, mock server, demo portal, enforcement |
| 1 | Observation: DOM/shadow/frames, fingerprints, screenshots, change detection, input watcher |
| 2 | Privacy core: local cascade, policy, vault, redactor, side-channel sanitizer, firewall, preview |
| 2.5 | Firefox bring-up; architecture v6; Stage 2 fixes; Scene Graph/EIDs; state tokens and schema v2; pure stale-plan/action checks and authority classifier; context-expansion function; audit/replay policy; linkability state; sensing skeleton |
| 3A | Stage 2.5 follow-ups (occlusion signal, search-form Enter, display-only tokens); Privacy Set-of-Marks; server reasoning adapter with prompt/validation/repair/session store; deterministic mock scenarios; model probe |
| **3B** | **Consent and credential UI; planner client; agent loop; reacquisition; re-hydration; executor; verifier; recovery; approvals; answer display; step timeline; first end-to-end demo tasks; login.html; the full malicious-scenario matrix and Firefox core flows through the real agent loop; task-level evaluation against both the mock adapter and a live local model** |
| 4 | Page factory v2; three held-out splits; impossible tasks; false-success rate; replay in eval mode only |
| 5 | Privacy detector with coarse classes; empty/partial/full forms |
| 6 | OCR + fusion + UI detector loaded only when needed + image-only mode |
| 7 | NER + linkability tuning |
| 8 | Adaptive sensing consolidation; element budget + request_context wiring; caching; resolution/encoding tuning; WebGPU/WASM |
| 9 | Hardening; attack tests; consent UX polish; Judge Mode polish |

Stage 3A did **not** implement the agent loop, executor, consent UI or credential UI — those are
3B, now done. Vision, OCR and NER are still 5-7, not started. 3A delivered everything the loop
calls into: marks on the sanitized image, a real model adapter behind `/v1/plan`, the prompt and
compact scene, deterministic mock scenarios (including adversarial ones with a recorded blocking
layer), and a probe that measures a candidate model against this pipeline rather than against a
paper.

Consent is per origin and task: one pre-checked medium group, separate high-risk category grants,
a credential row, and expiry at task end. L5 always asks each time. Mismatch aborts the remaining
batch, re-observes/replans and counts toward the loop/stuck detector. No skip-to-submit behavior.
