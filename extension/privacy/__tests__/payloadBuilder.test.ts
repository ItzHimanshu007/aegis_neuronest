import { buildScene, toOutboundDraft, type EID } from '../../scene';
import { EIDRegistry } from '../../scene/registry';
import { describe, expect, it } from 'vitest';
import { buildPayload, capTextBudget, classifyPageType, newSessionId, type ElementDecision } from '../payloadBuilder';
import { markLocalOnly, type RawElement, type RawObservation } from '../../observe/types';

function makeElement(overrides: Partial<RawElement> = {}): RawElement {
  return {
    fp: 'fp-1',
    fpOrdinal: 0,
    frameId: 0,
    tag: 'input',
    role: 'textbox',
    name: 'Full name',
    labelText: 'Full name',
    inputType: 'text',
    hasValue: true,
    valueLenBucket: 'short',
    states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 1.4, y: 2.6, width: 100.2, height: 20.8 },
    lineRects: [],
    visible: true,
    visibilityReason: 'visible',
    hiddenInteractive: false,
    privacyAttrs: [],
    inShadow: 'none',
    ...overrides,
  };
}

function makeObservation(elements: RawElement[]): RawObservation {
  return {
    capture_id: 'cap-1',
    ts: 1,
    url: 'https://example.test/',
    title: 'Example',
    viewport: { cssW: 1000, cssH: 600, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [],
    elements,
    media: [],
    textBlocks: [],
    screenshot: { dataUrl: '', pxW: 1000, pxH: 600, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 0, harvestMs: 0, captureMs: 0, totalMs: 0 },
    counts: { elements: elements.length, visibleElements: elements.length, hiddenInteractive: 0, media: 0, textBlocks: 0, frames: 0 },
  };
}

function build(elements: RawElement[], decisions: Array<[string, ElementDecision]> = []) {
  const observation = markLocalOnly(makeObservation(elements));
  const registry = new EIDRegistry(); registry.reconcile(observation);
  const byFp = new Map(decisions);
  const elementDecisions = new Map<EID, ElementDecision>();
  for (const el of elements) { const d = byFp.get(el.fp); if (d) elementDecisions.set(registry.identity(el).eid, d); }
  return buildPayload(toOutboundDraft(buildScene(observation, [], [], registry, {
    sessionId: 'sess-1', stateTokenId: 'Sabcdefghij', stateToken: { mutationCounter: 0, scrollX: 0, scrollY: 0, dpr: 1, visualScale: 1, innerWidth: 1000, innerHeight: 600 },
    screen: { decision: 'NEW_SCREEN', reason: 'test' }, screenEpoch: 1,
    task: 'do the thing', url: 'https://example.test/', title: 'Example', mode: 'balanced',
    labels: new Map(elements.map(el => [registry.identity(el).eid, el.name])),
    texts: [], elementDecisions, tokensByDetection: new Map(),
  })));

}

describe('buildPayload', () => {
  it('rounds bboxes to integers', () => {
    const payload = build([makeElement()]);
    expect(payload.elements[0]!.bbox).toEqual([1, 3, 100, 21]);
  });

  it('includes visible elements', () => {
    const payload = build([makeElement()]);
    expect(payload.elements).toHaveLength(1);
  });

  it('includes hidden INTERACTIVE elements with role+label but no value info', () => {
    const payload = build([makeElement({ visible: false, hiddenInteractive: true })]);
    expect(payload.elements).toHaveLength(1);
    expect(payload.elements[0]!.hidden_interactive).toBe(true);
    expect(payload.elements[0]!.has_value).toBeUndefined();
    expect(payload.elements[0]!.value_len_bucket).toBeUndefined();
  });

  it('excludes elements that are neither visible nor hidden-interactive', () => {
    const payload = build([makeElement({ visible: false, hiddenInteractive: false })]);
    expect(payload.elements).toHaveLength(0);
  });

  it('attaches a value_token when the decision carries one', () => {
    const payload = build([makeElement()], [['fp-1', { valueToken: '[[PII:NAME:abcdefgh]]', action: 'TOKEN', category: 'NAME' }]]);
    expect(payload.elements[0]!.value_token).toBe('[[PII:NAME:abcdefgh]]');
  });

  it('NEVER includes a length bucket for a password field', () => {
    const payload = build([makeElement({ inputType: 'password' })]);
    expect(payload.elements[0]!.value_len_bucket).toBeUndefined();
    expect(payload.elements[0]!.has_value).toBe(true);
  });

  it.each(['PASSWORD', 'OTP', 'CVV', 'UPI_PIN'] as const)('NEVER includes a length bucket for a %s field', (category) => {
    const payload = build([makeElement()], [['fp-1', { category }]]);
    expect(payload.elements[0]!.value_len_bucket).toBeUndefined();
  });

  it('DOES include a length bucket for an ordinary field', () => {
    const payload = build([makeElement()], [['fp-1', { category: 'NAME' }]]);
    expect(payload.elements[0]!.value_len_bucket).toBe('short');
  });

  it('sets schema and mode', () => {
    const payload = build([makeElement()]);
    expect(payload.schema).toBe('aegis/2');
    expect(payload.mode).toBe('balanced');
  });

  it('never carries a raw value field at all', () => {
    const payload = build([makeElement()]);
    expect(JSON.stringify(payload)).not.toContain('"value"');
  });
});

describe('classifyPageType', () => {
  it('returns login when a password field is present', () => {
    expect(classifyPageType([makeElement({ inputType: 'password' })], () => undefined)).toBe('login');
  });

  it('returns form when three or more identity fields are present', () => {
    const els = [makeElement({ fp: 'a' }), makeElement({ fp: 'b' }), makeElement({ fp: 'c' })];
    const categories = new Map([
      ['a', 'NAME' as const],
      ['b', 'EMAIL' as const],
      ['c', 'PHONE' as const],
    ]);
    expect(classifyPageType(els, (el) => categories.get(el.fp))).toBe('form');
  });

  it('returns undefined rather than guessing when there is little signal', () => {
    expect(classifyPageType([makeElement()], () => undefined)).toBeUndefined();
  });
});

describe('capTextBudget', () => {
  const block = (tid: string, text: string) => ({ tid, role: 'paragraph', text, bbox: [0, 0, 1, 1] as [number, number, number, number] });

  it('keeps blocks that fit the budget', () => {
    expect(capTextBudget([block('a', 'abc'), block('b', 'de')], 10)).toHaveLength(2);
  });

  it('drops whole blocks rather than truncating mid-token', () => {
    const result = capTextBudget([block('a', 'abcde'), block('b', 'fghij')], 6);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('abcde'); // never 'f' or a partial second block
  });

  it('returns an empty list when nothing fits', () => {
    expect(capTextBudget([block('a', 'abcdefghij')], 3)).toHaveLength(0);
  });
});

describe('newSessionId', () => {
  it('is random and not derived from anything', () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
