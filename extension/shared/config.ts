/**
 * Central tuning config. Every threshold introduced in Stage 1 (and later stages) lives here,
 * each with a comment explaining what it controls. Nothing in this file is a secret and nothing
 * in this file is PII — it is safe to read from anywhere in the extension.
 */

export const AEGIS_CONFIG = {
  /** How long the DOM must go quiet (no mutations) before a capture is considered "settled". */
  SETTLE_QUIET_MS: 300,
  /** Hard ceiling on how long we wait for settle before capturing anyway (avoids hanging forever
   * on a page with continuous background animation/mutation). */
  SETTLE_MAX_MS: 3000,

  /** Chrome's `tabs.captureVisibleTab` is rate-limited; this must not exceed Chrome's own default
   * (2/sec) or captures will start failing with a quota error. */
  CAPTURE_MAX_PER_SEC: 2,
  /** How many times we retry a capture if the page state changed between the harvest and the
   * screenshot (stateToken mismatch), before giving up and returning the last attempt. */
  CAPTURE_RETRIES: 3,

  /** Weighted count of visible elements added/removed since the last observation that, on its
   * own, is enough to call the result NEW_SCREEN. */
  CHANGE_MUTATION_SCORE: 15,
  /** Fraction of marks (by id/fp) that changed between observations that, on its own, is enough
   * to call the result NEW_SCREEN. */
  CHANGE_MARK_RATIO: 0.25,
  /** Fraction of viewport height scrolled between observations that, on its own, is enough to
   * call the result NEW_SCREEN. */
  CHANGE_SCROLL_RATIO: 0.5,
  /** Below CHANGE_MUTATION_SCORE but above this, the mutation count is "ambiguous" and we fall
   * back to a perceptual (dHash) comparison of the screenshots instead of trusting the DOM alone. */
  CHANGE_AMBIGUOUS_SCORE: 5,
  /** Hamming distance between two 64-bit dHashes above which the screenshots are considered
   * perceptually different enough to call NEW_SCREEN. */
  CHANGE_DHASH_BITS: 10,

  /** Debounce window for the input/change watcher before it reports a field's hasValue/bucket
   * (never the raw value) to the background. */
  INPUT_DEBOUNCE_MS: 250,

  /** Length of the generated element fingerprint, in lowercase hex characters. */
  FP_HEX_LENGTH: 8,

  /** z-index of the debug overlay's host element, kept absurdly high so it always draws on top
   * during debugging — it is hidden entirely before every capture regardless. */
  OVERLAY_Z_INDEX: 2147483647,

  /** Side length (px) of the thumbnail used to compute a screenshot's perceptual dHash. Produces
   * an (N)x(N-with-one-extra-column) grayscale grid -> N*(N-1) = 64 bits when N=9. */
  DHASH_GRID_SIZE: 9,

  /** value.length <= this -> 'short' (above 0). Used only to bucket length, never to report the
   * value or its exact length. */
  VALUE_LEN_SHORT_MAX: 16,
  /** value.length <= this -> 'medium'; above it -> 'long'. */
  VALUE_LEN_MEDIUM_MAX: 64,

  /** How many ancestor levels the text-block grouper will climb looking for a block-level
   * ancestor before giving up and using the immediate parent — bounds worst-case walk cost on
   * deeply nested markup. */
  TEXT_BLOCK_MAX_ANCESTOR_DEPTH: 6,

  /** Stage 2 Part C.4 field-context detection: how far (CSS px) a candidate label text block may
   * be from a target element/block — to its left on the same row, or above it in the same
   * column — and still be treated as "the label for this field" (e.g. a table's "Balance" header
   * labelling the value cell below it, or a left-hand label next to a right-hand value). */
  FIELD_CONTEXT_MAX_PX: 120,

  /** Stage 2 Part C.7: rects belonging to the same detection are padded by this many CSS px
   * before the redactor masks them, and this is also the minimum gap two independent detections'
   * rects must have to be treated as non-overlapping. */
  REDACT_PAD_CSS_PX: 2,

  /** Opacity below which an element (after multiplying opacity down its ancestor chain) is
   * treated as invisible. Real "opacity: 0" is exact zero; this small epsilon also catches
   * "opacity: 0.001"-style evasions without flagging genuinely-translucent (opacity: 0.3, say)
   * elements as hidden. */
  OPACITY_EPSILON: 0.05,

  // --- Stage 2: Privacy core -----------------------------------------------------------------

  /** Detections at or above this confidence mark their origin as "identity seen" for the quasi
   * category's identity-accumulation rule (docs/policy.yaml). */
  IDENTITY_MIN_CONF: 0.6,

  /** Redacted screenshot long-edge size (px) per mode, before lossless PNG export (WebP evaluation is Stage 8). Balances payload
   * size against the server's ability to read layout — Fast trades detail for latency, Accurate
   * keeps the most. */
  /** Encoding is lossless PNG (see privacy/redactor.ts's canvasToDataUrl). Lossless keeps mask
   * verification sound: the pixels verifyMasks() samples are exactly the pixels drawn. It costs
   * roughly 3x the bytes of WebP — measured on Stage 3A captures, WebP q85 is 0.27-0.31x of PNG
   * and WebP LOSSLESS is 0.28-0.32x, so the saving does not require giving up bit-exact pixels.
   * Stage 8 owns the switch. */
  SERVER_IMAGE_MAX_SIDE_FAST: 960,
  SERVER_IMAGE_MAX_SIDE_BALANCED: 1280,
  SERVER_IMAGE_MAX_SIDE_ACCURATE: 1600,

  /** Minimum length (characters, and separately digits-only) a string must reach before
   * firewall.seal()'s known-value leak check compares it against vault/detection values — below
   * this, short common substrings (e.g. a 2-3 digit area code) would false-positive constantly. */
  LEAK_MIN_LEN: 4,
  /** Privacy Set-of-Marks (Stage 3A Part B): EID tags drawn on the sanitized image so the server
   * can name elements it can see. Labels never overlap a mask, so mask verification still runs
   * over the shipped image unchanged. */
  SOM_ENABLED: true,
  /** Rendered tag height in the FINAL (downscaled) image. The redactor draws at full resolution
   * and divides by the downscale factor, so the tag survives the balanced/fast shrink legibly. */
  SOM_MIN_LABEL_PX: 11,
  SOM_STYLE: {
    background: '#1b6ef3',
    text: '#ffffff',
    outline: '#ffffff',
  },

  /**
   * Labelled masks (semantic obfuscation). When on, every non-face mask carries a typed label drawn
   * from a closed vocabulary — `[AADHAAR]`, `[EMAIL#k3f7qa2b]`, `[IMAGE — not checked]` — so the
   * vision model can tell what a black box was hiding, and so the privacy receipt reads at a glance.
   * Faces keep the irreversible blur and gain a `[FACE]` tag on top of it.
   *
   * OFF by default, and it stays off until the model probe shows first-action EID grounding is
   * equal or better with labels than without on the SAME fixtures. A label is drawn ON the image the
   * server receives, so turning it on is a change to what leaves the device and has to be earned by
   * a measurement rather than by the idea sounding good. See eval/reports/mask-labels.md.
   */
  MASK_LABELS_ENABLED: false,

  /** Independent local detector sizes; unused until Stage 5. Candidate settings, not results. */
  DETECTOR_INPUT_FAST: 640,
  DETECTOR_INPUT_ACCURATE: 1280,
  CONTEXT_EXPANSION_BUDGET: 3,
  HISTORY_MAX_STEPS: 25,
  MAX_STEPS: 25,
  MAX_MODEL_CALLS: 15,
  MAX_WALL_S: 300,
  MAX_REPLANS: 2,
  LOOP_REPEAT_N: 3,
  NO_PROGRESS_N: 4,
  LINKABILITY_QUASI_K: 3,
  REPLAY_RECORDING: false,
  AUDIT_CAPACITY: 256,
  /** Separate, stricter floor for the digits-only form of the leak check. Short digit runs (a
   * 4-digit masked-card tail, a year, a port number) collide by coincidence in any numeric-heavy
   * string, so comparing them flags noise instead of leaks. */
  LEAK_MIN_DIGITS: 7,

  /** Cap on total characters sent in payload.v2's `texts[]` (Stage 2 Part F.3) — bounds payload
   * size on text-heavy pages; text blocks beyond the budget are simply omitted, fail-closed
   * (never truncated mid-token, which could split a token pattern and make it unparseable). */
  TEXT_BUDGET_CHARS: 4000,

  // --- Stage 5A: local face detection (extension/perception/faceModel.ts) --------------------

  /** Long-side cap (px) for the region fed to the face detector, before rounding up to the
   * nearest multiple of 32 (the model's 3 output strides are 8/16/32; the ONNX graph errors on
   * non-multiples). Small on purpose — this only ever runs on individual DOM-blind regions
   * (img/canvas/unmapped-frame/embed bounding boxes), never the whole screenshot, so metric 4
   * (client resource use) is bounded by the size of one region, not the page. */
  FACE_DETECT_INPUT_MAX_SIDE: 160,
  /** YuNet's own reference demo default (`opencv_zoo`'s `yunet.py`, `confThreshold`). Score is
   * `sqrt(cls * obj)`, both already sigmoid outputs from the graph. */
  FACE_DETECT_CONF_THRESHOLD: 0.6,
  /** YuNet's own reference demo default (`nmsThreshold`) — greedy IoU suppression across all 3
   * strides' raw candidates. */
  FACE_DETECT_NMS_THRESHOLD: 0.3,
  /** Regions smaller than this on either side (CSS px) are skipped without running the model —
   * a 1x1 tracking pixel or a hairline decorative <img> cannot contain a legible face, and
   * loading/upscaling the model for it would cost latency for zero possible signal. */
  FACE_DETECT_MIN_REGION_PX: 16,
  /** How long the ONNX Runtime session is kept warm after its last inference before being
   * released, so a burst of captures over several regions/steps doesn't reload the model every
   * time, but an idle side panel doesn't hold ~14MB of WASM memory forever. */
  FACE_MODEL_IDLE_UNLOAD_MS: 30_000,
} as const;

export type AegisConfig = typeof AEGIS_CONFIG;
