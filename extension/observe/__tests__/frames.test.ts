import { describe, expect, it } from 'vitest';
import { composeToTopLevel, offsetRect } from '../frames';

describe('offsetRect', () => {
  it('translates by x/y', () => {
    expect(offsetRect({ x: 10, y: 20, width: 5, height: 5 }, { x: 100, y: 200, scale: 1 })).toEqual({
      x: 110,
      y: 220,
      width: 5,
      height: 5,
    });
  });

  it('scales position and size together', () => {
    expect(offsetRect({ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 0, scale: 2 })).toEqual({
      x: 20,
      y: 20,
      width: 40,
      height: 40,
    });
  });
});

describe('composeToTopLevel', () => {
  it('applies an empty chain as a no-op', () => {
    const rect = { x: 5, y: 5, width: 10, height: 10 };
    expect(composeToTopLevel(rect, [])).toEqual(rect);
  });

  it('applies offsets innermost-first, accumulating', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    // A nested iframe at (50,50) inside an iframe at (100,100) inside the top frame.
    const chain = [
      { x: 50, y: 50, scale: 1 },
      { x: 100, y: 100, scale: 1 },
    ];
    expect(composeToTopLevel(rect, chain)).toEqual({ x: 150, y: 150, width: 10, height: 10 });
  });
});
