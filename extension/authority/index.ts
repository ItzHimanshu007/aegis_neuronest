import type { Action } from '../shared/schema/plan.v2';
import type { SceneElement } from '../scene';
import type { Category } from '../privacy/categoryTypes';
import { ALL_CATEGORIES } from '../privacy/categoryTypes';
import { classOf } from '../privacy/policy';
import { AUTHORITY_DEFAULTS } from '../privacy/policyData';
import { TOKEN_PATTERN } from '../shared/schema/tokens';
import { normalizeLabel } from '../privacy/detect/labels';

export type AuthorityLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export interface AuthorityContext { origin: string; consentedCategories: ReadonlySet<Category> }
export interface AuthorityVerdict { level: AuthorityLevel; reasons: string[]; requiresUser: boolean }
export function tokenCategories(text = ''): Category[] {
  return [...text.matchAll(new RegExp(TOKEN_PATTERN.source, 'g'))].map(m => m[0].split(':')[1]!).filter((c): c is Category => ALL_CATEGORIES.includes(c as Category));
}
function commitLabel(label: string): boolean {
  const normalized = ` ${normalizeLabel(label)} `;
  return AUTHORITY_DEFAULTS.commit_words.some(word => normalized.includes(` ${normalizeLabel(word)} `));
}
export function classifyAction(action: Action, element: SceneElement | undefined, ctx: AuthorityContext): AuthorityVerdict {
  const verdict = (level: AuthorityLevel, reason: string, requiresUser = false): AuthorityVerdict => ({ level, reasons: [reason], requiresUser });
  const kind = action.action;
  if (['wait', 'scroll', 'ask_user', 'done', 'fail'].includes(kind)) return verdict('L0', 'NO_DIRECT_CHANGE');
  if (kind === 'navigate') {
    if (TOKEN_PATTERN.test(action.url ?? '')) return verdict('L5', 'TOKEN_IN_URL', true);
    try {
      const url = new URL(action.url ?? '', ctx.origin);
      if (!['http:', 'https:'].includes(url.protocol)) return verdict('L5', 'UNSUPPORTED_URL', true);
      return verdict('L1', url.origin === ctx.origin ? 'SAME_ORIGIN' : 'CROSS_ORIGIN', url.origin !== ctx.origin && AUTHORITY_DEFAULTS.cross_origin_requires_user);
    } catch { return verdict('L5', 'INVALID_URL', true); }
  }
  if (kind === 'click' && element) {
    if (element.download || element.formAction || ['submit', 'image'].includes(element.inputType ?? '') ||
        (element.tag === 'button' && element.inForm && (!element.buttonType || element.buttonType === 'submit')) || commitLabel(element.labelSanitized)) {
      return verdict('L5', 'COMMIT', AUTHORITY_DEFAULTS.commit_requires_user);
    }
    if (element.inForm && element.role === 'button' && (element.ambiguous || !element.labelSanitized.trim())) return verdict(AUTHORITY_DEFAULTS.ambiguous_form_button_level, 'AMBIGUOUS_FORM_BUTTON', true);
  }
  if (kind === 'key' && (action.key ?? '').toLowerCase() === 'enter') return verdict('L5', element?.inForm ? 'FORM_ENTER' : 'POSSIBLE_COMMIT_ENTER', true);
  const categories = tokenCategories(`${action.text ?? ''} ${action.value ?? ''}`);
  if (element?.fieldCategory) categories.push(element.fieldCategory);
  if (element?.inputType === 'password' || categories.includes('PASSWORD')) return verdict('L4', 'CREDENTIAL', AUTHORITY_DEFAULTS.password_requires_user);
  if ((kind === 'type' || kind === 'select') && categories.length) {
    const approval = categories.some(c => ['high', 'never_automated'].includes(classOf(c)) && !ctx.consentedCategories.has(c));
    return verdict('L3', approval ? 'SENSITIVE_APPROVAL_REQUIRED' : 'SENSITIVE_FIELD_OR_TOKEN', approval);
  }
  if (kind === 'click' && element?.role === 'link' && element.href) {
    try { const origin = new URL(element.href, ctx.origin).origin; return verdict('L1', origin === ctx.origin ? 'SAME_ORIGIN' : 'CROSS_ORIGIN', origin !== ctx.origin); }
    catch { return verdict('L5', 'INVALID_LINK', true); }
  }
  if (kind === 'click' && element?.role === 'button' && element.inForm && !/^(open|close|show|hide|cancel|toggle|expand|collapse)\b/i.test(element.labelSanitized)) return verdict('L5', 'UNKNOWN_FORM_BUTTON', true);
  if (kind === 'click' && !element) return verdict('L5', 'UNKNOWN_CLICK', true);
  return verdict('L2', 'LOCAL_CONTROL');
}
