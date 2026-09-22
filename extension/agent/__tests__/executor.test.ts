import { describe, expect, it, beforeEach } from 'vitest';
import { executeLocal, hasValidationError, type ExecutionRequest } from '../executor';
import type { Action } from '../../shared/schema/plan.v2';

/**
 * The content-script executor had no unit coverage at all — it was only ever exercised indirectly
 * through the Chromium e2e suite.
 *
 * SCOPE, deliberately: happy-dom has no layout engine, so every harvested element comes back with
 * a zero bbox and `visible: false`, and `reacquire()` refuses those (`NOT_VISIBLE`) before the
 * executor ever touches the element. That makes every target-bound path — the native-setter write,
 * the value read-back, the per-category guards — unreachable here, and faking visibility would
 * only prove the fake. Those are covered against a real browser instead: `task-requirements.spec.ts`
 * drives the native-setter write through a genuinely controlled React-style input, and
 * `task-kyc.spec.ts` covers rehydration into both an empty and an already-filled field.
 *
 * What is testable without layout, and covered here: the pure validation-error predicate, and the
 * refusals the executor makes BEFORE it resolves a target.
 */
const signal = new AbortController().signal;
const ORIGIN = 'http://localhost:3000'; // happy-dom's document origin
const request = (action: Action, overrides: Partial<ExecutionRequest> = {}): ExecutionRequest =>
  ({ action, origin: ORIGIN, approved: false, ...overrides });

beforeEach(() => { document.body.innerHTML = ''; });

describe('hasValidationError', () => {
  it.each([
    ['an explicitly invalid field', '<form><input id="t" aria-invalid="true" /></form>', true],
    ['an alert anywhere in the form', '<form><input id="t" /><p role="alert">Required</p></form>', true],
    ['a described-by node naming an error', '<form><input id="t" aria-describedby="e" /><span id="e">Email is invalid</span></form>', true],
    ['a described-by node that is hidden', '<form><input id="t" aria-describedby="e" /><span id="e" hidden>Email is invalid</span></form>', false],
    ['a described-by node with ordinary help text', '<form><input id="t" aria-describedby="e" /><span id="e">We never share this</span></form>', false],
    ['a clean form', '<form><input id="t" /></form>', false],
  ])('%s', (_name, html, expected) => {
    document.body.innerHTML = html;
    expect(hasValidationError(document, document.getElementById('t') as HTMLElement)).toBe(expected);
  });

  it('looks no further than the target own form', () => {
    document.body.innerHTML = '<form id="a"><input id="t" /></form><form id="b"><p role="alert">Required</p></form>';
    expect(hasValidationError(document, document.getElementById('t') as HTMLElement)).toBe(false);
  });
});

describe('executeLocal: refusals made before a target is resolved', () => {
  it('refuses to act on a document that is no longer the consented origin', async () => {
    await expect(executeLocal(request({ action: 'click' } as Action, { origin: 'https://elsewhere.test' }), 's', signal))
      .rejects.toThrow('NEW_SCREEN');
  });

  it.each([
    ['a non-http scheme', 'javascript:alert(1)'],
    ['a different origin without approval', 'https://elsewhere.test/x'],
  ])('refuses navigation to %s', async (_name, url) => {
    await expect(executeLocal(request({ action: 'navigate', url } as Action), 's', signal))
      .rejects.toThrow('CONSENT_DENIED');
  });

  it('refuses an action it does not implement', async () => {
    await expect(executeLocal(request({ action: 'nonsense' } as unknown as Action), 's', signal))
      .rejects.toThrow('EXEC_FAILED');
  });

  it('refuses a type with no target at all', async () => {
    await expect(executeLocal(request({ action: 'type' } as Action, { rawText: 'x', category: 'EMAIL' }), 's', signal))
      .rejects.toThrow('TARGET_MISSING');
  });

  it('stops waiting when the task is aborted', async () => {
    const controller = new AbortController();
    const pending = executeLocal(request({ action: 'wait', ms: 2000 } as Action), 's', controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/Stopped/);
  });

  it('refuses everything once the task is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(executeLocal(request({ action: 'scroll' } as Action), 's', controller.signal)).rejects.toThrow();
  });
});
