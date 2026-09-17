import { TOKEN_PATTERN } from '../shared/schema/tokens';
import type { Action } from '../shared/schema/plan.v2';
import type { SceneElement } from '../scene';
import type { PrivacySession } from '../agentHost/session';

/** Resolved only immediately before the local type message; never retained. */
export function rehydrate(action: Action, element: SceneElement, session: PrivacySession, origin: string): string {
  if (action.action !== 'type') throw new Error('TOKEN_OUTSIDE_TYPE');
  return (action.text ?? '').replace(new RegExp(TOKEN_PATTERN.source, 'g'), token => session.vault.resolve(token, {
    actionType: 'type', fieldCategory: element.fieldCategory, fieldInputType: element.inputType,
    origin, consentedOrigins: session.consentedOrigins,
  }));
}
