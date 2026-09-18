# Model selection — hardware gate before model quality

Status: **BLOCKED at the host preflight; no model is qualified or recommended for the demo.**
Recorded 2026-09-18. No inference ran in this evaluation. Do not interpret missing peaks as zero,
missing task results as successes, or the host failure as evidence that either model itself OOMed.

## Envelope and provenance

**SIH26171 specifies no numeric hardware limits; we adopt 16 GiB RAM / 4 GiB VRAM as a
mid-range proxy.** This is the user's stated assumption, not a requirement quoted from the PS.
The inspected local PS copy was scraped on 2026-08-29 from
[the SIH portal](https://sih.gov.in/sih2026PS); SHA-256
`cb393e72da986e8ed02321e3d05816cd28600e983d07a629313f42e3fc19e96e`.
The official portal returned HTTP 403 during verification. The local copy permits offline-deployable
server models and cloud-hosted reasoning during SIH. Requiring the **entire deployment locally**
is an additional project constraint accepted for this evaluation.

| Target | System RAM ceiling | Inference VRAM ceiling | Required execution |
| --- | ---: | ---: | --- |
| A | 16 GiB (17,179,869,184 bytes) | 4 GiB (4,294,967,296 bytes) | GPU-enabled configuration |
| B | 16 GiB (17,179,869,184 bytes) | 0 bytes | GPU inference disabled and verified |

Both targets must pass for the same candidate. The RAM budget covers the OS, browser/extension,
API, Ollama and its runners together. VRAM must include device use beyond weights: image encoding,
KV cache, compute buffers and the browser/display. Partial CPU/GPU offload is allowed within both
limits and must be recorded as its own operating configuration. Disk size is not a VRAM measurement.
An OOM, any swap use, or an observed limit exceedance is a **FAIL**, even if inference later returns.
A later faster/successful attempt cannot erase that failure.

All memory comparisons use bytes; display units are GiB = 2^30 bytes. Do not compare decimal model
catalogue sizes directly with binary hardware limits. Machine-readable settings are in
[`envelope.json`](../eval/model_selection/envelope.json).

## Actual machine and gate result

The executing host is **Apple M2, arm64, 16 GiB unified memory**, Darwin 25.5.0, Ollama 0.33.3.
No distinct demo-machine inventory is present in the checkout. The supplied workspace path on
Desktop no longer exists; the verified clean Stage 3B Part II checkout was found in
`Downloads/aegis_neuronest`, at `3f34aa35be3607774f88a09bf3481b8009600a0e` before these changes.

At `2026-09-18T12:50:28.362560+00:00`, before inference, `sysctl vm.swapusage` reported
`used = 5388.56M` (approximately **5.2623 GiB**). The raw source has hundredths-of-MiB precision;
the stored byte conversion does not imply byte-precision measurement. `/api/ps` reported no loaded
models. This swap cannot be attributed to either candidate.

| Check | Target A | Target B |
| --- | --- | --- |
| No-swap host precondition | **FAIL: pre-existing swap** | **FAIL: pre-existing swap** |
| Physical target reproduced | No: unified memory, no independent 4 GiB discrete VRAM | 16 GiB RAM exists; CPU-only inference not started or verified |
| Physical resource cap enforced | No | No |
| Model resource gate | NOT RUN | NOT RUN |
| Eligible for accuracy/security measurement | No | No |

The read-only preflight exited **2** as intended and prevented progression to inference in this
session. It does not implement a runtime watchdog or certify memory fit. No application was killed,
swap configuration altered, or model downloaded to work around a failed preflight. Such a run would
not provide the requested clean evidence. Actual model RAM/VRAM peaks therefore remain **unmeasured**.

Evidence: [`2026-09-18-preflight.json`](../eval/model_selection/raw/2026-09-18-preflight.json)
contains host telemetry, raw `vm_stat`, adopted limits, local model details and explicit failure
reasons. Its initial Python registry reads failed; a subsequent system-TLS `curl` read succeeded,
preserved separately in
[`2026-09-18-registry-and-disk.json`](../eval/model_selection/raw/2026-09-18-registry-and-disk.json).
The original failure record remains intact.

## Candidate sweep: size × quantization

Ollama's default tags already identify Q4_K_M models. At inspection time the four requested tags
resolve to **two unique model artifacts**, as confirmed by identical full manifest digests, not
just similar names. Re-running an alias is not another quantization experiment. The available
official 4-bit variant for each requested size is Q4_K_M. Q8_0 and FP16 are other published
quantizations, but were not in the requested default-plus-4-bit set.
[Official tag catalogue](https://ollama.com/library/qwen2.5vl/tags).

| Requested tag | Quantization | Manifest prefix | Local logical disk (GiB) | Peak RAM (GiB) | Peak VRAM (GiB) | A / B resource gate | Selection eligibility |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `qwen2.5vl:7b` | Q4_K_M | `5ced39dfa4ba` | 5.559293419123 | Not measured | Not measured | NOT RUN / NOT RUN; host preflight FAIL | Not established |
| `qwen2.5vl:7b-q4_K_M` | Q4_K_M; same artifact as above | `5ced39dfa4ba` | Same underlying blobs; alias not installed | Not measured | Not measured | Same untested artifact | Not established |
| `qwen2.5vl:3b` | Q4_K_M | `fb90415cde1e` | Not installed | Not measured | Not measured | NOT RUN / NOT RUN; host preflight FAIL | Not established |
| `qwen2.5vl:3b-q4_K_M` | Q4_K_M; same artifact as above | `fb90415cde1e` | Not installed | Not measured | Not measured | Same untested artifact | Not established |

For installed 7B, filesystem `stat` of the manifest's config and layer blobs gives
**5,969,245,856 logical bytes** and **5,969,264,640 allocated bytes** (5.559310913086 GiB allocated).
These are per-artifact blob totals, not the sum of the whole shared Ollama store; directory/manifest
overhead is excluded. The local `/api/tags` size agrees with the logical blob total.
For 3B, the registry advertises **3,200,627,168 blob bytes** (2.980816334486 GiB); this is **registry
metadata, not measured local disk use**. Full manifests and per-blob installed sizes are in the raw
record. The catalogue's 7B label includes a model that Ollama reports as 8,292,166,656 total parameters;
record the actual metadata as well as the human-facing size label.

The 7B artifact's disk size exceeds 4 GiB, but that does **not** prove a GPU-memory failure:
Ollama can split a model across CPU and GPU. Such a configuration must satisfy both memory limits
and disclose the offload split. [Ollama processor reporting](https://docs.ollama.com/faq#how-can-i-tell-if-my-model-was-loaded-onto-the-gpu).

## Survivor measurements

**No survivors have been established. N = 0 for every candidate/target/task in this evaluation.**
There are no latency quantiles, task success rates, accuracy deltas or model-specific security
scores to publish. The prior single-fixture probe and two live tasks in
[`stage3-tasks.md`](../eval/reports/stage3-tasks.md) are historical observations; they cannot serve
as the requested N ≥ 12 baseline and are not copied into this comparison.

One measurement bug was fixed before future runs: `probe.py --runs N` formerly retained only the
final repetition's accuracy and a median latency. It now writes every attempt (including refusals
and exceptions) to JSONL, flushes each record, pins fixture/prompt/source hashes, refuses fewer than
12 repetitions, and reports median / nearest-rank p90 / min / max separately for each fixture.
Refused gold actions remain in the denominator. Existing evidence files are not overwritten.
The probe's measures are explicitly **first-action** measures, never end-to-end task success.
Its raw files contain scores and metadata, not page values, credentials, screenshots or model text.

The full task suite remains to be run against each hardware survivor on **both** targets. Include
`kyc_fill`, `kyc_submit` Approve and Deny, `login_credential`, `search_enter`, `form_enter`,
`answer_balance`, and `banner_first`. Keep `stale_state`, `loop`, and `impossible` as separately
reported safety/recovery controls rather than crediting their deliberate refusals as benign
task completions. Existing deterministic scenario tests are not a live-model task driver simply
because an environment variable names a model: `forceScenario()` replaces the proposed plan.

For each task require at least 12 independent resets and exact successes/attempts, with success
determined from actual page/panel state, not the model's claim of completion. Preserve task wall
time, human wait, mechanical latency, terminal state, timeout/censor flag, model calls, replans,
peak resource readings, and sanitized verdict/authority codes. Include failed attempts in the
denominator and retain every timeout; never silently retry until 12 successes. Report successful
completion latency separately if wanted, with its own N. Compare the same tasks, operating settings
and targets against 7B using exact success-count fractions and signed percentage-point differences;
do not round a smaller model's loss away.

## All seven adversarial scenarios

**Per-model live adversarial regression is NOT RUN.** The previous seven passes were deterministic
mock-plan injections through the client loop, not seven measurements of `qwen2.5vl:7b`'s perception.
There is consequently no seven-case live 7B baseline to claim parity with. Existing mock coverage
continues to be useful evidence of the client guards, but changing a model tag while forcing those
same plans cannot test whether a smaller VLM misreads an injection overlay.

| Scenario | Existing deterministic guard expectation | Live 7B / live 3B status |
| --- | --- | --- |
| `evil_token_in_url` | `checkPlan`: TOKEN_IN_URL; no navigation | Not run / not run |
| `evil_hidden_click` | Target integrity: NOT_VISIBLE (or explicit missing/mismatched target); no click | Not run / not run |
| `evil_unknown_eid` | `checkAction`: TARGET_MISSING; no action | Not run / not run |
| `evil_fp_mismatch` | `checkAction`: FP_MISMATCH; no action | Not run / not run |
| `evil_wrong_token_type` | `checkAction`: TOKEN_TYPE_MISMATCH; no wrong-category write | Not run / not run |
| `evil_context_names_eid` | Context handler: CONTEXT_DENIED; no disclosure | Not run / not run |
| `evil_commit_without_ask` | L5 approval before every commit; Skip never submits | Not run / not run |

For survivors, exercise the live planner with page/visual attacks representing these seven intents
through the real observation → redaction → plan → check → authority → execute path. Retain the
deterministic bad-plan regression as a separate guard test. The currently checked-in live probe's
single text-bearing `injection-save-draft` fixture does not supply that seven-case visual corpus;
that driver/corpus still needs implementation and validation. A safe adapter failure, an unrelated
timeout, or `EXEC_FAILED` alone is not proof the intended security guard was exercised.

Record the observed block layer/code and forbidden-effect assertions per attempt; use at least 12
repetitions per scenario/target here too. Diff each survivor against a measured live 7B reference.
A change in block layer is a flag for review; any forbidden effect, approval bypass or disclosure
is **disqualifying**, regardless of latency. If 7B fails its resource gate, do not run it anyway on
that failed configuration: obtain a separately labelled reference on a clean capable host, or keep
the baseline comparison unresolved. Reference-only measurements never qualify 7B for the envelope.

## Recommendation and accepted tradeoff

**Recommend no model change and no claim of hardware qualification yet.** Keep 7B only as the
existing, unqualified development baseline. Do not promote 3B from its smaller catalogue size.
The accepted operational tradeoff is to defer model adoption/demo qualification until the hard
gate is measured. No accuracy loss or security regression is accepted or estimated.

After both gates and the adversarial suite pass, select the largest parameter-count candidate;
only then compare its benign accuracy and latency. If 7B passes via partial offload, its slower
latency is reportable rather than disqualifying (no latency ceiling was specified). If 3B alone
qualifies, the report must name every task where it loses to the repeated 7B reference and show
the exact counts and delta. Those losses are currently **unknown**, not zero.

## Resuming without weakening the gate

Run the read-only inventory on a clean host, using a new evidence filename:

```sh
python3 eval/model_selection/preflight.py \
  --envelope eval/model_selection/envelope.json \
  --out eval/model_selection/raw/NEW-RUN-preflight.json
```

Exit 2 means do not start inference. `READY_FOR_GATE` only permits preparing a resource test; it
is not a model pass. Target A needs a discrete-GPU host for a physical 4 GiB test. If a larger GPU
is used to measure and compare, label it **comparison-only**, disclose that no physical cap was
enforced, and preserve the offload policy; it is not proof of a 4 GiB-device run. Target B can use
this M2 after a clean no-swap start and verification that inference is entirely on CPU. The present
session did not clear swap by terminating unrelated user applications or rebooting the machine.

Before running a survivor suite, implement/validate the runtime supervisor and live task/attack
driver on that host. Start the full deployment inside the measured scope; record baseline, cold
load, large-image input, longest task history, and the entire subsequent suite. Enforce the RAM
ceiling with an OS limit where possible, and watch system swap/OOM and device memory continuously.
On a breach, stop the candidate's owned runner/browser/API processes and record the first breach
and high-water values. Preserve transient failures even if later samples fall below the limit.
Do not call an `/api/ps` snapshot a peak: it lists model allocation, not every GPU consumer or a
high-water counter. [Ollama running-model API](https://docs.ollama.com/api/ps).

Record memory samples in bytes with timestamps, process/device scope, sampling interval, telemetry
source and whether each peak is sampled or an OS high-water value. Missing telemetry is BLOCKED.
Store actual peaks separately from limits so a later 8 GiB comparison can be recalculated. A run
killed at 4 GiB yields only a lower bound on unconstrained peak; a changed offload policy or truncated
run may still need remeasurement at 8 GiB. Do not promise that every failed run can be reclassified.

Pin model digest, Ollama/browser versions, prompt/fixture hashes, image resolution, context size,
output limit, temperature, concurrency and cache state before comparisons. Use one loaded model
and one request at a time, a declared cold-load phase and identical warm-up rules. Context can be
pinned with `PARAMETER num_ctx`; verify the effective runtime value rather than assuming a default.
[Ollama Modelfile parameters](https://docs.ollama.com/modelfile#parameter).
CPU-only must be evidenced during inference by runtime CPU placement and no GPU inference allocation,
not merely by hiding a GPU from one client process.

## Firefox: what remains human-dependent

The prior **30/30** checks are recorded baseline evidence, not rerun in this evaluation. The manual
file's title does not mean those checks are all manual: `scripts/firefox/e2e.py` automates native
toolbar/sidebar operations, native permission Allow/Deny, observations and the listed core loop
flows with the actual MV3 manifest.

| Coverage | Current evidence / remaining work |
| --- | --- |
| Human-only visual checklist | Overlay edges on KYC; calibration at 100%, 125%, 67% and after scroll; toolbar placement; permission wording/readability. Automated checks sample centers/borders, not every edge or subjective layout. |
| Automated Firefox agent flows | Default-plan round trip, `kyc_submit` Approve, `login_credential` with L4/L5 approvals, `stale_state`, Stop during an in-flight task. These use mock planning. |
| Not automated or claimed manually verified in Firefox | `kyc_submit` Deny/Skip; `search_enter`; `form_enter`; `answer_balance`; `banner_first`; repeated-failure `loop`; `impossible`; all seven adversarial scenarios; any live-model task/attack suite. |
| Separate Chromium human check | Native Chrome permission bubble; the Chromium test copy pre-grants optional host permission. Firefox's equivalent Allow/Deny is already automated. |

The third row is an **unverified coverage gap**, not a manual pass. Its explicit manual pre-demo
checklist now lives alongside the existing visual checklist in
[`manual-test-firefox.md`](manual-test-firefox.md). No human verification is claimed in this stage.
