import type { Observation, LocalOnly } from '../observe/types';
import type { Action } from '../privacy/categoryTypes';
import type { MergedDetection } from '../privacy/detect/merge';
import { getElementFieldContext } from '../privacy/detect/fieldContext';
import { classifyFill } from '../privacy/detect/fillState';
import { classifyPageType, type DraftPayload, type ElementDecision, type DraftRedaction, type SanitizedTextBlock, type Mode } from '../privacy/payloadBuilder';
import { maskKindForAction, type MaskRequest } from '../privacy/redactor';
import type { StateToken } from '../shared/messages';
import type { EIDRegistry, EID } from './registry';
import type { SceneElement, SceneGraph, StateTokenId } from './types';
export type { EID } from './registry';
export type { SceneElement, SceneGraph, StateTokenId } from './types';

export interface SceneSessionState {
  sessionId: string; stateTokenId: StateTokenId; stateToken: StateToken;
  screen: SceneGraph['screen']; screenEpoch: number; mode: Mode;
  url: string; title: string; task: string; labels: Map<EID, string>;
  texts: SanitizedTextBlock[]; elementDecisions: Map<EID, ElementDecision>;
  tokensByDetection: Map<string, string>;
}
export function buildScene(observation: Observation, detections: MergedDetection[], decisions: Array<{ detection: MergedDetection; action: Action }>, registry: EIDRegistry, state: SceneSessionState): SceneGraph {
  registry.reconcile(observation);
  const elements = new Map<EID, SceneElement>();
  const relations: SceneGraph['relations'] = { labelOf: new Map(), inForm: new Map(), inModal: new Map(), inFrame: new Map() };
  for (const el of observation.elements) {
    const { eid, ambiguous } = registry.identity(el);
    const ds = detections.filter(d => d.target.kind === 'element' && d.target.ref === eid);
    const decision = state.elementDecisions.get(eid);
    const category = decision?.category ?? getElementFieldContext(el);
    const label = state.labels.get(eid);
    if (label === undefined) throw new Error('Missing sanitized element label');
    elements.set(eid, {
      eid, fp: el.fp, fpOrdinal: el.fpOrdinal, frameId: el.frameId, ambiguous,
      role: el.role, labelSanitized: label, inputType: el.inputType, fieldCategory: category,
      fill: category ? classifyFill(el, category) : undefined,
      states: { ...el.states }, bbox: { ...el.bbox }, visible: el.visible, hitOk: el.hitOk === true,
      hiddenInteractive: el.hiddenInteractive, detectionIds: ds.map(d => d.id),
      decision: decision?.action ?? decisions.find(d => d.detection.target.ref === eid)?.action,
      token: decision?.valueToken, sources: [...new Set(ds.flatMap(d => d.sources))],
      confidence: ds.length ? Math.max(...ds.map(d => d.confidence)) : undefined,
      local: { lineRects: el.lineRects, rawRef: el } as LocalOnly<{ lineRects: typeof el.lineRects; rawRef: unknown }>,
      tag: el.tag, inForm: el.inForm ?? false, buttonType: el.buttonType, formAction: el.formAction ?? false,
      href: el.href, download: el.download ?? false, hasValue: el.hasValue, valueLenBucket: el.valueLenBucket,
    });
    relations.labelOf.set(eid, label); relations.inFrame.set(eid, el.frameId);
    if (el.formRef) relations.inForm.set(eid, el.formRef);
    if (el.modalRef) relations.inModal.set(eid, el.modalRef);
  }
  const masks: MaskRequest[] = [], redactions: DraftRedaction[] = [];
  for (const { detection, action } of decisions) {
    const token = state.tokensByDetection.get(detection.id);
    const kind = maskKindForAction(action, Boolean(token));
    if (!kind || detection.fill === 'empty') continue;
    const eid = detection.target.kind === 'element' ? detection.target.ref as EID : undefined;
    for (const [index, rect] of detection.rects.entries()) {
      const rid = `${detection.id}-${index}`;
      masks.push({ rid, eid, kind, type: detection.category, rect, token });
      redactions.push({ rid, eid, kind, type: detection.category, bbox: intRect(rect), reason: `${detection.sources.join('+')} -> ${action}`, token });
    }
  }
  return {
    session_id: state.sessionId, capture_id: observation.capture_id, state_token: state.stateTokenId,
    screen: { ...state.screen }, screenEpoch: state.screenEpoch,
    page: { origin: new URL(observation.url).origin, urlSanitized: state.url, titleSanitized: state.title,
      type: classifyPageType(observation.elements, el => state.elementDecisions.get(registry.identity(el).eid)?.category) },
    elements, relations, regions: new Map(observation.media.map((m, i) => [`media-${i}`, {
      rid: `media-${i}`, class: 'unscanned_media', bbox: intRect(m.bbox), visible: m.visible, redacted: true,
    }])), texts: new Map(state.texts.map(t => [t.tid, { ...t }])),
    taskSanitized: state.task, mode: state.mode, redactions,
    local: { observation, stateToken: state.stateToken, masks, detections } as SceneGraph['local'],
  };
}
function intRect(r: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
}
export function toLocalView(scene: SceneGraph): SceneGraph { return scene; }

declare const OUTBOUND_DRAFT: unique symbol;
export type OutboundDraft = { readonly payload: DraftPayload; readonly [OUTBOUND_DRAFT]: true };
/** The only projection that payloadBuilder accepts. Enumerate fields; never spread raw/local data. */
export function toOutboundDraft(scene: SceneGraph): OutboundDraft {
  const elements: DraftPayload['elements'] = [];
  const fieldHints: NonNullable<DraftPayload['field_hints']> = [];
  for (const el of scene.elements.values()) {
    if (!el.visible && !el.hiddenInteractive) continue;
    const draft: DraftPayload['elements'][number] = {
      eid: el.eid, fp: el.fp, role: el.role, label: el.labelSanitized,
      bbox: el.visible ? intRect(el.bbox) : [0, 0, 0, 0], visible: el.visible, enabled: el.visible && !el.states.disabled,
    };
    if (el.visible) {
      draft.input_type = el.inputType; draft.has_value = el.hasValue;
      if (!['PASSWORD', 'OTP', 'CVV', 'UPI_PIN', 'SECRET'].includes(el.fieldCategory ?? '') && el.inputType !== 'password') draft.value_len_bucket = el.valueLenBucket;
      if (el.token) draft.value_token = el.token;
      if (el.fieldCategory && el.fill === 'empty') fieldHints.push({ eid: el.eid, category: el.fieldCategory, fill: 'empty' });
    } else draft.hidden_interactive = true;
    elements.push(draft);
  }
  const payload: DraftPayload = {
    schema: 'aegis/2', session: scene.session_id, capture_id: scene.capture_id, state_token: scene.state_token,
    mode: scene.mode, task: scene.taskSanitized,
    page: { url: scene.page.urlSanitized, title: scene.page.titleSanitized, type: scene.page.type },
    elements, redactions: scene.redactions.map(r => ({ ...r })),
    texts: [...scene.texts.values()].map(t => ({ ...t })),
    visual_regions: [...scene.regions.values()].filter(r => r.visible).map(r => ({ rid: r.rid, class: r.class, bbox: [...r.bbox] })),
    field_hints: fieldHints,
  };
  if (scene.image) payload.image = scene.image.dataUrl;
  return { payload } as OutboundDraft;
}
