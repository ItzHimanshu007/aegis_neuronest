import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForSettle } from '../settle';

describe('waitForSettle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after quietMs with no mutations', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const promise = waitForSettle(document, { quietMs: 300, maxMs: 3000 });
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result.settledBy).toBe('quiet');
    expect(result.mutationCount).toBe(0);
  });

  it('restarts the quiet timer on each mutation, up to maxMs', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;
    const promise = waitForSettle(document, { quietMs: 300, maxMs: 1000 });

    // Mutate just before the quiet timer would fire, twice, to prove it resets.
    await vi.advanceTimersByTimeAsync(200);
    root.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(200);
    root.appendChild(document.createElement('span'));

    // Now let it actually go quiet.
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result.settledBy).toBe('quiet');
    expect(result.mutationCount).toBeGreaterThanOrEqual(2);
  });

  it('gives up at maxMs if mutations never stop', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;
    const interval = setInterval(() => {
      root.appendChild(document.createElement('span'));
    }, 100);

    const promise = waitForSettle(document, { quietMs: 300, maxMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.settledBy).toBe('max-timeout');
    clearInterval(interval);
  });
});
