import { describe, expect, it } from 'vitest';
import { runDetectionCascade } from '../index';
import { markLocalOnly, type Observation, type RawTextBlock } from '../../../observe/types';

/**
 * The cascade's labelled-value fallback and block-level privacy tags (Stage 2 Part C).
 *
 * Both exist because the rules alone see only the value. A `<dt>Blood group</dt><dd>O positive</dd>`
 * pair, a `<th scope="row">City</th><td>Bengaluru</td>` row and a `data-private` wrapper all
 * declare their own sensitivity, and no regex will ever match what is inside them.
 */

function block(overrides: Partial<RawTextBlock> & { blockRef: string; text: string }): RawTextBlock {
  return {
    lineRects: [],
    bbox: { x: 0, y: 0, width: 100, height: 20 },
    role: 'generic',
    frameId: 0,
    privacyAttrs: [],
    ...overrides,
  };
}

function observationWith(textBlocks: RawTextBlock[]): Observation {
  return markLocalOnly({
    capture_id: 'c1',
    ts: 0,
    url: 'http://localhost:5174/zoo.html',
    title: 'zoo',
    viewport: { cssW: 800, cssH: 600, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [{ frameId: 0, parentFrameId: null, url: 'http://localhost:5174/zoo.html', mapping: 'top' }],
    elements: [],
    media: [],
    textBlocks,
    screenshot: { dataUrl: 'data:image/png;base64,AAAA', pxW: 800, pxH: 600, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 0, harvestMs: 0, captureMs: 0, totalMs: 0 },
    counts: { elements: 0, visibleElements: 0, hiddenInteractive: 0, media: 0, textBlocks: textBlocks.length, frames: 1 },
  });
}

function categoriesFor(blockRef: string, obs: Observation): string[] {
  return runDetectionCascade({ observation: obs, task: '' })
    .detections.filter((d) => d.target.kind === 'text_span' && d.target.ref === blockRef)
    .map((d) => d.category);
}

describe('labelled-value fallback', () => {
  it('flags a <dd> whose <dt> names the category, with no rule match at all', () => {
    const obs = observationWith([
      block({ blockRef: '0:0', text: 'Blood group', role: 'term' }),
      block({ blockRef: '0:1', text: 'O positive', role: 'definition' }),
    ]);
    expect(categoriesFor('0:1', obs)).toContain('HEALTH');
  });

  it('flags a table cell whose row header names the category', () => {
    const obs = observationWith([
      block({ blockRef: '0:0', text: 'City', role: 'rowheader' }),
      block({ blockRef: '0:1', text: 'Bengaluru', role: 'cell' }),
    ]);
    expect(categoriesFor('0:1', obs)).toContain('CITY');
  });

  it('flags a labelled value the rule rejects — the label outranks a failing checksum', () => {
    const obs = observationWith([block({ blockRef: '0:0', text: 'Aadhaar: 2345 6789 0128' })]);
    expect(categoriesFor('0:0', obs)).toContain('AADHAAR');
  });

  it('does not flag an unlabelled block', () => {
    const obs = observationWith([block({ blockRef: '0:0', text: 'Shipping is free above 499.' })]);
    expect(categoriesFor('0:0', obs)).toEqual([]);
  });
});

describe('block-level privacy tags', () => {
  it('flags a block inside a data-private wrapper', () => {
    const obs = observationWith([block({ blockRef: '0:0', text: 'Anything at all.', privacyAttrs: ['data-private'] })]);
    expect(categoriesFor('0:0', obs)).toContain('PRIVATE_GENERIC');
  });

  it('flags a session-replay-masked block', () => {
    const obs = observationWith([block({ blockRef: '0:0', text: 'Masked in replay.', privacyAttrs: ['rr-mask'] })]);
    expect(categoriesFor('0:0', obs)).toContain('PRIVATE_GENERIC');
  });
});
