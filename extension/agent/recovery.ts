import { AEGIS_CONFIG } from '../shared/config';
import type { HistoryEntry } from '../shared/schema/payload.v2';
export type FailureCode = NonNullable<HistoryEntry['code']>;

/**
 * What each failure code means, in words, for the question dialog the panel raises when the loop
 * gives up (runAgentLoop.ts -> TaskUI.ask). The raw code is still appended to that sentence: it is
 * the only handle a user has for reporting a stuck task, and `e2e/agent-malicious.spec.ts` asserts
 * on it directly to prove WHICH rejection blocked a malicious plan.
 */
export const FAILURE_REASON: Record<FailureCode, string> = {
  STALE_PLAN: 'the page changed while the server was still thinking',
  INVALID_SCHEMA: 'the server sent back something Aegis could not read',
  PLAN_STEPS_REPEATED: 'the server keeps proposing the same steps',
  NEW_SCREEN: 'the page changed underneath it',
  TARGET_MISSING: 'the thing it wanted is no longer on the page',
  FP_MISMATCH: 'the thing it wanted is not the same thing any more',
  AMBIGUOUS_TARGET: 'there is more than one thing matching, so it will not guess',
  NOT_VISIBLE: 'the thing it wanted is not on screen',
  NOT_HITTABLE: 'something is covering the thing it wanted to use',
  DISABLED: 'the thing it wanted is switched off on this page',
  TOKEN_TYPE_MISMATCH: 'that field does not accept the kind of value it holds',
  TOKEN_IN_URL: 'it tried to put one of your values in a web address, which is never allowed',
  TOKEN_IN_KEY: 'it tried to put one of your values somewhere it is never allowed',
  TOKEN_OUTSIDE_TYPE: 'it tried to use one of your values outside of typing, which is never allowed',
  UNSUPPORTED_URL: 'it tried to open an address Aegis will not follow',
  NEVER_AUTOMATED: 'that value is one Aegis will never type for you',
  CONSENT_DENIED: 'it needs something you did not allow',
  APPROVAL_SKIPPED: 'you skipped the step it needed',
  EXEC_FAILED: 'the page did not respond the way it expected',
  EXEC_UNTRUSTED_REJECTED: 'the page tried to answer for something Aegis never asked it',
  VALUE_MISMATCH: 'what ended up in the field is not what it meant to type',
  EXPECT_FAILED: 'the page did not end up the way the step promised',
  UNVERIFIABLE: 'it cannot confirm whether that worked',
  DONE_UNVERIFIED: 'it says it is finished but cannot show that it is',
  BUDGET_EXHAUSTED: 'it has used up the time and steps allowed for one task',
  LOOP_DETECTED: 'it is going round in circles',
  NO_PROGRESS: 'it is not getting anywhere',
  CONTEXT_DENIED: 'it asked to see more of the page than it is allowed',
  NETWORK_ERROR: 'it could not reach the server',
  STOPPED: 'the task was stopped',
  USER_HINT: 'it is working from the hint you gave',
  USER_RETRY: 'it is trying again at your request',
  MODEL_FAILED: 'the model could not come up with a next step',
};

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
