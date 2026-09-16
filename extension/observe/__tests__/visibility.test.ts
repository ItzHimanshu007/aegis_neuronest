import { describe, expect, it } from 'vitest';
import { computeHitOk, computeVisibility, type StyleLike, type StyleReader } from '../visibility';

function reader(styles: Map<Element, Partial<StyleLike>>): StyleReader {
  return {
    getStyle(el: Element): StyleLike {
      const s = styles.get(el) ?? {};
      return { display: 'block', visibility: 'visible', opacity: '1', ...s };
    },
  };
}

function makeChain(depth: number): { leaf: HTMLElement; chain: HTMLElement[] } {
  const chain: HTMLElement[] = [];
  let parent: HTMLElement | null = null;
  for (let i = 0; i < depth; i++) {
    const el = document.createElement('div');
    if (parent) parent.appendChild(el);
    chain.push(el);
    parent = el;
  }
  document.body.appendChild(chain[0]!);
  return { leaf: chain[chain.length - 1]!, chain };
}

const fullRect = { x: 0, y: 0, width: 100, height: 20 };

describe('computeVisibility', () => {
  it('reports visible for a plain, on-screen element', () => {
    const { leaf } = makeChain(1);
    const result = computeVisibility(leaf, {
      reader: reader(new Map()),
      getRect: () => fullRect,
      viewport: { width: 800, height: 600 },
    });
    expect(result).toEqual({ visible: true, reason: 'visible' });
  });

  it('detects display:none on an ancestor', () => {
    const { leaf, chain } = makeChain(3);
    const styles = new Map<Element, Partial<StyleLike>>([[chain[0]!, { display: 'none' }]]);
    const result = computeVisibility(leaf, { reader: reader(styles), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result).toEqual({ visible: false, reason: 'display-none' });
  });

  it('detects visibility:hidden', () => {
    const { leaf } = makeChain(1);
    const styles = new Map<Element, Partial<StyleLike>>([[leaf, { visibility: 'hidden' }]]);
    const result = computeVisibility(leaf, { reader: reader(styles), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('visibility-hidden');
  });

  it('detects content-visibility:hidden', () => {
    const { leaf } = makeChain(1);
    const styles = new Map<Element, Partial<StyleLike>>([[leaf, { contentVisibility: 'hidden' }]]);
    const result = computeVisibility(leaf, { reader: reader(styles), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('content-visibility-hidden');
  });

  it('treats near-zero cumulative opacity as hidden', () => {
    const { leaf, chain } = makeChain(2);
    const styles = new Map<Element, Partial<StyleLike>>([
      [chain[0]!, { opacity: '0.2' }],
      [chain[1]!, { opacity: '0.2' }],
    ]);
    const result = computeVisibility(leaf, { reader: reader(styles), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('opacity-zero'); // 0.2 * 0.2 = 0.04 < default epsilon 0.05
  });

  it('does not flag genuinely-translucent elements as hidden', () => {
    const { leaf } = makeChain(1);
    const styles = new Map<Element, Partial<StyleLike>>([[leaf, { opacity: '0.3' }]]);
    const result = computeVisibility(leaf, { reader: reader(styles), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.visible).toBe(true);
  });

  it('detects zero size', () => {
    const { leaf } = makeChain(1);
    const result = computeVisibility(leaf, {
      reader: reader(new Map()),
      getRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      viewport: { width: 800, height: 600 },
    });
    expect(result.reason).toBe('zero-size');
  });

  it('detects an element fully outside the viewport', () => {
    const { leaf } = makeChain(1);
    const result = computeVisibility(leaf, {
      reader: reader(new Map()),
      getRect: () => ({ x: -9999, y: 0, width: 40, height: 20 }),
      viewport: { width: 800, height: 600 },
    });
    expect(result.reason).toBe('outside-viewport');
  });

  it('detects aria-hidden on the element itself', () => {
    const { leaf } = makeChain(1);
    leaf.setAttribute('aria-hidden', 'true');
    const result = computeVisibility(leaf, { reader: reader(new Map()), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('aria-hidden');
  });

  it('detects aria-hidden on an ancestor', () => {
    const { leaf, chain } = makeChain(3);
    chain[0]!.setAttribute('aria-hidden', 'true');
    const result = computeVisibility(leaf, { reader: reader(new Map()), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('aria-hidden');
  });

  it('detects an inert ancestor', () => {
    const { leaf, chain } = makeChain(2);
    chain[0]!.setAttribute('inert', '');
    const result = computeVisibility(leaf, { reader: reader(new Map()), getRect: () => fullRect, viewport: { width: 800, height: 600 } });
    expect(result.reason).toBe('inert');
  });

  it('detects clipping by an overflow:hidden ancestor with a non-overlapping rect', () => {
    const { leaf, chain } = makeChain(2);
    const rects = new Map<Element, { x: number; y: number; width: number; height: number }>([
      [chain[0]!, { x: 0, y: 0, width: 100, height: 20 }],
      [leaf, { x: 200, y: 0, width: 40, height: 20 }], // outside the ancestor's box
    ]);
    const styles = new Map<Element, Partial<StyleLike>>([[chain[0]!, { display: 'block' } as Partial<StyleLike>]]);
    // getComputedStyleSafe inside computeVisibility calls the REAL getComputedStyle for the
    // overflow check (not the injected reader) — happy-dom supports basic inline style reads.
    chain[0]!.style.overflow = 'hidden';
    const result = computeVisibility(leaf, {
      reader: reader(styles),
      getRect: (el) => rects.get(el) ?? fullRect,
      viewport: { width: 800, height: 600 },
    });
    expect(result.reason).toBe('clipped');
  });
});

describe('computeHitOk', () => {
  it('returns undefined when elementFromPoint is unavailable (documented happy-dom gap)', () => {
    const { leaf } = makeChain(1);
    const fakeDoc = { elementFromPoint: undefined } as unknown as Document;
    expect(computeHitOk(leaf, fullRect, fakeDoc)).toBeUndefined();
  });

  it('returns true when elementFromPoint resolves to the element itself', () => {
    const { leaf } = makeChain(1);
    const fakeDoc = { elementFromPoint: () => leaf } as unknown as Document;
    expect(computeHitOk(leaf, fullRect, fakeDoc)).toBe(true);
  });

  it('returns false when elementFromPoint resolves to an unrelated element', () => {
    const { leaf } = makeChain(1);
    const other = document.createElement('div');
    const fakeDoc = { elementFromPoint: () => other } as unknown as Document;
    expect(computeHitOk(leaf, fullRect, fakeDoc)).toBe(false);
  });
});
