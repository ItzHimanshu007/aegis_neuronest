# Stage 7 fixtures — label-independent detection

Twelve hand-authored pages targeting the weakness Stage 4 measured: **61 of 63 false negatives
were label-dependent**, and the detector's recall on label-dictionary categories was 0.649 against
1.000 on checksum-validated ones.

**All data here is synthetic.** Every identifier was generated to satisfy (or deliberately fail)
its own checksum; no value corresponds to a real person, account or document.

## Why this corpus exists rather than reusing the Stage 4 one

`eval/README.md` states the Stage 4 labelling rule:

> A value beside a label naming a sensitive type is **positive**, even when its checksum fails...
> A truly **unlabelled** near-miss is **negative**.

That rule cannot measure Stage 7. It defines "unlabelled" as *negative by construction*, and
detecting unlabelled sensitive values is precisely what Stage 7 is for. Scoring this stage against
it would count every success as a false positive.

**So this corpus uses a different rule, and says so openly:**

- A value is **positive** when it *is* a synthetic instance of a sensitive category — whatever
  label it carries, including none, including a misleading one.
- A value is **negative** only when it is a genuine non-identifier: a SKU, a quantity, an order
  reference, a public company name, a version string, a price in a product catalogue.

A negative here is therefore never "a real identifier with the label removed". That distinction is
the whole design: `lookalike.html` and `harmless-context.html` exist to prove the detector rejects
the near-misses rather than redacting everything numeric.

## Annotations

Reused from the existing harness so `extension/e2e/fixtures/score.ts` works unchanged:

- `data-gt="CATEGORY"` — ground truth, or `NONE` for a negative.

Two Stage 7 additions, read only by `extension/e2e/stage7.spec.ts`:

- `data-gt-label="labelled | misleading | none | random"` — what the value's label does. This is
  what splits **label-dependent** from **label-independent** recall, which is the headline number.
- `data-gt-construct="input | prose | table | list | nested | iframe | shadow"` — the page
  construct, so recall can be reported per construct. Stage 4's false negatives were concentrated
  in `prose` (31 of 63).

Detectors never read any of these; `extension/privacy/detect/__tests__/dataGtGuard.test.ts` fails
the build if a detector source file so much as mentions `data-gt`.

## Pages

| Page | What it tests |
| --- | --- |
| `labelled.html` | sensitive values with obvious labels — the control; these already worked |
| `misleading.html` | sensitive values under labels naming the *wrong* category |
| `unlabelled.html` | sensitive values with no label at all |
| `random-name.html` | sensitive values in fields with random `name`/`id` attributes |
| `table.html` | values in a table, governed by `<th scope="col">` |
| `nested.html` | values buried in deeply nested markup |
| `iframe.html` | values inside same-origin and cross-origin frames |
| `shadow.html` | values inside open and closed shadow roots |
| `lookalike.html` | non-sensitive values that resemble sensitive patterns |
| `harmless-context.html` | the same intrinsic values in a bookkeeping context |
| `multi.html` | many candidates on one page |
| `mixed.html` | sensitive and public fields interleaved |

Served by the existing portal on :5174 at `/stage7/<page>.html`. Deliberately absent from
`vite.config.ts`'s `rollupOptions.input`, like the generated corpora — these are evaluation
fixtures, not part of the shipped demo.
