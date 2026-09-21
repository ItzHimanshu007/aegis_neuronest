# Labelled masks (semantic obfuscation) — implementation and measurement

Drawing a typed label inside each mask, so the sanitized IMAGE says what the sanitized TEXT already
says. SIH26171 names this "semantic obfuscation" as an accepted sanitization method.

Flag: `AEGIS_CONFIG.MASK_LABELS_ENABLED`. Panel toggle: **Labelled masks**, beside *Element ID
marks*. The default is decided by the measurement in this document, not by the idea.

---

## What a label can say

A closed vocabulary of exactly four forms, and nothing else:

| Form | Example | When |
| --- | --- | --- |
| Category only | `[AADHAAR]`, `[PASSWORD]` | a blocked value, or a tokenized one with no room |
| Category + token ID | `[IFSC#xd24wee3]` | a tokenized value — the ID is the one in the text payload |
| Unscanned media | `[IMAGE — not checked]` | media nothing scanned |
| Face | `[FACE]` | a chip on top of the irreversible blur; the blur is untouched |

`privacy/maskLabel.ts` is the only producer. It takes a `Category` and a token — there is no
parameter a raw value could arrive through — and every string it returns is re-checked against
`MASK_LABEL_PATTERN` before it is returned.

The token ID is the **full 8 characters**, not the 6 in the original brief's `[EMAIL#k3f9qa]`
sketch. A 6-character prefix would name something no field of the payload contains, which defeats
the purpose: `[IFSC#xd24wee3]` on the image and `[[PII:IFSC:xd24wee3]]` in the text are character
for character the same identifier, and that is verified in the fixtures. (`k3f9qa` is also not a
legal ID — `9` is not in base32's `a-z2-7`.)

### The three hard constraints

1. **Nothing page-derived can reach a label.** A category outside the 38-name set yields no label; a
   token that is not exactly token-shaped, or whose own type segment disagrees with the mask's
   category, is dropped and the label degrades to category-only.
   `privacy/__tests__/maskLabel.test.ts` attacks both parameters with raw values, injection strings,
   forged tokens, 4096-character inputs and control characters, and asserts that **no
   three-character fragment of any of them** reaches the output (11 tests).
2. **Size and position come from the box, never the value.** Font size is
   `min(floor(height * 0.6), 18)`. Because every token ID is a fixed 8 characters, two values of the
   same category always produce the same label length — a test asserts the label length is a
   function of the category alone across every category.
3. **A label never overflows.** Fitting steps down through the vocabulary — full label, then
   category-only, then nothing — and never truncates, because a truncated string is not in the
   vocabulary. Measured in pixels at three box widths (300px fits the full label, 90px forces the
   step down, 24px fits neither): ink outside the mask box is **0 pixels** in all three.
4. **Contrast survives the downscale.** White on black, measured on the sealed PNG after the
   balanced-mode downscale and the PNG round trip: an unlabelled mask band is flat fill
   (max luminance < 40), a labelled one spans < 40 to > 150.

`seal()` re-checks all of this independently on the labels actually drawn, because the firewall
assumes the layer above it is buggy: a label must match the pattern, and a label naming a token must
name one the vault **issued** and one the **payload already carries**. That last clause is what
makes the label add no information to the payload as a whole.

---

## Before / after

Sealed image, `kyc.html`, balanced mode:

| | |
| --- | --- |
| Unlabelled | `mask-labels/kyc-fill-name-unlabelled.png` |
| Labelled | `mask-labels/kyc-fill-name-labelled.png` |

Sealed image, `pii-zoo.html` (34 redactions, the densest page):

| | |
| --- | --- |
| Unlabelled | `mask-labels/zoo-answer-unlabelled.png` |
| Labelled | `mask-labels/zoo-answer-labelled.png` |

Privacy receipt, side-by-side "on your screen" vs "sent to the server":

| | |
| --- | --- |
| Unlabelled | `mask-labels/receipt-unlabelled.png`, `mask-labels/receipt-images-unlabelled.png` |
| Labelled | `mask-labels/receipt-labelled.png`, `mask-labels/receipt-images-labelled.png` |

Regenerate with `pnpm --filter aegis-extension evidence:screenshots`.

One placement finding, visible in the first screenshots taken: a `FILL_REGION` label centred in its
box gets its middle painted out by the face blur drawn on top of it afterwards, leaving the legible
fragment `[I` … `]`. Region labels are now captioned near the top of the box instead — a function of
the mask kind and the box, so constraint 2 still holds — and placed one font-size down from the
edge so they stay clear of the row `verifyMasks()`'s ring check samples. The ring check was not
relaxed to make room.
