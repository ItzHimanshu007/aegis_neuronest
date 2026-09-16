/* eslint-disable */
/**
 * Generated from payload.v1.schema.json by `pnpm gen:types`. Do not hand-edit.
 */

/**
 * Routing mode. Trades latency against perception depth.
 */
export type Mode = 'fast' | 'balanced' | 'accurate';
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
export interface PayloadV1 {
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
  schema: 'aegis/1';
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
   * Same-screen incremental update. TODO(stage-8): define the delta shape.
   */
  delta?: {
    [k: string]: unknown;
  };
}
export interface Element {
  /**
   * Set-of-Marks number drawn on the image.
   */
  mark_id: number;
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
}
export interface VisualRegion {
  /**
   * Region id, unique within the capture.
   */
  rid: string;
  /**
   * Detector class, e.g. button, face, id_document, card, signature, qr.
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
   * FILL = solid fill over text PII. BLUR = irreversible blur, faces only. FILL_REGION = solid fill over a whole document/card region.
   */
  kind: 'FILL' | 'BLUR' | 'FILL_REGION';
  /**
   * PII type that triggered the redaction, e.g. AADHAAR, FACE, PASSWORD.
   */
  type: string;
  bbox: Bbox;
  /**
   * Why the policy fired. Must not restate the redacted value.
   */
  reason?: string;
}
