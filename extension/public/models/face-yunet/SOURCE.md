# YuNet face detector — provenance

- **Model**: YuNet (anchor-free, multi-scale CNN face detector), `face_detection_yunet_2026may.onnx`.
- **Source**: [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo), path
  `models/face_detection_yunet/face_detection_yunet_2026may.onnx`, fetched 2026-09-18 from the
  `main` branch (Git LFS object).
- **Why this variant, not `..._2023mar.onnx`**: `2023mar` has a fixed static input shape (verified
  by attempting to run it at 320x320 and 240x320 through ONNX Runtime — both failed with "invalid
  dimensions"). `2026may` re-exports the same weights with symbolic height/width dims and is the
  repo's own documented variant for "the ONNX Runtime engine" (as opposed to OpenCV's DNN module) —
  exactly the engine Aegis uses (`onnxruntime-web`). Verified to load and run under
  `onnxruntime-web`'s WASM backend, in Node (`onnxruntime-web/wasm`, `numThreads: 1`) and in a real
  Chromium extension page, at dimensions where both height and width are multiples of 32 (the
  model's 3 output strides are 8/16/32; non-multiples fail with a broadcast error inside the graph).
- **Author/license**: MIT, Copyright (c) 2020 Shiqi Yu (`LICENSE` in this directory, copied
  verbatim from the same opencv_zoo path). Trained on WIDER FACE; paper: "YuNet: A Tiny
  Millisecond-Level Face Detector" (Yu et al., Machine Intelligence Research, 2023).
- **File size on disk**: 229,738 bytes (~224 KiB), this file.
- **Integrity**: SHA-256 `ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0` — matches
  the Git LFS object's own recorded `oid` for this path in opencv_zoo, verified at download time.
- **Postprocessing**: this repo's own decode (`extension/perception/faceModel.ts`) reimplements the
  score/bbox/keypoint decode faithfully from OpenCV's C++ reference
  (`opencv/opencv` `modules/objdetect/src/face_detect.cpp`, `FaceDetectorYNImpl::postProcess`,
  Apache-2.0), since the ONNX graph itself only exposes the raw per-stride `cls`/`obj`/`bbox`/`kps`
  heads — OpenCV's convenience `cv.FaceDetectorYN` wrapper (used by opencv_zoo's own `yunet.py`
  demo) does that decode internally in C++, which is not available to an ONNX-Runtime-only,
  OpenCV-free pipeline like this one.
- **Not bundled here**: the two other opencv_zoo YuNet ONNX files (`2023mar`, `2023mar_int8bq`) —
  rejected per the note above / not needed once `2026may` worked.
