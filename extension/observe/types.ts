/**
 * Local-only observation types (Stage 1 Part B). Everything in this file describes the page as
 * the browser sees it, raw values included — none of it has been redacted, tokenized or even
 * classified as PII yet. That happens in Stage 2 (extension/privacy). Until then, this data must
 * never be able to reach `extension/net/network.ts -> send()`.
 *
 * `LocalOnly<T>` is a branded marker type, not an enforcement mechanism by itself — the actual
 * enforcement is `net/network.ts` only accepting `SanitizedPayload` (see privacy/firewall.ts) and
 * ESLint's `no-restricted-globals` ban on `fetch`/etc. outside that one file. The brand exists so
 * that if anyone ever tries to widen `send()`'s parameter type to accept an `Observation`
 * directly, or to smuggle one through as `unknown`/`any`, `pnpm check`'s typecheck step or the
 * `// @ts-expect-error` proof in observe/__tests__/localOnly.typetest.ts catches it.
 */

declare const LOCAL_ONLY_BRAND: unique symbol;

/** Marks a type as "never allowed to cross into net/network.ts". Structural, so it composes with
 * plain object/array types without extra wrapping at every call site. */
export type LocalOnly<T> = T & { readonly [LOCAL_ONLY_BRAND]: 'local-only' };

// ---------------------------------------------------------------------------------------------
// Shared small types
// ---------------------------------------------------------------------------------------------

export interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ValueLenBucket = 'empty' | 'short' | 'medium' | 'long';

export interface ElementStates {
  disabled: boolean;
  checked: boolean | 'mixed' | undefined;
  selected: boolean | undefined;
  expanded: boolean | undefined;
  focused: boolean;
  readonly: boolean;
  required: boolean;
}

export type VisibilityReason =
  | 'visible'
  | 'display-none'
  | 'visibility-hidden'
  | 'content-visibility-hidden'
  | 'opacity-zero'
  | 'zero-size'
  | 'clipped'
  | 'outside-viewport'
  | 'aria-hidden'
  | 'inert';

/** Raw, privacy-related attributes/classes observed on the element verbatim — this is *evidence*
 * for the Stage 2 policy engine, not a decision. See docs/policy.yaml. */
export type PrivacyAttr =
  | 'data-private'
  | 'data-pii'
  | 'data-hj-suppress'
  | 'data-clarity-mask'
  | 'rr-mask'
  | 'rr-block'
  | 'sentry-mask'
  | 'autocomplete-cc'
  | 'type-password';

// ---------------------------------------------------------------------------------------------
// RawElement / RawMedia / RawTextBlock
// ---------------------------------------------------------------------------------------------

export interface RawElement {
  /** Assigned only by the panel's session EIDRegistry after frame composition. */
  eid?: import('../scene/registry').EID;
  fp: string;
  fpOrdinal: number;
  frameId: number;
  tag: string;
  role: string;
  /** Accessible name per the AccName spec (dom-accessibility-api). */
  name: string;
  /** Text of an associated <label>, distinct from the full accessible name computation. */
  labelText: string;
  inputType?: string;
  autocomplete?: string;
  nameAttr?: string;

  /** RAW current value. Local only, never serialized to logs or the network. */
  value?: string;
  hasValue: boolean;
  beingTyped?: boolean;
  /** Local DOM handle; never projected outbound. */
  nodeRef?: string;
  inForm?: boolean;
  formRef?: string;
  /** Field is type=search, or sits inside <search> / role=search. */
  inSearchScope?: boolean;
  /** Origin of the enclosing form's `action`, when it has one. */
  formActionOrigin?: string;
  modalRef?: string;
  href?: string;
  download?: boolean;
  formAction?: boolean;
  buttonType?: string;
  /** Omitted entirely for password fields — see Part B: "password: hasValue only". */
  valueLenBucket?: ValueLenBucket;

  states: ElementStates;

  bbox: CssRect;
  lineRects: CssRect[];

  visible: boolean;
  visibilityReason: VisibilityReason;
  hiddenInteractive: boolean;
  /** undefined when elementFromPoint isn't available in this environment (see observe/visibility.ts). */
  hitOk?: boolean;
  /** `nodeRef` of the nearest captured candidate covering this element, when `hitOk` is false.
   * Resolved to an EID by the Scene Graph. */
  coveredByRef?: string;

  privacyAttrs: PrivacyAttr[];
  inShadow: 'open' | 'closed' | 'none';
}

export type RawMediaKind = 'img' | 'canvas' | 'video' | 'svg-image' | 'iframe-unmapped' | 'embed' | 'object';

export interface RawMedia {
  kind: RawMediaKind;
  bbox: CssRect;
  alt: string;
  title: string;
  /** Raw filename portion of the src/currentSrc, local only. */
  srcFilename: string;
  visible: boolean;
  frameId: number;
}

export interface RawTextBlock {
  /** Stable within one capture (`${frameId}:${localIndex}`) — used by the content script's
   * SPAN_RECTS handler (Stage 2 Part A3) to re-locate this exact block later in the same capture
   * and compute line rects for a character-offset substring inside it. Not meaningful across
   * captures — a new harvest reassigns indices from scratch. */
  blockRef: string;
  text: string;
  lineRects: CssRect[];
  bbox: CssRect;
  role: string;
  frameId: number;
  /** Privacy markers on the block element or any ancestor — a `data-private` wrapper covers
   * everything inside it, which is exactly how site authors use these attributes. */
  privacyAttrs: PrivacyAttr[];
}

// ---------------------------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------------------------

export interface FrameInfo {
  frameId: number;
  parentFrameId: number | null;
  /** Raw frame URL, local only. */
  url: string;
  /** How this frame's coordinates were composed into top-level space. */
  mapping: 'top' | 'same-origin' | 'runtime-frame-id' | 'src-size-match' | 'unmapped';
}

export interface Viewport {
  cssW: number;
  cssH: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
  visualScale: number;
}

export interface ScreenshotInfo {
  dataUrl: string;
  pxW: number;
  pxH: number;
  scaleX: number;
  scaleY: number;
}

export interface ObservationTimings {
  injectMs: number;
  harvestMs: number;
  captureMs: number;
  totalMs: number;
}

export interface ObservationCounts {
  elements: number;
  visibleElements: number;
  hiddenInteractive: number;
  media: number;
  textBlocks: number;
  frames: number;
}

export interface RawObservation {
  capture_id: string;
  ts: number;
  url: string;
  title: string;
  viewport: Viewport;
  frames: FrameInfo[];
  elements: RawElement[];
  media: RawMedia[];
  textBlocks: RawTextBlock[];
  screenshot: ScreenshotInfo;
  timings: ObservationTimings;
  counts: ObservationCounts;
}

/** The type every part of the codebase outside `observe/` should actually import and use. */
export type Observation = LocalOnly<RawObservation>;

/** Helper for producing a value already branded as LocalOnly, used at the one place per capture
 * where a RawObservation is assembled (observe/capture.ts). Not exported for general use — code
 * outside this module should receive an already-built Observation, never construct one from a
 * bare object via `as`. */
export function markLocalOnly(obs: RawObservation): Observation {
  return obs as Observation;
}

// ---------------------------------------------------------------------------------------------
// Debug JSON — the ONLY sanctioned way to turn an Observation into something loggable
// ---------------------------------------------------------------------------------------------

/**
 * Produces a JSON-safe view of an Observation for logs and tests: every raw text field is
 * replaced by its length, and `value` is dropped entirely (not even its length — a length alone
 * can fingerprint a password). Still local-only in spirit (don't send this to the network either
 * — Stage 2 is what actually decides what, if anything, is safe to transmit), but safe to print
 * to the console or assert on in a test.
 */
export function toDebugJSON(obs: Observation): unknown {
  const raw = obs as unknown as RawObservation;
  return {
    capture_id: raw.capture_id,
    ts: raw.ts,
    urlLength: raw.url.length,
    titleLength: raw.title.length,
    viewport: raw.viewport,
    frameCount: raw.frames.length,
    counts: raw.counts,
    timings: raw.timings,
    elements: raw.elements.map((el) => ({
      eid: el.eid,
      fp: el.fp,
      fpOrdinal: el.fpOrdinal,
      frameId: el.frameId,
      tag: el.tag,
      role: el.role,
      nameLength: el.name.length,
      labelTextLength: el.labelText.length,
      inputType: el.inputType,
      hasValue: el.hasValue,
      valueLenBucket: el.valueLenBucket,
      states: el.states,
      bbox: el.bbox,
      visible: el.visible,
      visibilityReason: el.visibilityReason,
      hiddenInteractive: el.hiddenInteractive,
      hitOk: el.hitOk,
      privacyAttrs: el.privacyAttrs,
      inShadow: el.inShadow,
    })),
    media: raw.media.map((m) => ({ kind: m.kind, bbox: m.bbox, visible: m.visible, frameId: m.frameId })),
    textBlocks: raw.textBlocks.map((t) => ({ textLength: t.text.length, bbox: t.bbox, role: t.role, frameId: t.frameId })),
  };
}
