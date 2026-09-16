import { describe, expect, it, vi } from 'vitest';
import { CoalescingQueue, RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  it('allows calls immediately while under the limit', () => {
    const now = 0;
    const limiter = new RateLimiter(2, () => now);
    expect(limiter.msUntilNextSlot()).toBe(0);
    limiter.record();
    expect(limiter.msUntilNextSlot()).toBe(0);
    limiter.record();
    // Now at the limit (2 calls within the last second).
    expect(limiter.msUntilNextSlot()).toBeGreaterThan(0);
  });

  it('reports the wait time until the oldest call expires', () => {
    let now = 0;
    const limiter = new RateLimiter(1, () => now);
    limiter.record(); // at t=0
    now = 400;
    expect(limiter.msUntilNextSlot()).toBe(600); // must wait until t=1000
  });

  it('evicts calls older than 1 second', () => {
    let now = 0;
    const limiter = new RateLimiter(1, () => now);
    limiter.record(); // t=0
    now = 1500;
    expect(limiter.msUntilNextSlot()).toBe(0);
  });

  it('never exceeds CAPTURE_MAX_PER_SEC calls within any rolling second', () => {
    let now = 0;
    const maxPerSecond = 2;
    const limiter = new RateLimiter(maxPerSecond, () => now);
    const callTimes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const wait = limiter.msUntilNextSlot();
      now += wait;
      limiter.record();
      callTimes.push(now);
    }
    // For every 1-second window, no more than maxPerSecond calls should fall inside it.
    for (const t of callTimes) {
      const inWindow = callTimes.filter((c) => c > t - 1000 && c <= t).length;
      expect(inWindow).toBeLessThanOrEqual(maxPerSecond);
    }
  });
});

describe('CoalescingQueue', () => {
  it('runs a single enqueued call', async () => {
    const run = vi.fn(async (n: number) => n * 2);
    const queue = new CoalescingQueue(run);
    const result = await queue.enqueue(21);
    expect(result).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('coalesces requests that arrive while one is already queued', async () => {
    // A mutable object (rather than a re-assigned `let`) sidesteps TypeScript narrowing the
    // captured variable to `null` at the closure boundary.
    const state: { resolveFirst: (() => void) | null } = { resolveFirst: null };
    const started: number[] = [];
    const run = vi.fn(async (n: number) => {
      started.push(n);
      if (started.length === 1) {
        await new Promise<void>((resolve) => {
          state.resolveFirst = resolve;
        });
      }
      return n;
    });
    const queue = new CoalescingQueue(run);

    const p1 = queue.enqueue(1); // starts running immediately
    // These arrive while p1 is in flight — they should coalesce into a single follow-up call
    // with the LAST args, not one call per enqueue.
    const p2 = queue.enqueue(2);
    const p3 = queue.enqueue(3);

    await Promise.resolve(); // let the queue observe args 2 and 3
    state.resolveFirst?.();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(1);
    expect(r2).toBe(3); // both later callers get the result of the single coalesced run(3) call
    expect(r3).toBe(3);
    expect(run).toHaveBeenCalledTimes(2); // once for 1, once (coalesced) for 3
  });
});
