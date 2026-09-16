import { describe, expect, it } from 'vitest';
import { composeObservation, type FrameComposeInput } from '../compose';
import type { RawElement, RawMedia, RawTextBlock } from '../types';

function makeElement(overrides: Partial<Omit<RawElement, 'mark_id' | 'fpOrdinal'>>): Omit<RawElement, 'mark_id' | 'fpOrdinal'> {
  return {
    fp: 'aaaaaaaa',
    frameId: 0,
    tag: 'input',
    role: 'textbox',
    name: 'Name',
    labelText: 'Name',
    hasValue: false,
    states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    lineRects: [{ x: 0, y: 0, width: 10, height: 10 }],
    visible: true,
    visibilityReason: 'visible',
    hiddenInteractive: false,
    privacyAttrs: [],
    inShadow: 'none',
    ...overrides,
  };
}

describe('composeObservation', () => {
  it('assigns sequential mark_ids in input order', () => {
    const inputs: FrameComposeInput[] = [
      { frameId: 0, offsetChain: [], elements: [makeElement({ fp: 'a' }), makeElement({ fp: 'b' })], media: [], textBlocks: [] },
    ];
    const result = composeObservation(inputs);
    expect(result.elements.map((e) => e.mark_id)).toEqual([0, 1]);
  });

  it('assigns fpOrdinal across the whole composed list, not per frame', () => {
    const inputs: FrameComposeInput[] = [
      { frameId: 0, offsetChain: [], elements: [makeElement({ fp: 'dup' })], media: [], textBlocks: [] },
      { frameId: 1, offsetChain: [{ x: 0, y: 0, scale: 1 }], elements: [makeElement({ fp: 'dup', frameId: 1 })], media: [], textBlocks: [] },
    ];
    const result = composeObservation(inputs);
    expect(result.elements.map((e) => e.fpOrdinal)).toEqual([0, 1]);
  });

  it('offsets element, media and text block rects into top-level coordinates', () => {
    const media: RawMedia[] = [{ kind: 'img', bbox: { x: 1, y: 1, width: 2, height: 2 }, alt: '', title: '', srcFilename: '', visible: true, frameId: 1 }];
    const textBlocks: RawTextBlock[] = [{ text: 'x', lineRects: [{ x: 1, y: 1, width: 2, height: 2 }], bbox: { x: 1, y: 1, width: 2, height: 2 }, role: 'generic', frameId: 1 }];
    const inputs: FrameComposeInput[] = [
      {
        frameId: 1,
        offsetChain: [{ x: 100, y: 200, scale: 1 }],
        elements: [makeElement({ bbox: { x: 1, y: 1, width: 2, height: 2 }, lineRects: [{ x: 1, y: 1, width: 2, height: 2 }], frameId: 1 })],
        media,
        textBlocks,
      },
    ];
    const result = composeObservation(inputs);
    expect(result.elements[0]!.bbox).toEqual({ x: 101, y: 201, width: 2, height: 2 });
    expect(result.elements[0]!.lineRects[0]).toEqual({ x: 101, y: 201, width: 2, height: 2 });
    expect(result.media[0]!.bbox).toEqual({ x: 101, y: 201, width: 2, height: 2 });
    expect(result.textBlocks[0]!.bbox).toEqual({ x: 101, y: 201, width: 2, height: 2 });
  });

  it('handles an empty input list', () => {
    const result = composeObservation([]);
    expect(result).toEqual({ elements: [], media: [], textBlocks: [] });
  });
});
