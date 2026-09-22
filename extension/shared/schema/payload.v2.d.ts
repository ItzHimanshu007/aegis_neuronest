/* eslint-disable */
/**
 * Generated from payload.v2.schema.json by `pnpm gen:types`. Do not hand-edit.
 */

/**
 * Routing mode. Trades latency against perception depth.
 */
export type Mode = 'fast' | 'balanced' | 'accurate';
export type Element = {
  /**
   * Stable element fingerprint used to reacquire the element before acting. Not a selector and not derived from page id/class names.
   */
  fp: string;
  /**
   * Accessibility role, e.g. textbox, button, combobox.
   */
  role: string;
  /**
   * Sanitized accessible name. May contain tokens.
   */
  label: string;
  /**
   * Input type, e.g. text, email, password. Drives token type matching on re-hydration.
   */
  input_type?: string;
  /**
   * Whether the field currently holds a value. The value itself is never sent.
   */
  has_value?: boolean;
  value_len_bucket?: ValueLenBucket;
  bbox: Bbox;
  visible: boolean;
  enabled: boolean;
  /**
   * Interactive in the DOM but not visible to the user. Flagged as a possible injection/clickjacking vector.
   */
  hidden_interactive?: boolean;
  /**
   * Token standing in for this field's value (Stage 2). Present only when policy decided TOKEN/TOKEN_WITH_APPROVAL for it; the raw value is never sent.
   */
  value_token?: string;
  eid: string;
  /**
   * On screen but covered by something else. The planner should clear the obstacle before acting on this element.
   */
  occluded?: boolean;
  /**
   * EID of the element covering this one, when that element is itself in this payload.
   */
  covered_by?: string;
};
/**
 * Coarse length bucket. Never the value, never the exact length.
 */
export type ValueLenBucket = 'empty' | 'short' | 'medium' | 'long';
/**
 * Axis-aligned box [x, y, w, h] in CSS pixels relative to the viewport.
 *
 * @minItems 4
 * @maxItems 4
 */
export type Bbox = [number, number, number, number];

/**
 * Sanitized payload sent from the extension to the Aegis server. This object is the ONLY thing that crosses the network boundary. It may contain tokens ([[PII:TYPE:xxxxxxxx]]) and redacted pixels, never raw PII.
 */
export interface PayloadV2 {
  /**
   * Opaque per-session id. Not derived from user identity.
   */
  session: string;
  /**
   * Identifies one observation of one screen state.
   */
  capture_id: string;
  /**
   * Contract version marker.
   */
  schema: 'aegis/2';
  mode: Mode;
  /**
   * The user's task, already tokenized. May contain tokens.
   */
  task: string;
  page: {
    /**
     * Sanitized URL. Query/fragment PII is tokenized or stripped.
     */
    url: string;
    /**
     * Sanitized document title.
     */
    title: string;
    /**
     * Coarse page classification, e.g. kyc_form, checkout, login.
     */
    type?: string;
  };
  /**
   * Set-of-Marks elements. Labels are sanitized; raw values are never included.
   */
  elements: Element[];
  /**
   * Regions produced by the local vision detector.
   */
  visual_regions?: VisualRegion[];
  /**
   * Every redaction applied to the image, declared so the server can reason about what it cannot see.
   */
  redactions: Redaction[];
  /**
   * Redacted screenshot as a data URL. Omitted in image-only-off or text-delta routing.
   */
  image?: string;
  /**
   * Sanitized visible text blocks, capped by TEXT_BUDGET_CHARS (see extension/shared/config.ts).
   */
  texts?: TextBlock[];
  state_token: string;
  field_hints?: {
    eid: string;
    category: string;
    fill: 'empty';
  }[];
  /**
   * @maxItems 25
   */
  history?: HistoryEntry[];
  context_denied?: 'BUDGET_EXHAUSTED' | 'NO_SAFE_ELEMENTS' | 'INVALID_REQUEST';
}
export interface VisualRegion {
  /**
   * Region id, unique within the capture.
   */
  rid: string;
  /**
   * Detector class, e.g. button, face, id_document, card, signature, qr, or unscanned_media (the Stage 2 fail-closed default for images/canvas/video/embeds/unmapped iframes, until Stage 6 vision can classify them).
   */
  class: string;
  bbox: Bbox;
  /**
   * OCR text for detector-only regions, already tokenized.
   */
  ocr?: string;
}
export interface Redaction {
  rid: string;
  /**
   * FILL = solid fill over text PII. LABELLED_FILL = solid fill with the type/token drawn inside it. BLUR = irreversible blur, faces only. FILL_REGION = solid fill over a whole document/card region.
   */
  kind: 'FILL' | 'LABELLED_FILL' | 'BLUR' | 'FILL_REGION';
  /**
   * PII type that triggered the redaction, e.g. AADHAAR, FACE, PASSWORD.
   */
  type: string;
  bbox: Bbox;
  /**
   * Why the policy fired. Must not restate the redacted value.
   */
  reason?: string;
  /**
   * When the masked value was tokenized, the token the server can correlate this masked region with.
   */
  token?: string;
  eid?: string;
}
export interface TextBlock {
  /**
   * Text block id, unique within the capture.
   */
  tid: string;
  /**
   * Accessibility role of the block element (paragraph, cell, heading...).
   */
  role: string;
  /**
   * Sanitized block text. May contain tokens; never raw PII.
   */
  text: string;
  bbox: Bbox;
}
export interface HistoryEntry {
  step: number;
  action:
    | 'observe'
    | 'click'
    | 'type'
    | 'select'
    | 'check'
    | 'scroll'
    | 'hover'
    | 'key'
    | 'wait'
    | 'navigate'
    | 'ask_user'
    | 'done'
    | 'fail'
    | 'request_context';
  eid?: string;
  verdict: 'PASS' | 'FAIL' | 'REJECT' | 'ABORT_BATCH' | 'DROP_REMAINING' | 'USER_REQUIRED' | 'STOPPED';
  code?:
    | 'STALE_PLAN'
    | 'INVALID_SCHEMA'
    | 'PLAN_STEPS_REPEATED'
    | 'NEW_SCREEN'
    | 'TARGET_MISSING'
    | 'FP_MISMATCH'
    | 'AMBIGUOUS_TARGET'
    | 'NOT_VISIBLE'
    | 'NOT_HITTABLE'
    | 'DISABLED'
    | 'TOKEN_TYPE_MISMATCH'
    | 'TOKEN_IN_URL'
    | 'TOKEN_IN_KEY'
    | 'TOKEN_OUTSIDE_TYPE'
    | 'UNSUPPORTED_URL'
    | 'NEVER_AUTOMATED'
    | 'CONSENT_DENIED'
    | 'APPROVAL_SKIPPED'
    | 'EXEC_FAILED'
    | 'EXEC_UNTRUSTED_REJECTED'
    | 'VALUE_MISMATCH'
    | 'EXPECT_FAILED'
    | 'UNVERIFIABLE'
    | 'DONE_UNVERIFIED'
    | 'REQUIREMENTS_UNMET'
    | 'BUDGET_EXHAUSTED'
    | 'LOOP_DETECTED'
    | 'NO_PROGRESS'
    | 'CONTEXT_DENIED'
    | 'NETWORK_ERROR'
    | 'STOPPED'
    | 'USER_HINT'
    | 'USER_RETRY'
    | 'MODEL_FAILED';
}
