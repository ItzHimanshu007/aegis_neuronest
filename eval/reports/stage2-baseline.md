# Stage 2 baseline v2 — exact annotated instances

**Definition:** a value labelled with a sensitive type is positive even when its checksum fails (probable typo). Unlabelled near-misses are negatives.

Measured 2026-09-17T13:14:10.348Z on Chromium 153.0.8010.12, balanced mode, DOM-only cascade: 93 annotations (59 positives, 34 negatives), 12 overlapping viewport captures of the synthetic pii-zoo.html. No vision, OCR or NER.

Matching uses target EID geometry for fields/media, and block geometry plus exact normalized span/value containment for text. Each (annotation index, category) is counted once across captures. A wrong category is both an FP for that category and an FN for the expected one; detections outside annotated regions are excluded. Side channels are tested separately by leakage tests. There is no category-count TP proxy.

| Category | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| AADHAAR | 6 | 0 | 0 | 1.000 | 1.000 |
| ABHA | 1 | 0 | 0 | 1.000 | 1.000 |
| ADDRESS | 1 | 0 | 0 | 1.000 | 1.000 |
| BANK_ACCOUNT | 1 | 0 | 0 | 1.000 | 1.000 |
| CARD_NUMBER | 5 | 0 | 0 | 1.000 | 1.000 |
| CITY | 1 | 0 | 0 | 1.000 | 1.000 |
| CVV | 1 | 0 | 0 | 1.000 | 1.000 |
| DOB | 1 | 0 | 0 | 1.000 | 1.000 |
| DRIVING_LICENCE | 1 | 0 | 0 | 1.000 | 1.000 |
| EMAIL | 6 | 0 | 0 | 1.000 | 1.000 |
| EMPLOYER | 1 | 0 | 0 | 1.000 | 1.000 |
| FINANCIAL_VALUE | 1 | 0 | 0 | 1.000 | 1.000 |
| HEALTH | 1 | 0 | 0 | 1.000 | 1.000 |
| IFSC | 3 | 1 | 0 | 0.750 | 1.000 |
| NAME | 4 | 0 | 0 | 1.000 | 1.000 |
| OTP | 1 | 0 | 0 | 1.000 | 1.000 |
| PAN | 2 | 0 | 0 | 1.000 | 1.000 |
| PASSPORT | 1 | 0 | 0 | 1.000 | 1.000 |
| PASSWORD | 1 | 0 | 0 | 1.000 | 1.000 |
| PHONE | 4 | 0 | 0 | 1.000 | 1.000 |
| PIN_CODE | 2 | 0 | 0 | 1.000 | 1.000 |
| PRIVATE_GENERIC | 3 | 0 | 0 | 1.000 | 1.000 |
| SECRET | 3 | 0 | 0 | 1.000 | 1.000 |
| TRACKING_ID | 1 | 2 | 0 | 0.333 | 1.000 |
| UAN | 1 | 0 | 0 | 1.000 | 1.000 |
| UNSCANNED_MEDIA | 2 | 0 | 0 | 1.000 | 1.000 |
| UPI_ID | 1 | 0 | 0 | 1.000 | 1.000 |
| VEHICLE_REG | 2 | 0 | 0 | 1.000 | 1.000 |
| VOTER_ID | 1 | 0 | 0 | 1.000 | 1.000 |
| **Overall** | 59 | 3 | 0 | 0.952 | 1.000 |

## Linkability ablation

The identical measured detection stream is replayed through the pure policy with necessity=not_needed, no user overrides, a fresh per-origin session and K=3. The identity-seen rule stays enabled in both arms. Linkability changes protection decisions, not detector labels.

| Rule | Detection precision | Protection TP | Protection FP | Protection FN | Protection precision |
| --- | ---: | ---: | ---: | ---: | ---: |
| Without linkability | 0.952 | 59 | 3 | 0 | 0.952 |
| With linkability (K=3) | 0.952 | 59 | 3 | 0 | 0.952 |

0 per-capture policy decisions changed. This corpus exposes identity data before the quasi categories, so the existing identity rule already protects them. The quasi-only threshold, origin isolation and session reset are covered separately by unit tests; this ablation does not claim an improvement where none was measured.

## Errors and limits

- Annotation 33: expected NONE; detected IFSC.
- Annotation 54: expected NONE; detected TRACKING_ID.
- Annotation 55: expected NONE; detected TRACKING_ID.

Negative-region IFSC/tracking detections arise from earlier vaulted strings or their numeric substrings reappearing in unlabelled catalogue values. The session conservatively protects these known values; the annotation rule still counts them as false positives. Any additional category within an annotated value, including CITY within ADDRESS, also counts as an FP under this single-category ground truth. The Stage 2.5 run carried one false negative, a `<th>Account holder</th><td>Asha Verma</td>` row. Stage 3A traced it to the label dictionary rather than to the viewport: "account holder" matched no phrase at all, so the row header supplied no category and the labelled-value fallback never fired. Adding the account-holder/cardholder/beneficiary phrases to NAME closed it.

The mapped iframe container has no UNSCANNED_MEDIA annotation: its contents are observed separately. Canvas and image are annotated as unscanned media. This authored-page result is not a generalization claim and must not be used as a deck benchmark; Stage 4 introduces held-out splits. Off-annotation false positives and free-prose names/addresses remain outside this measurement.
