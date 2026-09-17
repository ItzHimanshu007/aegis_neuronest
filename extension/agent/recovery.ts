import { AEGIS_CONFIG } from '../shared/config';
import type { HistoryEntry } from '../shared/schema/payload.v2';
export type FailureCode = NonNullable<HistoryEntry['code']>;

/** Contains only digests/fingerprints and counters. Never retains action text or page values. */
export class Recovery {
  streak = 0;
  noProgress = 0;
  replans = 0;
  private repeats = new Map<string, number>();
  record(action: string, fp: string, digest: string, pass: boolean): FailureCode | undefined {
    const key = `${action}:${fp}:${digest}`;
    const count = (this.repeats.get(key) ?? 0) + 1;
    this.repeats.set(key, count);
    if (pass) { this.noProgress = 0; this.streak = 0; }
    else this.noProgress++;
    if (count >= AEGIS_CONFIG.LOOP_REPEAT_N) return 'LOOP_DETECTED';
    if (this.noProgress >= AEGIS_CONFIG.NO_PROGRESS_N) return 'NO_PROGRESS';
    return undefined;
  }
  decide(code: FailureCode): 'replan' | 'ask_user' {
    this.streak++;
    if (code === 'BUDGET_EXHAUSTED' || code === 'LOOP_DETECTED' || code === 'NO_PROGRESS' || this.streak > AEGIS_CONFIG.MAX_REPLANS) return 'ask_user';
    this.replans++;
    return 'replan';
  }
  retry(): void { this.streak = 0; this.noProgress = 0; this.repeats.clear(); }
}
