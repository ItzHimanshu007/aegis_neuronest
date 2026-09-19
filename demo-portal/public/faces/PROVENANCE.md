# Synthetic face images — provenance (Stage 5A)

Every face pictured under this directory is **AI-generated (StyleGAN) — nobody real**, composited
here for the local face detector's demo/eval set. No real person, ID document or card is
represented. This mirrors `pii-zoo.html`'s own top-of-page badge convention for the rest of the
demo portal's synthetic PII.

## Source images (unmodified originals, not shipped here)

Two public-domain, StyleGAN-generated portrait photos from Wikimedia Commons — Wikimedia's own
category is literally "images of people who do not exist" (the site's convention for
AI-generated faces with no real identity), and both are tagged **Public domain**:

- `File:This_Person_Does_Not_Exist_example.jpg` —
  <https://commons.wikimedia.org/wiki/File:This_Person_Does_Not_Exist_example.jpg>
- `File:GAN_Mensch_StyleGAN2.png` —
  <https://commons.wikimedia.org/wiki/File:GAN_Mensch_StyleGAN2.png>

## Derived files in this directory

| File | Derived from | How |
| --- | --- | --- |
| `profile-photo.jpg` | `This_Person_Does_Not_Exist_example.jpg` | Cropped/resized to 260x260, re-encoded JPEG q85. |
| `id-card.png` | `GAN_Mensch_StyleGAN2.png` | Face cropped to a 110x140 photo box, composited onto a purely synthetic SVG-drawn "SPECIMEN IDENTITY CARD" background (drawn for this project — the card layout, all card text and the "FICTIONAL PERSON" name/DOB/ID/address are fabricated, not derived from any real document). |
| `partial-face-small.png` | `This_Person_Does_Not_Exist_example.jpg` | A narrow 260x340 slice through one side of the face, downsized to 48x64 — deliberately partial/small, for the detector's small-sample honesty check (see `eval/reports/stage5-face.md`). |
| `control-no-face.png` | Nothing photographic | Purely procedural SVG shapes (circle/square/triangle), drawn for this project. Zero photographic content — the false-positive control. |

Regenerate with `demo-portal/scripts/make-face-assets.mjs` if the source images or crop boxes
change (requires `sharp`; not a `pnpm check` dependency — this is a one-off asset generator, run
manually, matching `docs/policy.yaml`'s own "generated, committed" convention for the derived
files, not the generator).
