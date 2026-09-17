/** Content-script executor. Synthetic events are isTrusted=false; no debugger access. */
import type { Action } from '../shared/schema/plan.v2';
import { reacquire, type LocalTarget } from './reacquire';
import { normalizeValue } from '../privacy/vault';
import { getElementFieldContext } from '../privacy/detect/fieldContext';
import { computeHitOk } from '../observe/visibility';
import type { Category } from '../privacy/categoryTypes';

export interface ExecutionRequest { action: Action; target?: LocalTarget; origin: string; approved: boolean; rawText?: string; category?: Category }
export interface ExecutionResult { ok: boolean; code?: string; match?: boolean; changed?: boolean; validationError?: boolean }
const EVENT_OPTIONS = { bubbles: true, cancelable: true, composed: true };

function click(el: HTMLElement): void {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (computeHitOk(el, el.getBoundingClientRect(), el.ownerDocument) !== true) throw new Error('NOT_HITTABLE');
  el.focus();
  const win = el.ownerDocument.defaultView!;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    el.dispatchEvent(type.startsWith('pointer') ? new win.PointerEvent(type, EVENT_OPTIONS) : new win.MouseEvent(type, EVENT_OPTIONS));
  }
  el.click();
}
function setNativeValue(el: HTMLElement, value: string): void {
  const win = el.ownerDocument.defaultView!;
  const prototype = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('EXEC_FAILED');
  setter.call(el, value);
  el.dispatchEvent(new win.Event('input', EVENT_OPTIONS));
  el.dispatchEvent(new win.Event('change', EVENT_OPTIONS));
}
export function hasValidationError(doc: Document, el?: HTMLElement): boolean {
  const scope = el?.closest('form') ?? doc;
  if (el?.matches('[aria-invalid="true"], :invalid')) return true;
  if (scope.querySelector('[aria-invalid="true"], :invalid, [role="alert"]')) return true;
  return (el?.getAttribute('aria-describedby') ?? '').split(/\s+/).some(id => {
    const description = doc.getElementById(id);
    return Boolean(description && !description.hidden && /error|invalid|required/i.test(description.textContent ?? ''));
  });
}
async function valueHash(category: Category, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeValue(category, value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function executeLocal(request: ExecutionRequest, salt: string, signal: AbortSignal, doc: Document = document): Promise<ExecutionResult> {
  signal.throwIfAborted();
  const { action, target } = request;
  if (doc.location.origin !== request.origin) throw new Error('NEW_SCREEN');
  const found = target ? reacquire(target, salt, doc) : undefined;
  const el = found?.element;
  const win = (el?.ownerDocument ?? doc).defaultView!;
  let match: boolean | undefined;
  const before = `${win.location.href}:${doc.documentElement.textContent?.length}:${found?.raw.hasValue}`;
  if (action.action === 'type') {
    if (!el || !found || request.rawText === undefined) throw new Error('TARGET_MISSING');
    const category = getElementFieldContext(found.raw);
    if (category !== request.category || ['OTP','CVV','UPI_PIN','SECRET'].includes(category ?? '')) throw new Error('TOKEN_TYPE_MISMATCH');
    if (category === 'PASSWORD' && (!request.approved || found.raw.inputType !== 'password')) throw new Error('CONSENT_DENIED');
    el.focus();
    if (el.isContentEditable) {
      const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
      const selection = win.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      if (el.dispatchEvent(new win.InputEvent('beforeinput', { ...EVENT_OPTIONS, inputType: 'insertText', data: request.rawText }))) {
        el.textContent = request.rawText;
        el.dispatchEvent(new win.InputEvent('input', { ...EVENT_OPTIONS, inputType: 'insertText', data: request.rawText }));
      }
    } else {
      (el as HTMLInputElement).select?.();
      setNativeValue(el, request.rawText);
    }
    signal.throwIfAborted();
    // Secrets: hasValue only, never a value/hash comparison.
    if (category === 'PASSWORD') match = Boolean((el as HTMLInputElement).value);
    else {
      const actual = el.isContentEditable ? el.textContent ?? '' : (el as HTMLInputElement).value;
      match = await valueHash(category ?? 'PRIVATE_GENERIC', actual) === await valueHash(category ?? 'PRIVATE_GENERIC', request.rawText);
      signal.throwIfAborted();
    }
  } else if (action.action === 'click') {
    if (!el) throw new Error('TARGET_MISSING'); click(el);
  } else if (action.action === 'select') {
    if (!el) throw new Error('TARGET_MISSING');
    if (el.tagName === 'SELECT') setNativeValue(el, action.value ?? '');
    else {
      click(el);
      const option = [...el.ownerDocument.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.trim() === action.value);
      if (!option) throw new Error('TARGET_MISSING'); click(option);
    }
  } else if (action.action === 'check') {
    if (!el) throw new Error('TARGET_MISSING');
    if (!(el as HTMLInputElement).checked && el.getAttribute('aria-checked') !== 'true') click(el);
  } else if (action.action === 'hover') {
    if (!el) throw new Error('TARGET_MISSING');
    el.dispatchEvent(new win.PointerEvent('pointerover', EVENT_OPTIONS)); el.dispatchEvent(new win.MouseEvent('mouseover', EVENT_OPTIONS));
  } else if (action.action === 'key') {
    const receiver = el ?? doc.activeElement;
    if (!receiver) throw new Error('TARGET_MISSING');
    for (const type of ['keydown','keypress','keyup']) receiver.dispatchEvent(new win.KeyboardEvent(type, { ...EVENT_OPTIONS, key: action.key }));
    // Synthetic keys do not invoke browser defaults. This uses the native, validation-aware path.
    if (action.key?.toLowerCase() === 'enter') (receiver.closest('form') as HTMLFormElement | null)?.requestSubmit();
  } else if (action.action === 'scroll') {
    const amount = Math.min(Math.max(action.amount ?? win.innerHeight * .6, 0), win.innerHeight);
    let parent = el?.parentElement;
    while (parent && parent.scrollHeight <= parent.clientHeight) parent = parent.parentElement;
    (parent ?? win).scrollBy({ top: amount * (action.direction === 'up' ? -1 : 1), behavior: 'instant' });
  } else if (action.action === 'wait') {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Stopped','AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, Math.min(action.ms ?? 100, 2000));
      signal.addEventListener('abort', cancel, { once:true });
    });
  } else if (action.action === 'navigate') {
    const url = new URL(action.url!);
    if (!['http:','https:'].includes(url.protocol) || (url.origin !== request.origin && !request.approved)) throw new Error('CONSENT_DENIED');
    win.location.assign(url.href);
  } else throw new Error('EXEC_FAILED');
  signal.throwIfAborted();
  return { ok: true, match, changed: match ?? before !== `${win.location.href}:${doc.documentElement.textContent?.length}:${found?.raw.hasValue}`,
    validationError: hasValidationError(el?.ownerDocument ?? doc, el) };
}
