import { AEGIS_CONFIG } from '../shared/config';
export interface ReplayOptions { mode: 'eval' | 'judge'; localDirectory: string; expiresAt: number; encryption?: 'session-key' }
export interface ReplayRecorder { stopAndDelete(): Promise<void> }
export function startReplay(_options: ReplayOptions): never {
  if (!AEGIS_CONFIG.REPLAY_RECORDING) throw new Error('Replay recording is disabled');
  // TODO(stage-4): Eval/Judge-only local, auto-deleted replay with optional encryption.
  throw new Error('NotImplemented: replay recording lands in Stage 4');
}
