/** Stage 2.5 pure checks. Executor/Recovery invoke these in Stage 3. */
import validatePlan from '../privacy/generated/planValidator.js';
import type { Action, PlanV2 } from '../shared/schema/plan.v2';
import { TOKEN_PATTERN } from '../shared/schema/tokens';
import { classifyAction, tokenCategories, type AuthorityContext } from '../authority';
import type { SceneGraph, EID } from '../scene';
import type { StateTokens, SealedState } from '../scene/stateTokens';
export type CheckReason = 'STALE_PLAN' | 'INVALID_SCHEMA' | 'PLAN_STEPS_REPEATED' | 'NEW_SCREEN' | 'TARGET_MISSING' | 'FP_MISMATCH' | 'AMBIGUOUS_TARGET' | 'NOT_VISIBLE' | 'NOT_HITTABLE' | 'DISABLED' | 'TOKEN_TYPE_MISMATCH' | 'TOKEN_IN_URL' | 'TOKEN_IN_KEY' | 'TOKEN_OUTSIDE_TYPE' | 'UNSUPPORTED_URL' | 'NEVER_AUTOMATED';
export interface PlanSession { stateTokens: StateTokens; planStepsSeen?: boolean }
export type PlanCheck = { ok: true; plan: PlanV2; context: SealedState } | { ok: false; reason: CheckReason };
export function checkPlan(value: unknown, session: PlanSession): PlanCheck {
  if (!validatePlan(value)) return { ok: false, reason: 'INVALID_SCHEMA' };
  const plan = value as PlanV2;
  const context = session.stateTokens.get(plan.state_token);
  if (!context || session.stateTokens.latest !== plan.state_token) return { ok: false, reason: 'STALE_PLAN' };
  if (plan.plan_steps && session.planStepsSeen) return { ok: false, reason: 'PLAN_STEPS_REPEATED' };
  if ('plan' in plan) {
    for (const action of plan.plan) {
      const reason = forbiddenContent(action);
      if (reason) return { ok: false, reason };
    }
  }
  return { ok: true, plan, context };
}
function forbiddenContent(action: Action): CheckReason | undefined {
  if (action.url && TOKEN_PATTERN.test(action.url)) return 'TOKEN_IN_URL';
  if (action.value && TOKEN_PATTERN.test(action.value)) return 'TOKEN_OUTSIDE_TYPE';
  if (action.key && TOKEN_PATTERN.test(action.key)) return 'TOKEN_IN_KEY';
  if (action.action === 'navigate') {
    try { if (!['http:', 'https:'].includes(new URL(action.url!).protocol)) return 'UNSUPPORTED_URL'; }
    catch { return 'UNSUPPORTED_URL'; }
  }
  return undefined;
}
export type ActionCheck = { verdict: 'PASS'; level: ReturnType<typeof classifyAction>['level']; requiresUser: boolean } | { verdict: 'DROP_REMAINING' | 'ABORT_BATCH'; reason: CheckReason };
export function checkAction(action: Action, planContext: SealedState & { authority?: AuthorityContext }, currentScene: SceneGraph): ActionCheck {
  if (currentScene.page.origin !== planContext.origin || currentScene.session_id !== planContext.sceneRef.session_id || currentScene.screenEpoch !== planContext.screenEpoch) return { verdict: 'DROP_REMAINING', reason: 'NEW_SCREEN' };
  const envelope = { schema: 'aegis/2', state_token: currentScene.state_token, plan: [action] };
  if (!validatePlan(envelope)) return { verdict: 'ABORT_BATCH', reason: 'INVALID_SCHEMA' };
  const forbidden = forbiddenContent(action);
  if (forbidden) return { verdict: 'ABORT_BATCH', reason: forbidden };
  const el = action.target ? currentScene.elements.get(action.target.eid as EID) : undefined;
  if (action.target && !el) return { verdict: 'ABORT_BATCH', reason: 'TARGET_MISSING' };
  if (el && el.fp !== action.target?.fp) return { verdict: 'ABORT_BATCH', reason: 'FP_MISMATCH' };
  const authority = classifyAction(action, el, planContext.authority ?? { origin: currentScene.page.origin, consentedCategories: new Set() });
  if (el?.ambiguous && Number(authority.level.slice(1)) >= 3) return { verdict: 'ABORT_BATCH', reason: 'AMBIGUOUS_TARGET' };
  if (el && ['click', 'type'].includes(action.action)) {
    if (!el.visible) return { verdict: 'ABORT_BATCH', reason: 'NOT_VISIBLE' };
    if (!el.hitOk) return { verdict: 'ABORT_BATCH', reason: 'NOT_HITTABLE' };
    if (el.states.disabled) return { verdict: 'ABORT_BATCH', reason: 'DISABLED' };
  }
  if (el && action.action === 'type') {
    if (['OTP', 'CVV', 'UPI_PIN', 'SECRET'].includes(el.fieldCategory ?? '')) return { verdict: 'ABORT_BATCH', reason: 'NEVER_AUTOMATED' };
    const tokens = [...(action.text ?? '').matchAll(new RegExp(TOKEN_PATTERN.source, 'g'))];
    if (tokens.length) {
      const categories = tokenCategories(action.text);
      if (categories.length !== tokens.length || categories.some(c => c !== el.fieldCategory) || (categories.includes('PASSWORD') && el.inputType !== 'password')) return { verdict: 'ABORT_BATCH', reason: 'TOKEN_TYPE_MISMATCH' };
    }
  }
  return { verdict: 'PASS', level: authority.level, requiresUser: authority.requiresUser };
}
