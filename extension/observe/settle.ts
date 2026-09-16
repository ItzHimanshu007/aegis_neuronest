/**
 * "Settle" wait (Stage 1 Part D.2): resolves once the DOM has gone `SETTLE_QUIET_MS` without a
 * mutation, or `SETTLE_MAX_MS` has elapsed, whichever comes first. Also waits for
 * `document.readyState === "complete"` first, so we don't start the quiet-timer mid-navigation.
 *
 * Takes injectable timer functions so it's unit-testable with vitest's fake timers.
 */

export interface SettleOptions {
  quietMs: number;
  maxMs: number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface SettleResult {
  settledBy: 'quiet' | 'max-timeout';
  mutationCount: number;
  waitedMs: number;
}

export async function waitForSettle(doc: Document, options: SettleOptions): Promise<SettleResult> {
  const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
  const start = Date.now();

  await waitForReadyState(doc);

  return new Promise<SettleResult>((resolve) => {
    let mutationCount = 0;
    let quietTimer: ReturnType<typeof setTimeoutFn> | null = null;

    const finish = (settledBy: SettleResult['settledBy']) => {
      observer.disconnect();
      if (quietTimer !== null) clearTimeoutFn(quietTimer);
      clearTimeoutFn(maxTimer);
      resolve({ settledBy, mutationCount, waitedMs: Date.now() - start });
    };

    const armQuietTimer = () => {
      if (quietTimer !== null) clearTimeoutFn(quietTimer);
      quietTimer = setTimeoutFn(() => finish('quiet'), options.quietMs);
    };

    const observer = new MutationObserver(() => {
      mutationCount++;
      armQuietTimer();
    });
    observer.observe(doc.documentElement ?? doc, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const maxTimer = setTimeoutFn(() => finish('max-timeout'), options.maxMs);
    armQuietTimer();
  });
}

function waitForReadyState(doc: Document): Promise<void> {
  if (doc.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (doc.readyState === 'complete') {
        doc.removeEventListener('readystatechange', onChange);
        resolve();
      }
    };
    doc.addEventListener('readystatechange', onChange);
  });
}
