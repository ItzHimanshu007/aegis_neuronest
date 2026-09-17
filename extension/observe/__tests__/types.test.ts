import { describe, expect, it } from 'vitest';
import { markLocalOnly, toDebugJSON, type RawObservation } from '../types';

function makeObservation(overrides: Partial<RawObservation> = {}): RawObservation {
  return {
    capture_id: 'c1',
    ts: 1234,
    url: 'http://localhost:5174/kyc.html',
    title: 'Aegis Demo - KYC Verification',
    viewport: { cssW: 1280, cssH: 800, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [{ frameId: 0, parentFrameId: null, url: 'http://localhost:5174/kyc.html', mapping: 'top' }],
    elements: [
      {
            fp: 'abcd1234',
        fpOrdinal: 0,
        frameId: 0,
        tag: 'input',
        role: 'textbox',
        name: 'Password',
        labelText: 'Password',
        inputType: 'password',
        value: 'hunter22-super-secret',
        hasValue: true,
        states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
        bbox: { x: 0, y: 0, width: 100, height: 20 },
        lineRects: [{ x: 0, y: 0, width: 100, height: 20 }],
        visible: true,
        visibilityReason: 'visible',
        hiddenInteractive: false,
        hitOk: true,
        privacyAttrs: ['type-password'],
        inShadow: 'none',
      },
    ],
    media: [],
    textBlocks: [{ blockRef: '0:0', text: 'Some paragraph text that should only appear as a length', lineRects: [], bbox: { x: 0, y: 0, width: 0, height: 0 }, role: 'generic', frameId: 0, privacyAttrs: [] }],
    screenshot: { dataUrl: 'data:image/png;base64,AAAA', pxW: 100, pxH: 100, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 1, harvestMs: 2, captureMs: 3, totalMs: 6 },
    counts: { elements: 1, visibleElements: 1, hiddenInteractive: 0, media: 0, textBlocks: 1, frames: 1 },
    ...overrides,
  };
}

describe('toDebugJSON', () => {
  it('never includes the raw element value (field names like "hasValue"/"valueLenBucket" are fine — only the actual secret text is checked for)', () => {
    const obs = markLocalOnly(makeObservation());
    const json = JSON.stringify(toDebugJSON(obs));
    expect(json).not.toContain('hunter22');
    expect(json).not.toContain('super-secret');
  });

  it('never includes the raw url, title, or text block text', () => {
    const obs = markLocalOnly(makeObservation());
    const json = JSON.stringify(toDebugJSON(obs));
    expect(json).not.toContain('kyc.html');
    expect(json).not.toContain('KYC Verification');
    expect(json).not.toContain('Some paragraph text');
  });

  it('replaces text fields with their length instead', () => {
    const obs = markLocalOnly(makeObservation());
    const debug = toDebugJSON(obs) as { urlLength: number; titleLength: number; elements: Array<{ nameLength: number }> };
    expect(debug.urlLength).toBe('http://localhost:5174/kyc.html'.length);
    expect(debug.titleLength).toBe('Aegis Demo - KYC Verification'.length);
    expect(debug.elements[0]!.nameLength).toBe('Password'.length);
  });

  it('still includes structural, non-sensitive fields', () => {
    const obs = markLocalOnly(makeObservation());
    const debug = toDebugJSON(obs) as { counts: unknown; timings: unknown; elements: Array<{ fp: string; role: string }> };
    expect(debug.counts).toBeDefined();
    expect(debug.timings).toBeDefined();
    expect(debug.elements[0]!.fp).toBe('abcd1234');
    expect(debug.elements[0]!.role).toBe('textbox');
  });
});
