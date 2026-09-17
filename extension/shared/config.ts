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

  /** Independent local detector sizes; unused until Stage 5. Candidate settings, not results. */
  DETECTOR_INPUT_FAST: 640,
  DETECTOR_INPUT_ACCURATE: 1280,
  CONTEXT_EXPANSION_BUDGET: 3,
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
} as const;

export type AegisConfig = typeof AEGIS_CONFIG;
