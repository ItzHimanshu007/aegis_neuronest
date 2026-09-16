/**
 * Capture throttle (Stage 1 Part D.3): never exceed `AEGIS_CONFIG.CAPTURE_MAX_PER_SEC` calls to
 * `tabs.captureVisibleTab` per second (matches Chrome's own default quota — exceeding it fails
 * the call outright). A simple token bucket, with an injectable clock so it's unit-testable
 * without real timers.
 */

export class RateLimiter {
  private readonly maxPerSecond: number;
  private readonly now: () => number;
  private timestamps: number[] = [];

  constructor(maxPerSecond: number, now: () => number = () => Date.now()) {
    this.maxPerSecond = maxPerSecond;
    this.now = now;
  }

  /** How long (ms) the caller must wait before it's safe to make another call, right now. 0 means
   * "go ahead immediately". Does not reserve a slot — call `record()` once the call is made. */
  msUntilNextSlot(): number {
    const now = this.now();
    this.evictOld(now);
    if (this.timestamps.length < this.maxPerSecond) return 0;
    const oldest = this.timestamps[0]!;
    return Math.max(0, oldest + 1000 - now);
  }

  /** Records that a call was made at (approximately) now. */
  record(): void {
    this.timestamps.push(this.now());
  }

  private evictOld(now: number): void {
    const cutoff = now - 1000;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }
}

/**
 * A queue that coalesces duplicate/rapid capture requests: if a request comes in while another is
 * already queued (but not yet started), the newer one replaces it rather than piling up (Part
 * D.3: "Queue requests and coalesce duplicates"). Only one request is ever in flight or queued at
 * a time.
 */
export class CoalescingQueue<TArgs, TResult> {
  private pendingArgs: TArgs | null = null;
  private pendingResolvers: Array<{ resolve: (r: TResult) => void; reject: (e: unknown) => void }> = [];
  private running = false;

  constructor(private readonly run: (args: TArgs) => Promise<TResult>) {}

  enqueue(args: TArgs): Promise<TResult> {
    this.pendingArgs = args;
    return new Promise<TResult>((resolve, reject) => {
      this.pendingResolvers.push({ resolve, reject });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pendingArgs !== null) {
        const args = this.pendingArgs;
        const resolvers = this.pendingResolvers;
        this.pendingArgs = null;
        this.pendingResolvers = [];
        try {
          const result = await this.run(args);
          for (const r of resolvers) r.resolve(result);
        } catch (err) {
          for (const r of resolvers) r.reject(err);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
