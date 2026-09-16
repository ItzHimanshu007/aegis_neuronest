/**
 * The agent loop: seal -> send -> plan -> validate -> approve -> reacquire -> re-hydrate ->
 * execute -> expect check -> repeat. TODO(stage-3): implement end to end.
 */

export async function runAgentLoop(_task: string): Promise<never> {
  throw new Error('NotImplemented: agent/runAgentLoop.ts lands in Stage 3');
}
