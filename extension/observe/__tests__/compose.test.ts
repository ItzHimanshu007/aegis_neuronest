import { describe, expect, it } from 'vitest';
import { composeObservation, type FrameComposeInput } from '../compose';
import type { RawElement, RawMedia, RawTextBlock } from '../types';

function makeElement(overrides: Partial<Omit<RawElement, 'eid' | 'fpOrdinal'>>): Omit<RawElement, 'eid' | 'fpOrdinal'> {
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
  it('composes observations without inventing element IDs', () => {
    const inputs: FrameComposeInput[] = [
      { frameId: 0, offsetChain: [], elements: [makeElement({ fp: 'a' }), makeElement({ fp: 'b' })], media: [], textBlocks: [] },
    ];
    const result = composeObservation(inputs);
    expect(result.elements.map((e) => e.eid)).toEqual([undefined, undefined]);
  });

  it('assigns fpOrdinal within each frame so other-frame insertions cannot change EIDs', () => {
    const inputs: FrameComposeInput[] = [
      { frameId: 0, offsetChain: [], elements: [makeElement({ fp: 'dup' })], media: [], textBlocks: [] },
      { frameId: 1, offsetChain: [{ x: 0, y: 0, scale: 1 }], elements: [makeElement({ fp: 'dup', frameId: 1 })], media: [], textBlocks: [] },
    ];
    const result = composeObservation(inputs);
    expect(result.elements.map((e) => e.fpOrdinal)).toEqual([0, 0]);
  });

  it('offsets element, media and text block rects into top-level coordinates', () => {
    const media: RawMedia[] = [{ kind: 'img', bbox: { x: 1, y: 1, width: 2, height: 2 }, alt: '', title: '', srcFilename: '', visible: true, frameId: 1 }];
    const textBlocks: RawTextBlock[] = [{ blockRef: '1:0', text: 'x', lineRects: [{ x: 1, y: 1, width: 2, height: 2 }], bbox: { x: 1, y: 1, width: 2, height: 2 }, role: 'generic', frameId: 1, privacyAttrs: [] }];
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

  it('remaps independently harvested child frame identities without colliding with the top frame', () => {
    const inputs: FrameComposeInput[] = [0, 2].map(frameId => ({
      frameId, offsetChain: [], elements: [makeElement({ fp: 'dup', frameId: 0 })],
      media: [{ kind: 'img', bbox: { x: 0, y: 0, width: 1, height: 1 }, alt: '', title: '', srcFilename: '', visible: true, frameId: 0 }],
      textBlocks: [{ blockRef: '0:0', text: '', lineRects: [], bbox: { x: 0, y: 0, width: 1, height: 1 }, role: 'generic', frameId: 0, privacyAttrs: [] }],
    }));
    const result = composeObservation(inputs);
    expect(result.elements.map(el => [el.frameId, el.fpOrdinal])).toEqual([[0, 0], [2, 0]]);
    expect(result.media.map(m => m.frameId)).toEqual([0, 2]);
    expect(result.textBlocks.map(t => [t.frameId, t.blockRef])).toEqual([[0, '0:0'], [2, '2:0']]);
  });
});
