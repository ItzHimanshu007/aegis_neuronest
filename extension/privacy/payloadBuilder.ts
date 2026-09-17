import type { OutboundDraft, EID, StateTokenId } from '../scene';
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
import type { RawElement } from '../observe/types';

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

export interface DraftRedaction {
  eid?: EID;
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
  eid: EID;
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
  occluded?: boolean;
  covered_by?: EID;
}

export interface DraftPayload {
  session: string;
  capture_id: string;
  schema: 'aegis/2';
  state_token: StateTokenId;
  field_hints?: Array<{ eid: EID; category: Category; fill: 'empty' }>;
  mode: Mode;
  task: string;
  page: { url: string; title: string; type?: string };
  elements: DraftElement[];
  visual_regions?: DraftVisualRegion[];
  texts?: SanitizedTextBlock[];
  redactions: DraftRedaction[];
  image?: string;
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

export function buildPayload(input: OutboundDraft): DraftPayload {
  const payload = structuredClone(input.payload);
  if (payload.texts) payload.texts = capTextBudget(payload.texts, AEGIS_CONFIG.TEXT_BUDGET_CHARS);
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
