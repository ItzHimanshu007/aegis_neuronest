/** Pure task lifecycle. Illegal transitions are bugs, never silently ignored. */
export const TASK_STATES = ['idle', 'consenting', 'observing', 'planning', 'checking', 'awaiting_approval', 'executing', 'verifying', 'recovering', 'asking_user', 'done', 'failed', 'stopped'] as const;
export type TaskState = typeof TASK_STATES[number];
const NEXT: Record<TaskState, readonly TaskState[]> = {
  idle: ['observing'], consenting: ['observing', 'checking'], observing: ['consenting', 'planning', 'checking', 'verifying', 'recovering'],
  planning: ['checking', 'recovering'], checking: ['awaiting_approval', 'executing', 'verifying', 'observing', 'asking_user', 'done', 'failed', 'recovering'],
  // 'observing': after an approval, runAgentLoop.ts re-observes before re-checking the action —
  // the page may have changed while the human was deciding, and it must never execute from a
  // stale snapshot. Missing here, this transition threw on every single approved action, which
  // crashed the whole task to 'failed' right after Approve — found by actually driving an L5
  // approval through the real agent loop (Stage 3B Part II), not by a unit test alone: the pure
  // reducer's own tests exercised 'awaiting_approval' only via 'checking', never via the
  // observe-after-approval path runAgentLoop.ts actually takes.
  awaiting_approval: ['checking', 'executing', 'recovering', 'consenting', 'observing'], executing: ['observing', 'verifying', 'recovering'],
  verifying: ['checking', 'observing', 'recovering', 'done'], recovering: ['observing', 'asking_user', 'failed'],
  asking_user: ['observing', 'failed', 'done'], done: [], failed: [], stopped: [],
};
export function taskReducer(state: TaskState, next: TaskState): TaskState {
  if (state === next) return state;
  if (['done', 'failed', 'stopped'].includes(state)) throw new Error('Task already ended');
  if (next === 'stopped' || NEXT[state].includes(next)) return next;
  throw new Error(`Invalid task transition: ${state} -> ${next}`);
}

/** Abort races an operation and checks again on completion. A late result is never consumed. */
export async function cancellable<T>(signal: AbortSignal, operation: Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let listener: () => void = () => {};
  try {
    const result = await Promise.race([operation, new Promise<never>((_, reject) => {
      listener = () => reject(new DOMException('Task stopped', 'AbortError'));
      signal.addEventListener('abort', listener, { once: true });
    })]);
    signal.throwIfAborted();
    return result;
  } finally { signal.removeEventListener('abort', listener); }
}
