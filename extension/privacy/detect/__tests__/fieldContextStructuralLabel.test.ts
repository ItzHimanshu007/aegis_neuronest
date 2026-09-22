import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runDetectionCascade } from '../index';
import { getElementFieldContext } from '../fieldContext';
import { EIDRegistry } from '../../../scene/registry';
import { seal } from '../../firewall';
import { PrivacySession } from '../../../agentHost/session';
import { processObservation } from '../../../agentHost';
import type { Observation, RawElement } from '../../../observe/types';
import type { StateToken } from '../../../shared/messages';
import type { DraftPayload } from '../../payloadBuilder';
import type { SealContext } from '../../firewall';

vi.mock('../../redactor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../redactor')>();
  return {
    ...actual,
    redact: vi.fn(async (opts) => ({
      image: {
        dataUrl: 'data:image/webp;base64,mock',
        pxW: 100,
        pxH: 100,
        capture_id: opts.capture_id,
        masks: [],
        somLabels: [],
      },
      fullResolution: { canvas: {} as OffscreenCanvas, pxW: 100, pxH: 100 },
      scaleX: 1,
      scaleY: 1,
    })),
    verifyMasks: vi.fn(async () => ({ ok: true, failures: [] })),
  };
});

function makeElement(overrides: Partial<RawElement> = {}): RawElement {
  return {
    tag: 'input',
    role: 'textbox',
    name: '',
    labelText: '',
    hasValue: true,
    value: '',
    valueLenBucket: 'empty',
    states: { disabled: false, focused: false, readonly: false, required: false, checked: false, selected: false, expanded: false },
    bbox: { x: 10, y: 10, width: 100, height: 30 },
    lineRects: [],
    visible: true,
    visibilityReason: 'visible',
    hiddenInteractive: false,
    hitOk: true,
    privacyAttrs: [],
    inShadow: 'none',
    fp: 'fp-test',
    frameId: 0,
    fpOrdinal: 0,
    ...overrides,
  };
}

function makeObservation(elements: RawElement[]): Observation {
  return {
    capture_id: 'cap-test',
    ts: 1000,
    url: 'https://form.jotform.com/test',
    title: 'Test Form',
    viewport: { cssW: 1000, cssH: 800, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [],
    elements,
    textBlocks: [],
    media: [],
    screenshot: { dataUrl: '', pxW: 1000, pxH: 800, scaleX: 1, scaleY: 1 },
    timings: { totalMs: 10, harvestMs: 5, captureMs: 5, injectMs: 0 },
    counts: { elements: elements.length, visibleElements: elements.length, hiddenInteractive: 0, media: 0, textBlocks: 0, frames: 0 },
  } as unknown as Observation;
}

function makeDraft(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    session: 'sess-1',
    capture_id: 'cap-1',
    schema: 'aegis/2',
    state_token: 'Sabcdefghij',
    mode: 'balanced',
    task: 'Fill in form',
    page: { url: 'https://form.jotform.com/test', title: 'Test Form' },
    elements: [
      {
        eid: 'E0',
        fp: 'fp-aaaa1111',
        role: 'textbox',
        label: 'Field',
        input_type: 'text',
        has_value: false,
        bbox: [10, 10, 100, 20],
        visible: true,
        enabled: true,
      },
    ],
    redactions: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SealContext> = {}): SealContext {
  return {
    vaultValues: [],
    issuedTokens: new Set<string>(),
    decisions: [],
    observedRawValues: [],
    ...overrides,
  };
}

describe('Field context structural label protection (Jotform known-value-leak fix)', () => {
  it('TEST 1 — Jotform editable label: produces category ADDRESS but rawValue is undefined', async () => {
    const el = makeElement({
      tag: 'div',
      role: 'generic',
      labelText: 'Address',
      value: 'Address',
      hasValue: true,
    });
    const obs = makeObservation([el]);
    const registry = new EIDRegistry();
    const result = await runDetectionCascade({ observation: obs, registry });

    const fc = result.detections.find((d) => d.source === 'field_context' && d.category === 'ADDRESS');
    expect(fc).toBeDefined();
    expect(fc?.category).toBe('ADDRESS');
    expect(fc?.confidence).toBe(0.7);
    expect(fc?.rawValue).toBeUndefined();
  });

  it('TEST 2 — Other structural labels: Full Name, Phone Number, E-mail, Date of Birth have undefined rawValue', async () => {
    const cases = [
      { label: 'Full Name', expectedCategory: 'NAME' },
      { label: 'Phone Number', expectedCategory: 'PHONE' },
      { label: 'E-mail', expectedCategory: 'EMAIL' },
      { label: 'Date of Birth', expectedCategory: 'DOB' },
    ] as const;

    for (const { label, expectedCategory } of cases) {
      const el = makeElement({
        tag: 'div',
        role: 'generic',
        labelText: label,
        value: label,
        hasValue: true,
      });
      const obs = makeObservation([el]);
      const registry = new EIDRegistry();
      const result = await runDetectionCascade({ observation: obs, registry });

      const fc = result.detections.find((d) => d.source === 'field_context' && d.category === expectedCategory);
      expect(fc).toBeDefined();
      expect(fc?.category).toBe(expectedCategory);
      expect(fc?.rawValue).toBeUndefined();
    }
  });

  it('TEST 3 — Real entered address: actual user address is not considered structural', async () => {
    const el = makeElement({
      tag: 'input',
      role: 'textbox',
      labelText: 'Address',
      value: '123 Elm Street, Suite 400',
      hasValue: true,
    });
    const obs = makeObservation([el]);
    const registry = new EIDRegistry();
    const result = await runDetectionCascade({ observation: obs, registry });

    const fc = result.detections.find((d) => d.source === 'field_context' && d.category === 'ADDRESS');
    expect(fc).toBeDefined();
    // Genuine user address is preserved in rawValue
    expect(fc?.rawValue).toBeDefined();
    expect(fc?.rawValue as unknown as string).toBe('123 Elm Street, Suite 400');
  });

  it('TEST 4 — Existing field-context behavior: category inference is intact', () => {
    expect(getElementFieldContext({ name: 'Address', labelText: '' })).toBe('ADDRESS');
    expect(getElementFieldContext({ name: 'Phone Number', labelText: '' })).toBe('PHONE');
    expect(getElementFieldContext({ name: 'Email', labelText: '' })).toBe('EMAIL');
    expect(getElementFieldContext({ name: 'Date of Birth', labelText: '' })).toBe('DOB');
  });

  it('TEST 5 — Firewall regression: Jotform structural label does not block Address Field Required label', async () => {
    // Recreate the Jotform scenario:
    // 1. Container element with label "Address Field Required"
    // 2. Editable label div with value "Address", labelText "Address"
    const container = makeElement({
      fp: 'fp-container',
      tag: 'li',
      role: 'listitem',
      name: 'Address Field Required',
      labelText: '',
      hasValue: false,
    });
    const labelDiv = makeElement({
      fp: 'fp-label',
      tag: 'div',
      role: 'generic',
      labelText: 'Address',
      value: 'Address',
      hasValue: true,
    });

    const obs = makeObservation([container, labelDiv]);
    const registry = new EIDRegistry();
    registry.reconcile(obs);
    const cascade = await runDetectionCascade({ observation: obs, registry });

    // Ensure rawValue on field_context is undefined
    const fc = cascade.detections.find((d) => d.category === 'ADDRESS');
    expect(fc?.rawValue).toBeUndefined();

    // In agentHost, observedRawValues is populated from non-ALLOW detections with rawValue
    const observedRawValues = cascade.detections
      .map((d) => ({ value: (d.rawValue as unknown as string) ?? '', category: d.category }))
      .filter((v) => v.value.length > 0);

    // ADDRESS / "Address" must NOT be in observedRawValues
    expect(observedRawValues.some((v) => v.category === 'ADDRESS' && v.value === 'Address')).toBe(false);

    // Build draft payload where an element has label "Address Field Required"
    const draft = makeDraft({
      elements: [
        {
          eid: 'E80',
          fp: 'fp1',
          role: 'listitem',
          label: 'Address Field Required',
          bbox: [0, 0, 100, 50],
          visible: true,
          enabled: true,
        },
      ],
    });

    // seal() must succeed!
    await expect(seal(draft, makeCtx({ observedRawValues }))).resolves.toBeDefined();
  });

  it('TEST 6 — Genuine known-value protection: real user address in outgoing text is still rejected', async () => {
    const realUserAddress = '123 Elm Street, Suite 400';
    const draft = makeDraft({
      elements: [
        {
          eid: 'E1',
          fp: 'fp1',
          role: 'textbox',
          label: `Shipping to ${realUserAddress}`,
          bbox: [0, 0, 100, 50],
          visible: true,
          enabled: true,
        },
      ],
    });

    // When the real address is in vaultValues:
    const ctxVault = makeCtx({
      vaultValues: [{ value: realUserAddress, normalized: '123 elm street suite 400', type: 'ADDRESS' }],
    });
    await expect(seal(draft, ctxVault)).rejects.toMatchObject({ reason: 'known-value-leak' });

    // When the real address is in observedRawValues:
    const ctxObserved = makeCtx({
      observedRawValues: [{ value: realUserAddress, category: 'ADDRESS' }],
    });
    await expect(seal(draft, ctxObserved)).rejects.toMatchObject({ reason: 'known-value-leak' });
  });

  it('TEST 7 — Live Jotform capture: real Jotform observation now seals without known-value-leak', async () => {
    const obsPath = path.resolve('/Users/himanshujasoriya/.gemini/antigravity-ide/brain/5ebbca6b-1f71-4d5f-906b-ce4f3cbbc487/scratch/jotform_obs.json');
    if (!existsSync(obsPath)) return;
    const obs: Observation = JSON.parse(readFileSync(obsPath, 'utf8'));

    const session = new PrivacySession();
    await session.init();

    const result = await processObservation({
      observation: obs,
      session,
      task: 'Fill in my name and email on this form, but do not submit it.',
      mode: 'balanced',
      stateToken: 'S1234567890' as unknown as StateToken,
      requestSpanRects: async () => ({ stale: true }),
    });

    expect(result.payload).toBeDefined();
    expect(result.payload.size).toBeGreaterThan(0);
  });
});
