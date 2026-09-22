import { describe, expect, it, beforeEach } from 'vitest';
import { reacquire, type LocalTarget } from '../reacquire';
import { harvestFrame } from '../../observe/harvester';
import { assignFpOrdinals } from '../../observe/fingerprint';
import type { EID } from '../../scene';

/**
 * Reacquisition is what makes invariant 6 real: the server names an EID, and the client finds that
 * element again, itself, from a fresh harvest. It had no unit coverage. Every case here is a
 * REFUSAL, which is the half that matters — a wrong or stale target must never resolve to some
 * other element that happens to be nearby.
 *
 * happy-dom has no layout, so nothing harvests as visible. That is why these assert the refusals
 * rather than a successful reacquisition; the success path runs against real Chromium in the e2e
 * suite (`task-kyc.spec.ts`, `frames.spec.ts`, `task-requirements.spec.ts`).
 */
const SALT = 's';
const ORIGIN = 'http://localhost:3000';
const target = (overrides: Partial<LocalTarget> = {}): LocalTarget =>
  ({ eid: 'E1' as EID, fp: 'unknown-fp', fpOrdinal: 0, framePath: [], origin: ORIGIN, ambiguous: false, level: 2, ...overrides });

/** The real harvested facts for the page's first input — a hand-written fp can never match. */
function harvested() {
  return assignFpOrdinals(harvestFrame({ salt: SALT, frameId: 0 }).elements).find(e => e.tag === 'input')!;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('reacquire', () => {
  it('refuses a fingerprint that is not on the page any more', () => {
    document.body.innerHTML = '<label for="t">Email address</label><input id="t" type="email" />';
    expect(() => reacquire(target(), SALT)).toThrow('TARGET_MISSING');
  });

  it('refuses an ordinal beyond the matching elements', () => {
    document.body.innerHTML = '<label for="t">Email address</label><input id="t" type="email" />';
    expect(() => reacquire(target({ fp: harvested().fp, fpOrdinal: 7 }), SALT)).toThrow('TARGET_MISSING');
  });

  it('refuses a frame path that leads nowhere', () => {
    document.body.innerHTML = '<label for="t">Email address</label><input id="t" type="email" />';
    expect(() => reacquire(target({ framePath: [3] }), SALT)).toThrow('TARGET_MISSING');
  });

  it('refuses a document whose origin is not the one the target was captured on', () => {
    document.body.innerHTML = '<label for="t">Email address</label><input id="t" type="email" />';
    expect(() => reacquire(target({ origin: 'https://elsewhere.test' }), SALT)).toThrow('NEW_SCREEN');
  });

  // The element is found, and still refused: an element the client cannot confirm is on screen is
  // not one it will act on. Fail-closed, and the reason the executor's target-bound paths cannot
  // be unit-tested without layout.
  it('refuses an element it cannot confirm is visible', () => {
    document.body.innerHTML = '<label for="t">Email address</label><input id="t" type="email" />';
    const el = harvested();
    expect(() => reacquire(target({ fp: el.fp, fpOrdinal: el.fpOrdinal, nodeRef: el.nodeRef }), SALT)).toThrow('NOT_VISIBLE');
  });

  // An ambiguous target is refused outright at L3+, rather than guessing between candidates.
  it('refuses to guess between duplicates for a consequential action', () => {
    document.body.innerHTML = '<label for="a">Email address</label><input id="a" type="email" /><label for="b">Email address</label><input id="b" type="email" />';
    const el = harvested();
    expect(() => reacquire(target({ fp: el.fp, fpOrdinal: el.fpOrdinal, nodeRef: 'a-stale-ref', ambiguous: true, level: 3 }), SALT))
      .toThrow('AMBIGUOUS_TARGET');
  });
});
