# models

ONNX model files for local vision detectors. Not exposed here directly — the actual bundled bytes
live under `extension/public/models/` (WXT's public-asset convention, so they ship in the packed
extension and are reachable via `browser.runtime.getURL(...)`); this directory's README describes
what's there.

- `extension/public/models/face-yunet/` — Stage 5A's face detector (YuNet, MIT licence). See
  `SOURCE.md` in that directory for exact model/source/licence/size, and
  `eval/reports/stage5-face.md` for measurements. Loaded by
  `extension/perception/faceModel.ts` via `extension/net/network.ts`'s `loadBundledAsset()`.

OCR and NER models (TODO(stage-6)/(stage-7)) are not yet added. Models are bundled or cached
locally; never fetched as remote code at runtime (AGENTS.md invariant 7).
