import { describe, expect, it } from 'vitest';
import { explainEvidence } from '../PrivacyPreview';
import { parseSealed, countTokens, tallyCategories, tallyLayers } from '../PrivacyReceipt';
import type { PreviewDetection } from '../../../agentHost';

/**
 * The privacy receipt's rendering itself needs a real browser (canvas-derived images, DOM) and is
 * exercised by the Playwright e2e demo path (Part C) — same split this repo already uses for
 * canvas/DOM-dependent code (see `redactor.ts`/`faceModel.ts`'s own test docblocks). This covers
 * the pure logic: parsing the exact sealed bytes back into displayable data, and tallying
 * detections for the category/layer summaries.
 */

function det(overrides: Partial<PreviewDetection> = {}): PreviewDetection {
  return {
    id: 'd1',
    category: 'EMAIL',
    sources: ['rule'],
    confidence: 0.9,
    certainty: 'detected',
    action: 'FILL',
    targetKind: 'element',
    targetRef: 'fp-1',
    rectCount: 1,
    ...overrides,
  };
}

describe('parseSealed', () => {
  it('extracts the image, elements and redactions from the exact sealed bytes', () => {
    const draftJson = JSON.stringify({
      image: 'data:image/png;base64,AAAA',
      elements: [{ eid: 'E0', role: 'textbox', label: 'Full name' }],
      redactions: [{ rid: 'r1', kind: 'FILL', type: 'NAME' }],
    });
    expect(parseSealed(draftJson)).toEqual({
      image: 'data:image/png;base64,AAAA',
      elements: [{ eid: 'E0', role: 'textbox', label: 'Full name' }],
      redactions: [{ rid: 'r1', kind: 'FILL', type: 'NAME' }],
    });
  });

  it('defaults missing arrays to empty rather than throwing, for a text-only (no image) draft', () => {
    const draftJson = JSON.stringify({ session: 'sess-1' });
    expect(parseSealed(draftJson)).toEqual({ image: undefined, elements: [], redactions: [] });
  });

  it('returns null for unparsable JSON rather than throwing', () => {
    expect(parseSealed('not json')).toBeNull();
  });
});

describe('countTokens', () => {
  it('counts every well-formed token, and nothing else', () => {
    const draftJson = 'Hello [[PII:NAME:abc23456]] your email is [[PII:EMAIL:zzzz2222]].';
    expect(countTokens(draftJson)).toBe(2);
  });

  it('returns zero when there are no tokens', () => {
    expect(countTokens(JSON.stringify({ elements: [] }))).toBe(0);
  });
});

describe('tallyCategories', () => {
  it('counts non-ALLOW detections by category, most frequent first', () => {
    const detections = [det({ category: 'EMAIL' }), det({ category: 'EMAIL' }), det({ category: 'NAME' })];
    expect(tallyCategories(detections)).toEqual([
      ['EMAIL', 2],
      ['NAME', 1],
    ]);
  });

  it('excludes ALLOW detections — nothing was redacted, so it should not count as a redaction', () => {
    const detections = [det({ category: 'CITY', action: 'ALLOW' }), det({ category: 'EMAIL' })];
    expect(tallyCategories(detections)).toEqual([['EMAIL', 1]]);
  });
});

describe('tallyLayers', () => {
  it('counts each source a detection carries, most frequent first', () => {
    const detections = [det({ sources: ['rule'] }), det({ sources: ['rule', 'field_context'] }), det({ sources: ['visual'] })];
    expect(tallyLayers(detections)).toEqual([
      ['rule', 2],
      ['field_context', 1],
      ['visual', 1],
    ]);
  });

  it('excludes ALLOW detections', () => {
    const detections = [det({ sources: ['visual'], action: 'ALLOW' })];
    expect(tallyLayers(detections)).toEqual([]);
  });
});

describe('Stage 7H: explainEvidence', () => {
  it('turns signal names into plain language', () => {
    expect(explainEvidence(['checksum_pass', 'inline_label_bound']))
      .toBe('why: passes its checksum · a nearby label names it');
  });

  it('explains negative evidence too, so an absent detection is also accountable', () => {
    expect(explainEvidence(['non_pii_container'])).toContain('reference/catalogue');
  });

  it('never echoes a raw signal name it does not recognise', () => {
    expect(explainEvidence(['something_new'])).toBe('');
    expect(explainEvidence([])).toBe('');
  });
});
