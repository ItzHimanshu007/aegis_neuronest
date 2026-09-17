/** Pure task lifecycle. Illegal transitions are bugs, never silently ignored. */
export const TASK_STATES = ['idle', 'consenting', 'observing', 'planning', 'checking', 'awaiting_approval', 'executing', 'verifying', 'recovering', 'asking_user', 'done', 'failed', 'stopped'] as const;
export type TaskState = typeof TASK_STATES[number];
const NEXT: Record<TaskState, readonly TaskState[]> = {
  idle: ['observing'], consenting: ['observing', 'checking'], observing: ['consenting', 'planning', 'checking', 'verifying', 'recovering'],
  planning: ['checking', 'recovering'], checking: ['awaiting_approval', 'executing', 'verifying', 'observing', 'asking_user', 'done', 'failed', 'recovering'],
  awaiting_approval: ['checking', 'executing', 'recovering', 'consenting'], executing: ['observing', 'verifying', 'recovering'],
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
