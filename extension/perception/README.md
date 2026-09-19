# perception

TODO(stage-1): Set-of-Marks harvester, text rects, fingerprints, visibility, screenshot-on-change,
side-channel capture, input watch. (Landed in earlier stages under `extension/observe/` and
`extension/privacy/som.ts` — this TODO predates that; left as-is per this repo's "implement one
stage at a time" convention rather than retroactively edited.)

**Stage 5A (done): local face detection.** `faceModel.ts` — ONNX Runtime Web (WASM execution
provider), the bundled YuNet model's session lifecycle (lazy-load, idle-unload), preprocessing and
decode/NMS; pure numeric I/O, unit-tested directly against the real model. `faceRegionCrop.ts` —
the canvas-dependent half (crop a DOM-blind region out of the raw screenshot, resize to the
model's input dims); needs a real `OffscreenCanvas`, covered by the Playwright/Firefox e2e suites
instead (same split as `privacy/redactor.ts`). Wired into the cascade at
`privacy/detect/hooks.ts`'s `visualDetect`. See `eval/reports/stage5-face.md` for what was
measured and `extension/public/models/face-yunet/SOURCE.md` for the model's provenance.

TODO(stage-6): unified detector, DOM-vision IoU fusion, occlusion checking, OCR restricted to
detector-only regions, screen-state JSON, image-only mode. TODO(stage-7): NER. Neither is
implemented — face detection is the only vision capability that exists today.

See docs/architecture.md layers 1-2 and docs/STAGES.md.
