# Page factory v2 (Stage 4)

Generates synthetic portal pages with **automatically derived** ground truth, so PII detection can
be measured on pages the cascade was never tuned against.

Every value on every generated page is fabricated. No real person, account, card or document is
represented.

## Why this exists

Every accuracy number in this repo before Stage 4 was measured on `demo-portal/pii-zoo.html` — a
page this project wrote, with 90-odd `data-gt` attributes this project placed by hand.
`eval/reports/stage2-baseline.md` says so in its own text. Two distinct problems:

- **Annotator bias.** The same people who wrote the detector decided what counted as a positive.
- **Instance memorisation.** The detector's label dictionary was extended over time while looking
  at that page. `stage2-baseline.md` records one such episode explicitly: a `<th>Account holder</th>`
  row was a false negative until "account holder" was added to the NAME phrases.

This factory removes both. Ground truth is derived from the generator's own data structures rather
than annotated, and the held-out split is generated but never read.

## Usage

```
python3 eval/page_factory/generate.py --split train                    # 12 pages, committed
python3 eval/page_factory/generate.py --split heldout --write-seal     # 24 pages, NOT committed
python3 eval/page_factory/generate.py --split heldout --verify-seal    # reproduce + check hashes
```

Pages land in `demo-portal/generated/<split>/` and are served by the existing Vite dev server at
`/generated/<split>/<page>.html` (`pnpm portal`, port 5174). They are deliberately **not** added to
`demo-portal/vite.config.ts`'s `rollupOptions.input`: they are evaluation-only and must not ship in
`pnpm portal:build`.

No third-party dependency. Runs on the stdlib under `server/.venv`, which is what lets
`server/tests/test_page_factory.py` import it during `pnpm check`.

## Ground truth is derived, not annotated

Every template builds a list of `Record(category, value, element_id, label, idiom, ...)` **first**,
then renders HTML from those records. Page and label therefore come from one source and cannot
disagree. Each page is emitted with three artifacts:

| Artifact | Contents |
| --- | --- |
| `<template>-<seed>.html` | the page, with `data-gt="CATEGORY"` on value-bearing elements and `data-face-gt` on images |
| `<template>-<seed>.manifest.json` | the same records out of band: category, value, label, idiom, autocomplete hint, section |
| `<template>-<seed>.tasks.json` | task instructions whose outcome is known by construction (see below) |

`server/tests/test_page_factory.py` asserts the HTML and the manifest agree on every element, in
both directions, for both splits.

`data-gt` reuses the attribute the Stage 2 baseline already scores, so `extension/e2e/baseline.spec.ts`'s
proven matching machinery works unchanged. `extension/privacy/detect/__tests__/dataGtGuard.test.ts`
already forbids any detector source from reading it.

## What the factory may plant, and what it may not

Of the 38 categories in `extension/privacy/categoryTypes.ts`, only those the DOM-only cascade can
actually produce are planted as `data-gt` positives. **`PHOTO`, `ID_DOCUMENT`, `CARD_IMAGE`,
`SIGNATURE` and `QR` are excluded**: no rule, autocomplete token or label-dictionary entry emits
them today, so planting them would manufacture guaranteed false negatives and report a known,
documented coverage gap as a generalization failure. Faces use the separate `data-face-gt`
namespace, for the same reason `pii-zoo.html` gives in its own body.

Negatives follow the labelling rule already stated in `eval/README.md` — *a value beside a label
naming a sensitive type is positive even when its checksum fails; a truly unlabelled near-miss is
negative*. They are rejection-sampled against two accidental collisions that would otherwise
produce unfair false positives: a 10-digit run beginning 6-9 (a well-formed mobile number) and a
12-digit Verhoeff-valid run beginning 2-9 (a well-formed Aadhaar).

## The TRAIN / HELD-OUT boundary

**TRAIN** (`demo-portal/generated/train/`, 12 pages, seeds 101-103) is committed and freely
inspectable. It is the split anyone may look at while adjusting rules.

**HELD-OUT** (`demo-portal/generated/heldout/`, 24 pages, seeds 2001-2006) is **gitignored and never
committed**. Three mechanisms enforce the boundary, none of which is a promise:

1. **Not in the repo.** `test_heldout_pages_are_not_tracked_by_git` fails if
   `git ls-files demo-portal/generated/heldout` returns anything. Nobody can read the corpus by
   browsing the repository; it exists only on a machine that has generated it.
2. **Sealed.** `heldout-seal.json` records the sha256 of all 73 artifacts plus the sha256 of all
   four generator sources and the seeds. Generation is deterministic in `(split, template, seed)`,
   so `--verify-seal` reproduces the corpus byte-for-byte and fails on any drift. This is what
   stops a held-out corpus being quietly regenerated after someone has seen the results — and it
   works: it caught a `ruff format` pass over the generator sources during development.
3. **Disjoint wording, identical distribution.** `wording.py` holds one phrase bank per category and
   assigns each phrase by `sha256(phrase)[0] % 2`. Train and held-out therefore draw disjoint
   phrases from the same distribution. Tuning against train cannot memorise a phrase held-out uses,
   and held-out is not made artificially harder by being handed a different vocabulary.

### The methodology point that matters most

The phrases in `wording.py` were written from domain knowledge of real Indian bank, KYC, telecom and
e-commerce forms, **deliberately without first reading `extension/privacy/detect/labels.ts`**. Had
the bank been written with the detector's dictionary open, it would have been tuned either to pass
or to fail. Written blind, the hit rate on label-dependent categories is an honest sample of how
well the dictionary covers wording it was not built against.

**Some of these phrases will not be recognised. That is the measurement, not a bug**, and it must
not be "fixed" by adding the missed phrases to the dictionary.

## Impossible tasks

`<page>.tasks.json` carries instructions whose outcome is known by construction, because the factory
knows exactly which categories each page carries and how many times each appears:

| Kind | Derivation |
| --- | --- |
| `missing-field` | names a category no element on the page carries |
| `never-supplied-value` | names a real field, but no value for it exists in task data or on the page |
| `ambiguous` | names a category carried by two or more elements, with nothing to disambiguate |
| `possible` (control) | names a category carried by exactly one visible element |

The `possible` control is not optional. A system that refuses everything scores a perfect
false-success rate while being useless, so the completion rate on genuinely possible tasks has to be
reported beside it.

## Honest limits

- The generator was written by this project. Held-out pages are **unseen**, not **independent**:
  this removes annotator bias and instance memorisation, but not the shared-authorship prior. It is
  not a claim about real-world sites.
- Face assets are the same four synthetic images Stage 5A used, recomposited at different sizes and
  positions. That varies geometry, **not identity**.
- Value variety does not test much: NAME/ADDRESS/EMPLOYER/CITY detection in this cascade is
  label-driven, not value-driven. The label wording is the variable that matters, and it is the one
  the split partitions.
