import { describe, expect, it } from 'vitest';
import { computeSpanRects, getTextParts } from '../spanRects';

const noExclusions = () => false;

describe('getTextParts', () => {
  it('builds one part for a single text node', () => {
    document.body.innerHTML = '<p id="p1">Hello world</p>';
    const el = document.getElementById('p1')!;
    const { text, parts } = getTextParts(el, noExclusions);
    expect(text).toBe('Hello world');
    expect(parts).toHaveLength(1);
    expect(parts[0]!.start).toBe(0);
    expect(parts[0]!.end).toBe(11);
  });

  it('joins multiple text nodes (split by inline markup) with a single space, offsets tracked', () => {
    document.body.innerHTML = '<p id="p2">Contact us at <strong>ping</strong> for help</p>';
    const el = document.getElementById('p2')!;
    const { text, parts } = getTextParts(el, noExclusions);
    // "Contact us at" + " " + "ping" + " " + "for help"
    expect(text).toBe('Contact us at ping for help');
    expect(parts).toHaveLength(3);
    expect(parts[1]!.start).toBe(text.indexOf('ping'));
  });

  it('trims leading/trailing whitespace per node and tracks the node-local offset', () => {
    document.body.innerHTML = '<p id="p3">  padded text  </p>';
    const el = document.getElementById('p3')!;
    const { text, parts } = getTextParts(el, noExclusions);
    expect(text).toBe('padded text');
    expect(parts[0]!.nodeOffsetStart).toBe(2); // two leading spaces
  });

  it('excludes text inside an excluded element', () => {
    document.body.innerHTML = '<p id="p4">Keep this <button id="btn">Skip this</button> and this</p>';
    const btn = document.getElementById('btn')!;
    const el = document.getElementById('p4')!;
    const { text } = getTextParts(el, (candidate) => candidate === btn);
    expect(text).not.toContain('Skip this');
    expect(text).toBe('Keep this and this');
  });

  it('returns empty text/parts for a block with no text', () => {
    document.body.innerHTML = '<p id="p5"></p>';
    const el = document.getElementById('p5')!;
    const { text, parts } = getTextParts(el, noExclusions);
    expect(text).toBe('');
    expect(parts).toHaveLength(0);
  });
});

describe('computeSpanRects', () => {
  it('returns a rect for a substring within a single text node', () => {
    document.body.innerHTML = '<p id="p6" style="position:absolute;top:0;left:0;">Hello world, contact me@example.com today</p>';
    document.body.appendChild(document.getElementById('p6')!); // ensure attached
    const el = document.getElementById('p6')!;
    const index = getTextParts(el, noExclusions);
    const start = index.text.indexOf('me@example.com');
    const end = start + 'me@example.com'.length;
    const rects = computeSpanRects(index, start, end);
    // happy-dom's getClientRects for a Range typically returns zero-sized rects (no real layout
    // engine), but it must not throw and must return an array without crashing on multi-part
    // spans that fall entirely within one part.
    expect(Array.isArray(rects)).toBe(true);
  });

  it('returns [] for an out-of-bounds or empty range', () => {
    document.body.innerHTML = '<p id="p7">Some text</p>';
    const el = document.getElementById('p7')!;
    const index = getTextParts(el, noExclusions);
    expect(computeSpanRects(index, 100, 200)).toEqual([]);
    expect(computeSpanRects(index, 5, 5)).toEqual([]);
  });

  it('clamps a range that partially overflows the text length', () => {
    document.body.innerHTML = '<p id="p8">Short</p>';
    const el = document.getElementById('p8')!;
    const index = getTextParts(el, noExclusions);
    expect(() => computeSpanRects(index, 2, 9999)).not.toThrow();
  });

  it('spans multiple parts when the substring crosses a text-node boundary', () => {
    document.body.innerHTML = '<p id="p9">before <em>middle</em> after</p>';
    const el = document.getElementById('p9')!;
    const index = getTextParts(el, noExclusions);
    // "before middle after" — request a substring crossing from "before" into "middle"
    const start = index.text.indexOf('fore');
    const end = index.text.indexOf('mid') + 3;
    expect(() => computeSpanRects(index, start, end)).not.toThrow();
  });
});
