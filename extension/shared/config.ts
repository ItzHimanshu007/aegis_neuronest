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

  /** Opacity below which an element (after multiplying opacity down its ancestor chain) is
   * treated as invisible. Real "opacity: 0" is exact zero; this small epsilon also catches
   * "opacity: 0.001"-style evasions without flagging genuinely-translucent (opacity: 0.3, say)
   * elements as hidden. */
  OPACITY_EPSILON: 0.05,
} as const;

export type AegisConfig = typeof AEGIS_CONFIG;
