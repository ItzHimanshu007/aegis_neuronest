# Model probe — qwen/qwen3.8-27b

Endpoint `https://api.groq.com/openai/v1`; adapter `openai_compat`; prompt `3b.1`.
5 sealed fixtures; 12 attempts per fixture requested.

> First-action probe only. These are NOT end-to-end task success rates or task latencies.
> This probe does not certify the hardware envelope or the seven live adversarial flows.

## Latency per fixture

Milliseconds to return/fail, including adapter repairs and failed attempts. Timeouts are censored observations, not completed tasks. Median uses the two middle samples for even N; p90 uses nearest rank ceil(0.90*N). Do not pool different fixtures or quantiles of per-fixture medians.

| Fixture | N | Median | p90 | Min | Max | Errors | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| kyc-fill-name | 12 | 1067.2805625072215 | 1265.8559590345249 | 266.8733340105973 | 1391.10329200048 | 1 | 0 |
| kyc-fill-email | 12 | 867.9963955364656 | 1123.5971249989234 | 746.9285419792868 | 1645.0584579724818 | 0 | 0 |
| kyc-banner | 12 | 896.0193544917274 | 1566.4946250035428 | 297.9895419557579 | 2021.997750038281 | 5 | 0 |
| search-enter | 12 | 384.678812493803 | 740.7485829899088 | 221.63041698513553 | 3016.5688329725526 | 12 | 0 |
| zoo-answer | 12 | 383.40383299509995 | 899.5316670043394 | 237.03195800771937 | 2111.661541974172 | 11 | 0 |

## First-action accuracy

Exact numerators/denominators. A refused or failed call counts as a failed gold action/target, not a missing observation. Schema validity alone is not task success.

| Fixture | Schema | Token echo | Grounded | Action | Server enforcement |
| --- | ---: | ---: | ---: | ---: | ---: |
| kyc-fill-name | 11/12 | 11/11 | 0/12 | 0/12 | 11/12 |
| kyc-fill-email | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 |
| kyc-banner | 7/12 | 7/7 | 7/12 | 7/12 | 7/12 |
| search-enter | 0/12 | — | 0/12 | 0/12 | 0/12 |
| zoo-answer | 1/12 | 1/1 | — | 1/12 | 1/12 |

## Conditions and limits

- Sibling `.jsonl` records every attempted call, including errors, in execution order. Sibling `.meta.json` pins settings, source commit and fixture hashes.
- Raw per-run durations retain full precision; rates retain exact counts.
- Fixtures are sealed demo payloads, not held-out pages. Only the first action is scored.
- Warm/cache/thermal effects are not controlled by this probe. Hardware-gated selection must supervise it separately; never run it after a gate failure.
