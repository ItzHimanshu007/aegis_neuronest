import { describe, expect, it } from 'vitest';
import { runDetectionCascade } from '../../index';
import { computeVerhoeffCheckDigit } from '../../rules/checksums';
import { markLocalOnly, type Observation, type RawElement, type RawTextBlock } from '../../../../observe/types';

/**
 * Stage 7 through the REAL cascade, both arms.
 *
 * Every case is stated as a BASELINE-vs-STAGE-7 pair rather than as a bare assertion, because the
 * claim Stage 7 makes is a delta: these are values the pre-Stage-7 cascade did not protect.
 */

const PROSE_LEAD = 'Thank you for your request. Our records currently show ';

function block(over: Partial<RawTextBlock> & { blockRef: string; text: string }): RawTextBlock {
  return { lineRects: [], bbox: { x: 0, y: 0, width: 400, height: 20 }, role: 'generic', frameId: 0, privacyAttrs: [], ...over };
}

function element(over: Partial<RawElement> & { fp: string }): RawElement {
  return {
    fpOrdinal: 0, frameId: 0, tag: 'input', role: 'textbox', name: '', labelText: '',
    hasValue: true, states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 0, y: 0, width: 200, height: 24 }, lineRects: [], visible: true, visibilityReason: 'visible',
    hiddenInteractive: false, privacyAttrs: [], inShadow: 'none', ...over,
  };
}

function observation(over: { textBlocks?: RawTextBlock[]; elements?: RawElement[] }): Observation {
  const textBlocks = over.textBlocks ?? [];
  const elements = over.elements ?? [];
  return markLocalOnly({
    capture_id: 'c1', ts: 0, url: 'http://localhost:5174/p.html', title: 'p',
    viewport: { cssW: 800, cssH: 600, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [{ frameId: 0, parentFrameId: null, url: 'http://localhost:5174/p.html', mapping: 'top' }],
    elements, media: [], textBlocks,
    screenshot: { dataUrl: '', pxW: 800, pxH: 600, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 0, harvestMs: 0, captureMs: 0, totalMs: 0 },
    counts: { elements: elements.length, visibleElements: elements.length, hiddenInteractive: 0, media: 0, textBlocks: textBlocks.length, frames: 1 },
  });
}

async function arms(obs: Observation) {
  const run = async (evidenceLayerEnabled: boolean) => {
    const result = await runDetectionCascade({ observation: obs, evidenceLayerEnabled });
    return {
      categories: result.detections.map((d) => d.category),
      detections: result.detections,
      stats: result.evidenceStats,
    };
  };
  return { baseline: await run(false), stage7: await run(true) };
}

describe('Stage 7 — unlabelled and mis-structured values the baseline missed', () => {
  it('binds a label in running prose that the ^-anchored pattern could not reach', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: `${PROSE_LEAD}Account number for credit: 5853936029031980. Please contact the branch.` })] });
    const { baseline, stage7 } = await arms(obs);
    expect(baseline.categories).not.toContain('BANK_ACCOUNT');
    expect(stage7.categories).toContain('BANK_ACCOUNT');
  });

  it('binds every pair in a multi-value paragraph', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: `${PROSE_LEAD}Amount payable: ₹18,948.52, and Registered name: Joseph Bose.` })] });
    const { baseline, stage7 } = await arms(obs);
    expect(baseline.categories).toEqual([]);
    expect(stage7.categories).toEqual(expect.arrayContaining(['FINANCIAL_VALUE', 'NAME']));
  });

  it('detects a currency amount from its own shape with no dictionary label anywhere', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: 'Closing figure 14,205.10', sectionHeading: 'Account summary' }), block({ blockRef: '0:1', text: '₹14,205.10', sectionHeading: 'Account summary' })] });
    const { baseline, stage7 } = await arms(obs);
    expect(baseline.categories).not.toContain('FINANCIAL_VALUE');
    expect(stage7.categories).toContain('FINANCIAL_VALUE');
  });

  it('detects a value in a field whose name/id is random, via input semantics', async () => {
    const obs = observation({ elements: [element({ fp: 'f1', nameAttr: 'x7f2qa', inputType: 'number', value: '560001', structure: { maxLength: 6, inputMode: 'numeric', sectionHeading: 'Delivery address' }, autocomplete: 'postal-code' })] });
    const { stage7 } = await arms(obs);
    expect(stage7.categories).toContain('PIN_CODE');
  });

  it('classifies an unlabelled voter-ID shape as UNCERTAIN, not as a confident claim', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: 'ABC1234567' })] });
    const { stage7 } = await arms(obs);
    const hit = stage7.detections.find((d) => d.category === 'VOTER_ID');
    expect(hit?.certainty).toBe('uncertain');
  });
});

describe('Stage 7D — precision is held on the committed train corpus negatives', () => {
  it('leaves an unlabelled reference-number section alone', async () => {
    // Verbatim construct from demo-portal/generated/train/banking-101.html.
    const obs = observation({
      textBlocks: [
        block({ blockRef: '0:0', text: `${PROSE_LEAD}735547520627, and SKU-2027-788, and ₹4533.00.`, sectionHeading: 'Recent reference numbers' }),
      ],
    });
    const { stage7 } = await arms(obs);
    expect(stage7.categories).toEqual([]);
  });

  it('still detects the same shapes when the section is not bookkeeping', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: 'Balance: ₹4533.00', sectionHeading: 'Account summary' })] });
    const { stage7 } = await arms(obs);
    expect(stage7.categories).toContain('FINANCIAL_VALUE');
  });

  it('does not let an uncertain candidate downgrade a confident detection on the same span', async () => {
    const valid = `2234567890${computeVerhoeffCheckDigit('2234567890')}`;
    const digits = `${valid}${computeVerhoeffCheckDigit(valid)}`.slice(0, 12);
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: `Aadhaar: ${digits}` })] });
    const { stage7 } = await arms(obs);
    for (const d of stage7.detections.filter((x) => x.category === 'AADHAAR')) {
      expect(d.certainty).toBe('detected');
    }
  });
});

describe('Stage 7M/7O — the layer reports its own counters', () => {
  it('counts candidates, detections and uncertains, and measures itself', async () => {
    const obs = observation({ textBlocks: [block({ blockRef: '0:0', text: 'ABC1234567 and ₹1,200.00', sectionHeading: 'Account summary' })] });
    const { baseline, stage7 } = await arms(obs);
    expect(baseline.stats).toEqual({ candidates: 0, detected: 0, uncertain: 0, ms: 0 });
    expect(stage7.stats.candidates).toBeGreaterThan(0);
    expect(stage7.stats.detected + stage7.stats.uncertain).toBeGreaterThan(0);
    expect(stage7.stats.ms).toBeGreaterThanOrEqual(0);
  });
});
