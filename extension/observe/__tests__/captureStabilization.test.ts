/**
 * Regression tests for the real-browser "state: failed, steps: 0" failure on live Jotform pages.
 *
 * Root cause: background.ts's capture stabilization loop required a perfect
 * mutationCounter match between harvest and screenshot. Live Jotform forms have
 * continuous DOM mutations (validation watchers, analytics, JS-driven effects),
 * so every one of the 3 retries failed → hard throw → run() catch → state='failed', steps=0.
 *
 * Fix: always record the last complete capture candidate; use it (best-effort)
 * when all retries exhaust without a clean match instead of throwing.
 *
 * These tests exercise the stateTokensEqual contract and the best-effort fallback
 * logic in isolation, without WXT browser APIs.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Inline the exact stateTokensEqual function from entrypoints/background.ts
// so we pin the contract at the point where the real bug lived.
// ---------------------------------------------------------------------------

interface StateToken {
  mutationCounter: number;
  scrollX: number;
  scrollY: number;
  dpr: number;
  visualScale: number;
  innerWidth: number;
  innerHeight: number;
}

function stateTokensEqual(a: StateToken, b: StateToken): boolean {
  return (
    a.mutationCounter === b.mutationCounter &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.dpr === b.dpr &&
    a.visualScale === b.visualScale &&
    a.innerWidth === b.innerWidth &&
    a.innerHeight === b.innerHeight
  );
}

function makeToken(overrides: Partial<StateToken> = {}): StateToken {
  return { mutationCounter: 0, scrollX: 0, scrollY: 0, dpr: 1, visualScale: 1, innerWidth: 1280, innerHeight: 800, ...overrides };
}

describe('stateTokensEqual — real-browser stabilization contract', () => {
  it('matches identical tokens', () => {
    const t = makeToken({ mutationCounter: 42 });
    expect(stateTokensEqual(t, { ...t })).toBe(true);
  });

  it('rejects when mutationCounter differs by 1 — the exact failure on live Jotform', () => {
    // A SINGLE DOM mutation between harvest and screenshot increments mutationCounter.
    // On a Jotform form, this happens within the ~500ms captureVisibleTab window.
    const before = makeToken({ mutationCounter: 10 });
    const after  = makeToken({ mutationCounter: 11 }); // one attribute mutation fired
    expect(stateTokensEqual(before, after)).toBe(false);
  });

  it('rejects when scroll position changed', () => {
    expect(stateTokensEqual(makeToken({ scrollY: 0 }), makeToken({ scrollY: 1 }))).toBe(false);
  });

  it('rejects when viewport resized', () => {
    expect(stateTokensEqual(makeToken({ innerWidth: 1280 }), makeToken({ innerWidth: 1440 }))).toBe(false);
  });

  it('accepts when all fields are equal even with non-zero mutationCounter', () => {
    const t = makeToken({ mutationCounter: 999, scrollX: 100, scrollY: 200, dpr: 2 });
    expect(stateTokensEqual(t, { ...t })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Best-effort fallback contract (the fix).
//
// The logic extracted from the fixed background.ts loop:
//   - Every iteration records the last complete candidate regardless of token match.
//   - A cleanMatch flag tracks whether a perfect match was achieved.
//   - After the loop, if !cleanMatch but a candidate exists, it is used.
//   - A hard throw only fires when no usable candidate was produced at all.
// ---------------------------------------------------------------------------

interface CaptureCandidate {
  dataUrl: string;
  stateToken: StateToken;
  captureId: string;
}

/**
 * Simulates the fixed background.ts loop in pure logic form (no WXT APIs).
 */
function runCaptureLoop(
  attempts: Array<{ harvestToken: StateToken; afterToken: StateToken; dataUrl: string }>,
  domOnly: boolean,
): { candidate: CaptureCandidate; cleanMatch: boolean } {
  let candidate: CaptureCandidate | null = null;
  let cleanMatch = false;

  for (const attempt of attempts) {
    // Always record — this is the fix; the old code only recorded on a clean match.
    candidate = { dataUrl: attempt.dataUrl, stateToken: attempt.afterToken, captureId: `id-${Math.random()}` };

    if (stateTokensEqual(attempt.harvestToken, attempt.afterToken)) {
      cleanMatch = true;
      break;
    }
  }

  // Hard throw only when there is genuinely nothing usable.
  if ((!domOnly && !candidate?.dataUrl) || !candidate) {
    throw new Error(`Capture did not stabilize after ${attempts.length} attempts`);
  }

  return { candidate, cleanMatch };
}

describe('best-effort capture fallback — the real-browser fix', () => {
  it('uses the clean candidate when the state token matches on the first try', () => {
    const t = makeToken({ mutationCounter: 5 });
    const result = runCaptureLoop(
      [{ harvestToken: t, afterToken: { ...t }, dataUrl: 'data:image/png;base64,AAA' }],
      false,
    );
    expect(result.cleanMatch).toBe(true);
    expect(result.candidate.dataUrl).toBeTruthy();
  });

  it('falls back to best-effort when all 3 retries have token mismatches (the Jotform case)', () => {
    // Every attempt sees at least one mutation — exactly what Jotform's continuous DOM activity
    // produces. Before the fix this threw. After the fix it returns the last candidate.
    const attempts = [
      { harvestToken: makeToken({ mutationCounter: 0 }), afterToken: makeToken({ mutationCounter: 1 }), dataUrl: 'data:image/png;base64,AAA' },
      { harvestToken: makeToken({ mutationCounter: 1 }), afterToken: makeToken({ mutationCounter: 2 }), dataUrl: 'data:image/png;base64,BBB' },
      { harvestToken: makeToken({ mutationCounter: 2 }), afterToken: makeToken({ mutationCounter: 3 }), dataUrl: 'data:image/png;base64,CCC' },
    ];
    const result = runCaptureLoop(attempts, false);
    expect(result.cleanMatch).toBe(false);
    expect(result.candidate.dataUrl).toBe('data:image/png;base64,CCC'); // last candidate used
  });

  it('uses the first clean match and stops retrying', () => {
    const attempts = [
      { harvestToken: makeToken({ mutationCounter: 0 }), afterToken: makeToken({ mutationCounter: 1 }), dataUrl: 'data:image/png;base64,MISS' },
      { harvestToken: makeToken({ mutationCounter: 1 }), afterToken: makeToken({ mutationCounter: 1 }), dataUrl: 'data:image/png;base64,HIT' },
      { harvestToken: makeToken({ mutationCounter: 2 }), afterToken: makeToken({ mutationCounter: 3 }), dataUrl: 'data:image/png;base64,NEVER' },
    ];
    const result = runCaptureLoop(attempts, false);
    expect(result.cleanMatch).toBe(true);
    expect(result.candidate.dataUrl).toBe('data:image/png;base64,HIT');
  });

  it('still throws when no screenshot was produced at all (captureVisibleTab failed every time)', () => {
    // Preserves the guard against a truly unusable capture.
    const attempts = [
      { harvestToken: makeToken({ mutationCounter: 0 }), afterToken: makeToken({ mutationCounter: 1 }), dataUrl: '' },
    ];
    expect(() => runCaptureLoop(attempts, false)).toThrow('Capture did not stabilize');
  });

  it('does not throw for domOnly captures with token mismatch — no screenshot needed', () => {
    // domOnly paths never produce a screenshot; the empty dataUrl is expected.
    const attempts = [
      { harvestToken: makeToken({ mutationCounter: 0 }), afterToken: makeToken({ mutationCounter: 1 }), dataUrl: '' },
    ];
    const result = runCaptureLoop(attempts, true);
    expect(result.cleanMatch).toBe(false);
    expect(result.candidate).toBeTruthy();
  });
});
