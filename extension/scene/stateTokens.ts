import type { StateToken } from '../shared/messages';
import type { SceneGraph, StateTokenId } from './types';
export interface SealedState {
  capture_id: string; origin: string; StateToken: StateToken; sceneRef: SceneGraph;
  screenDecision: SceneGraph['screen']; screenEpoch: number;
}
export class StateTokens {
  private readonly sealed = new Map<StateTokenId, SealedState>();
  latest?: StateTokenId;
  mint(): StateTokenId {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const id = `S${Array.from(bytes, b => alphabet[b & 31]).join('')}` as StateTokenId;
    if (this.sealed.has(id)) return this.mint();
    return id;
  }
  /** Commit only after firewall.seal succeeds. */
  commit(scene: SceneGraph): void {
    if (this.sealed.has(scene.state_token)) throw new Error('State token already sealed');
    this.sealed.set(scene.state_token, { capture_id: scene.capture_id, origin: scene.page.origin, StateToken: { ...scene.local.stateToken }, sceneRef: scene, screenDecision: { ...scene.screen }, screenEpoch: scene.screenEpoch });
    this.latest = scene.state_token;
    // Old tokens need not retain raw scenes. Unknown old tokens also reject as stale.
    for (const key of this.sealed.keys()) if (key !== this.latest) this.sealed.delete(key);
  }
  get(id: string): SealedState | undefined { return this.sealed.get(id as StateTokenId); }
  clear(): void { this.sealed.clear(); this.latest = undefined; }
}
