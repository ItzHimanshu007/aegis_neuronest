import { decideSensing, countSensing, type SensingCounters } from '../sensing';
import { buildScene, toLocalView, toOutboundDraft, type EID, type SceneGraph } from '../scene';
/**
 * The agentHost (Stage 2 Part A2): the privacy pipeline, running inside the side panel document.
 *
 *   Observation (from background, passed straight through — never cached there)
 *     -> detect      (privacy/detect)
 *     -> decide      (privacy/policy)
 *     -> tokenize    (privacy/vault)
 *     -> sanitize    (privacy/sideChannels)
 *     -> redact      (privacy/redactor)
 *     -> build       (privacy/payloadBuilder)
 *     -> seal        (privacy/firewall)
 *
 * The only thing that leaves this module is a `SanitizedPayload` (to net/network.ts) and a
 * `PreviewData` bundle (to the Privacy Preview UI, which is local-only).
 */

import { applySpanRects, runDetectionCascade, type SpanRectsResponse } from '../privacy/detect';
import { canTokenizeFromPage, decide, determineNecessity } from '../privacy/policy';
import { getElementFieldContext } from '../privacy/detect/fieldContext';
import { redact, type Mode, type RedactResult } from '../privacy/redactor';
import { buildPayload, type ElementDecision, type SanitizedTextBlock } from '../privacy/payloadBuilder';
import { sanitizeText, sanitizeTask, sanitizeTitle, sanitizeUrl, type KnownValue } from '../privacy/sideChannels';
import { normalizeValue } from '../privacy/vault';
import { seal, type SanitizedPayload, type SealTimings } from '../privacy/firewall';
import type { MergedDetection } from '../privacy/detect/merge';
import type { Action, Category } from '../privacy/categoryTypes';
import type { Observation } from '../observe/types';
import type { StateToken } from '../shared/messages';
import type { PrivacySession } from './session';

export interface ProcessOptions {
  observation: Observation;
  task: string;
  mode: Mode;
  session: PrivacySession;
  /** Sends a SPAN_RECTS message to the observed tab. Injected so the pipeline stays testable. */
  requestSpanRects: (request: { capture_id: string; stateToken: StateToken; spans: Array<{ blockRef: string; start: number; end: number }> }) => Promise<SpanRectsResponse>;
  /** The token the capture stabilized on. The content script refuses the span lookup unless this
   * still matches, so passing anything else silently degrades every text detection to a
   * whole-block mask. */
  stateToken: StateToken;
  screen?: SceneGraph['screen'];
}

export interface PreviewDetection {
  id: string;
  category: Category;
  sources: string[];
  confidence: number;
  action: Action;
  targetKind: string;
  targetRef: string;
  /** Length only — the Privacy Preview never shows a value (Stage 2 Part G). */
  valueLength?: number;
  rectCount: number;
  /** Local geometry/offsets for exact synthetic evaluation; no value text. */
  span?: { start: number; end: number };
}

export interface ProcessResult {
  payload: SanitizedPayload;
  preview: {
    detections: PreviewDetection[];
    sensingCounters: SensingCounters;
    redactedImageDataUrl?: string;
    rawImageDataUrl: string;
    neutralizedCount: number;
    spanFallbacks: Array<{ detectionId: string; reason: string }>;
    draftJson: string;
    digest: string;
    size: number;
    sealTimings: SealTimings;
    timings: { detectMs: number; policyMs: number; redactMs: number; sealMs: number };
  };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

const TOKENIZING_ACTIONS: Action[] = ['TOKEN', 'TOKEN_WITH_APPROVAL'];

export async function processObservation(options: ProcessOptions): Promise<ProcessResult> {
  const { observation, task, mode, session } = options;
  await session.init();
  const origin = originOf(observation.url);

  // --- detect ---------------------------------------------------------------------------------
  const detectStart = performance.now();
  const cascade = runDetectionCascade({ observation, task, registry: session.registry, knownValues: session.vault.knownValues() });

  // One batched SPAN_RECTS call per capture (Stage 2 Part C.7).
  let detections: MergedDetection[] = cascade.detections;
  let spanFallbacks: Array<{ detectionId: string; reason: string }> = [];
  if (cascade.spanLookups.length > 0) {
    const blockBboxes = new Map(observation.textBlocks.map((b) => [b.blockRef, b.bbox]));
    let response: SpanRectsResponse;
    try {
      response = await options.requestSpanRects({
        capture_id: observation.capture_id,
        stateToken: options.stateToken,
        spans: cascade.spanLookups.map(({ blockRef, start, end }) => ({ blockRef, start, end })),
      });
    } catch {
      response = { stale: true }; // fail closed: mask whole blocks
    }
    const applied = applySpanRects(detections, cascade.spanLookups, response, blockBboxes);
    detections = applied.detections;
    spanFallbacks = applied.fallbacks;
  }
  const detectMs = performance.now() - detectStart;

  // --- decide ---------------------------------------------------------------------------------
  const policyStart = performance.now();
  session.privacyState.observeDetections(origin, detections);
  const identitySeenOnOrigin = session.privacyState.hasIdentitySeen(origin);
  const linkabilityActive = session.privacyState.hasLinkability(origin);

  const elementByEid = new Map(observation.elements.map((el) => [session.registry.identity(el).eid, el]));
  const vaultNormalizedValues = new Set(session.vault.knownValues().map((v) => v.normalized));

  const decisions: Array<{ detection: MergedDetection; action: Action }> = [];
  for (const detection of detections) {
    const element = detection.target.kind === 'element' ? elementByEid.get(detection.target.ref as EID) : undefined;
    const targetFieldCategory = element ? getElementFieldContext(element) : undefined;
    const necessity = determineNecessity({
      det: detection,
      vaultNormalizedValues,
      taskCategories: session.taskCategories,
      targetIsEditable: Boolean(element && ['input', 'textarea', 'select'].includes(element.tag)),
      targetFieldCategory,
      normalize: normalizeValue,
    });
    const action = decide(detection, { necessity, identitySeenOnOrigin, linkabilityActive, userOverrides: session.userOverrides });
    decisions.push({ detection, action });
  }
  const policyMs = performance.now() - policyStart;

  // --- tokenize -------------------------------------------------------------------------------
  const elementDecisions = new Map<EID, ElementDecision>();
  const tokensByDetection = new Map<string, string>();

  for (const { detection, action } of decisions) {
    if (!TOKENIZING_ACTIONS.includes(action)) continue;
    if (!canTokenizeFromPage(detection.category)) continue; // page-sourced secrets are never tokenized
    const rawValue = detection.rawValue as unknown as string | undefined;
    if (!rawValue) continue;
    const token = await session.vault.tokenize(detection.category, rawValue, { origin, source: 'page' });
    tokensByDetection.set(detection.id, token);
    if (detection.target.kind === 'element') {
      elementDecisions.set(detection.target.ref as EID, { valueToken: token, action, category: detection.category });
    }
  }

  // Elements with a field-context category but no token still record the category, so the payload
  // builder can suppress length buckets for secret fields.
  for (const el of observation.elements) {
    const eid = session.registry.identity(el).eid;
    if (elementDecisions.has(eid)) continue;
    const category = getElementFieldContext(el);
    if (category) elementDecisions.set(eid, { category });
  }

  // --- sanitize side channels -----------------------------------------------------------------
  const sanitizeOptions = {
    decideFor: (category: Category, value: string) =>
      decide(
        { id: 'side', capture_id: observation.capture_id, source: 'rule', category, confidence: 0.9, target: { kind: 'side_channel', ref: 'side' }, rects: [], rawValue: value as never },
        { necessity: 'not_needed' as const, identitySeenOnOrigin, linkabilityActive, userOverrides: session.userOverrides },
      ),
    tokenize: (category: Category, value: string) => session.vault.tokenize(category, value, { origin, source: 'page' }),
  };
  const sanitizedUrl = await sanitizeUrl(observation.url, sanitizeOptions);
  const sanitizedTitle = await sanitizeTitle(observation.title, sanitizeOptions);
  const sanitizedTask = await sanitizeTask(task, {
    ...sanitizeOptions,
    tokenize: (category, value) => {
      session.taskCategories.add(category);
      return session.vault.tokenize(category, value, { origin, source: 'task' });
    },
  });

  // --- sanitize text blocks -------------------------------------------------------------------
  // Text blocks get the cascade's decided values as well as the rule pass. The cascade uses
  // context the rules cannot see (a block whose KEY says "Aadhaar" is AADHAAR even when the
  // digits fail their checksum), so a rules-only sanitize would emit those values verbatim.
  const knownValues: KnownValue[] = decisions
    .filter(({ action }) => action !== 'ALLOW')
    .map(({ detection, action }) => ({
      value: (detection.rawValue as unknown as string) ?? '',
      category: detection.category,
      action,
      token: tokensByDetection.get(detection.id),
    }))
    .filter((v) => v.value.length > 0);

  const texts: SanitizedTextBlock[] = [];
  for (const block of observation.textBlocks) {
    const sanitized = await sanitizeText(block.text, { ...sanitizeOptions, knownValues });
    if (!sanitized.text.trim()) continue;
    texts.push({
      tid: block.blockRef,
      role: block.role,
      text: sanitized.text,
      bbox: [Math.round(block.bbox.x), Math.round(block.bbox.y), Math.round(block.bbox.width), Math.round(block.bbox.height)],
    });
  }

  // --- redact ---------------------------------------------------------------------------------
  const redactStart = performance.now();
  const labels = new Map<EID, string>();
  for (const el of observation.elements) {
    labels.set(session.registry.identity(el).eid, (await sanitizeText(el.name || el.labelText, { ...sanitizeOptions, knownValues })).text);
  }
  const screen = options.screen ?? { decision: 'NEW_SCREEN' as const, reason: 'conservative-default' };
  const scene = buildScene(observation, detections, decisions, session.registry, {
    sessionId: session.sessionId, stateTokenId: session.stateTokens.mint(), stateToken: options.stateToken,
    screen, screenEpoch: (session.scene?.screenEpoch ?? 0) + (screen.decision === 'NEW_SCREEN' ? 1 : 0),
    mode, url: sanitizedUrl.text, title: sanitizedTitle.text, task: sanitizedTask.text,
    labels, texts, elementDecisions, tokensByDetection,
  });
  const localView = toLocalView(scene);
  let redactResult: RedactResult | undefined;
  if (observation.screenshot.dataUrl) {
    redactResult = await redact({
      dataUrl: observation.screenshot.dataUrl,
      capture_id: observation.capture_id,
      scaleX: observation.screenshot.scaleX,
      scaleY: observation.screenshot.scaleY,
      masks: localView.local.masks,
      mode,
    });
  }
  const redactMs = performance.now() - redactStart;

  // --- build + seal ---------------------------------------------------------------------------
  const sensing = decideSensing(session.scene, { screen, captureId: scene.capture_id }, mode, { elements: scene.elements.size });
  scene.image = sensing.serverImage === 'none' ? undefined : redactResult?.image;
  const draft = buildPayload(toOutboundDraft(scene));

  const sealStart = performance.now();
  const { payload, timings: sealTimings } = await seal(draft, {
    vaultValues: session.vault.knownValues(),
    issuedTokens: new Set(session.vault.allTokens()),
    decisions: decisions.map(({ detection, action }) => ({ detection, action })),
    redactResult,
    observedRawValues: decisions
      .filter(({ action }) => action !== 'ALLOW')
      .map(({ detection }) => ({ value: (detection.rawValue as unknown as string) ?? '', category: detection.category }))
      .filter((v) => v.value.length > 0),
  });
  const sealMs = performance.now() - sealStart;
  session.stateTokens.commit(scene);
  session.scene = scene;
  session.sensingCounters = countSensing(session.sensingCounters, sensing);
  const categoryCounts: Partial<Record<Category, number>> = {};
  for (const d of detections) categoryCounts[d.category] = (categoryCounts[d.category] ?? 0) + 1;
  session.audit.append({ ts: Date.now(), digest: payload.digest, categoryCounts, eids: [...scene.elements.keys()], action: 'observe', level: 'L0', verdict: 'SEALED', timings: { detectMs, policyMs, redactMs, sealMs } });

  const neutralizedCount = sanitizedUrl.neutralizedCount + sanitizedTitle.neutralizedCount + sanitizedTask.neutralizedCount;

  return {
    payload,
    preview: {
      sensingCounters: { ...session.sensingCounters },
      detections: decisions.map(({ detection, action }) => ({
        id: detection.id,
        category: detection.category,
        sources: detection.sources,
        confidence: detection.confidence,
        action,
        targetKind: detection.target.kind,
        targetRef: detection.target.ref,
        valueLength: detection.rawValue ? (detection.rawValue as unknown as string).length : undefined,
        rectCount: detection.rects.length,
        span: detection.span,
      })),
      redactedImageDataUrl: redactResult?.image.dataUrl,
      rawImageDataUrl: observation.screenshot.dataUrl,
      neutralizedCount,
      spanFallbacks,
      draftJson: new TextDecoder().decode(payload.bytes),
      digest: payload.digest,
      size: payload.size,
      sealTimings,
      timings: { detectMs, policyMs, redactMs, sealMs },
    },
  };
}
