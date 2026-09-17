/**
 * Payload builder (Stage 2 Part F.4). Assembles a `DraftPayload` — the shape `firewall.seal()`
 * validates and turns into a `SanitizedPayload`.
 *
 * The one type-level guarantee worth calling out: `image` accepts ONLY a `RedactedImage`, which
 * only `privacy/redactor.ts -> redact()` can mint. An unredacted screenshot cannot be assigned
 * here even by mistake.
 */

import { AEGIS_CONFIG } from '../shared/config';
import type { Action, Category } from './categoryTypes';
import type { RedactedImage } from './redactor';
import type { Observation, RawElement } from '../observe/types';

export type Mode = 'fast' | 'balanced' | 'accurate';

export interface ElementDecision {
  /** Token to send instead of the value, when policy decided TOKEN/TOKEN_WITH_APPROVAL. */
  valueToken?: string;
  /** The policy action that applied to this element's value, if any. */
  action?: Action;
  /** Field-context category, used to decide whether a length bucket is allowed. */
  category?: Category;
}

export interface SanitizedTextBlock {
  tid: string;
  role: string;
  text: string;
  bbox: [number, number, number, number];
}

export interface BuildPayloadInput {
  observation: Observation;
  /** Sanitized task text (already tokenized/neutralized by sideChannels). */
  task: string;
  /** Sanitized page url/title. */
  url: string;
  title: string;
  mode: Mode;
  session: string;
  image?: RedactedImage;
  /** Per-element decisions, keyed by `fp`. */
  elementDecisions: Map<string, ElementDecision>;
  /** Already-sanitized text blocks. */
  texts: SanitizedTextBlock[];
  /** Redaction manifest entries derived from the applied masks. */
  redactions: DraftRedaction[];
  visualRegions: DraftVisualRegion[];
}

export interface DraftRedaction {
  rid: string;
  kind: 'FILL' | 'LABELLED_FILL' | 'BLUR' | 'FILL_REGION';
  type: string;
  bbox: [number, number, number, number];
  reason?: string;
  token?: string;
}

export interface DraftVisualRegion {
  rid: string;
  class: string;
  bbox: [number, number, number, number];
  ocr?: string;
}

export interface DraftElement {
  mark_id: number;
  fp: string;
  role: string;
  label: string;
  input_type?: string;
  has_value?: boolean;
  value_len_bucket?: 'empty' | 'short' | 'medium' | 'long';
  value_token?: string;
  bbox: [number, number, number, number];
  visible: boolean;
  enabled: boolean;
  hidden_interactive?: boolean;
}

export interface DraftPayload {
  session: string;
  capture_id: string;
  schema: 'aegis/1';
  mode: Mode;
  task: string;
  page: { url: string; title: string; type?: string };
  elements: DraftElement[];
  visual_regions?: DraftVisualRegion[];
  texts?: SanitizedTextBlock[];
  redactions: DraftRedaction[];
  image?: string;
}

/** Categories whose fields must never carry a length bucket — Stage 2 Part A1/F.3. The schema can
 * only enforce this for `input_type === 'password'` (OTP/CVV are detected by label, which the
 * schema can't see), so the builder enforces the full rule. */
const NO_LENGTH_BUCKET_CATEGORIES: Category[] = ['PASSWORD', 'OTP', 'CVV', 'UPI_PIN'];

function toIntRect(rect: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
}

/** Coarse page classification (Stage 2 Part F.4): a password field means a login screen; three or
 * more identity fields means a form; anything else is left unlabelled rather than guessed at. */
export function classifyPageType(elements: RawElement[], categoryOf: (el: RawElement) => Category | undefined): string | undefined {
  const hasPassword = elements.some((el) => el.inputType === 'password');
  if (hasPassword) return 'login';

  const identityFieldCategories: Category[] = ['NAME', 'EMAIL', 'PHONE', 'ADDRESS', 'DOB', 'AADHAAR', 'PAN', 'CARD_NUMBER', 'BANK_ACCOUNT'];
  const identityFieldCount = elements.filter((el) => {
    const category = categoryOf(el);
    return category !== undefined && identityFieldCategories.includes(category);
  }).length;

  return identityFieldCount >= 3 ? 'form' : undefined;
}

export function buildPayload(input: BuildPayloadInput): DraftPayload {
  const { observation } = input;

  const elements: DraftElement[] = [];
  for (const el of observation.elements) {
    // Visible elements, plus hidden interactive ones (role + label only, so the planner can see
    // that something interactive is there without it being treated as actionable).
    if (!el.visible && !el.hiddenInteractive) continue;

    const decision = input.elementDecisions.get(el.fp);
    const category = decision?.category;
    const suppressBucket = category !== undefined && NO_LENGTH_BUCKET_CATEGORIES.includes(category);
    const isPasswordField = el.inputType === 'password';

    const draft: DraftElement = {
      mark_id: el.mark_id,
      fp: el.fp,
      role: el.role,
      label: el.name || el.labelText,
      bbox: toIntRect(el.bbox),
      visible: el.visible,
      enabled: !el.states.disabled,
    };

    if (el.inputType) draft.input_type = el.inputType;
    if (el.hiddenInteractive) draft.hidden_interactive = true;

    if (el.visible) {
      draft.has_value = el.hasValue;
      if (!suppressBucket && !isPasswordField && el.valueLenBucket) {
        draft.value_len_bucket = el.valueLenBucket;
      }
      if (decision?.valueToken) draft.value_token = decision.valueToken;
    }

    elements.push(draft);
  }

  const payload: DraftPayload = {
    session: input.session,
    capture_id: observation.capture_id,
    schema: 'aegis/1',
    mode: input.mode,
    task: input.task,
    page: { url: input.url, title: input.title },
    elements,
    redactions: input.redactions,
  };

  const pageType = classifyPageType(observation.elements, (el) => input.elementDecisions.get(el.fp)?.category);
  if (pageType) payload.page.type = pageType;

  if (input.visualRegions.length > 0) payload.visual_regions = input.visualRegions;

  if (input.texts.length > 0) {
    payload.texts = capTextBudget(input.texts, AEGIS_CONFIG.TEXT_BUDGET_CHARS);
  }

  if (input.image) payload.image = input.image.dataUrl;

  return payload;
}

/** Drops whole blocks once the character budget is exhausted — never truncates mid-block, which
 * could split a token and make it unparseable (and, worse, unrecognizable to the firewall's token
 * check). */
export function capTextBudget(texts: SanitizedTextBlock[], budget: number): SanitizedTextBlock[] {
  const kept: SanitizedTextBlock[] = [];
  let used = 0;
  for (const block of texts) {
    if (used + block.text.length > budget) continue;
    kept.push(block);
    used += block.text.length;
  }
  return kept;
}

/** A random, non-derived session id (Stage 2 Part F.4: "not derived from anything"). */
export function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
