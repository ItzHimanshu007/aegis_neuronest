/**
 * Input watcher (Stage 1 Part D.6). Debounced `input`/`change` listener that reports
 * `{ fp, hasValue, valueLenBucket }` to whoever's listening — never the raw value. The element's
 * `fp` must be looked up from the last harvest (passed in via `lookupFp`), since the watcher
 * itself never re-derives a fingerprint from scratch (that's harvester.ts's job, and doing it here
 * too would double the fingerprinting logic to keep in sync).
 */

import { AEGIS_CONFIG } from '../shared/config';

export type ValueLenBucket = 'empty' | 'short' | 'medium' | 'long';

export interface InputChangeReport {
  fp: string;
  hasValue: boolean;
  valueLenBucket?: ValueLenBucket;
}

export type LookupFp = (el: Element) => string | undefined;
export type EmitReport = (report: InputChangeReport) => void;

function bucketValueLen(len: number): ValueLenBucket {
  if (len === 0) return 'empty';
  if (len <= AEGIS_CONFIG.VALUE_LEN_SHORT_MAX) return 'short';
  if (len <= AEGIS_CONFIG.VALUE_LEN_MEDIUM_MAX) return 'medium';
  return 'long';
}

function getValueLength(el: Element): number {
  const tag = el.tagName;
  if (tag === 'INPUT') return (el as HTMLInputElement).value.length;
  if (tag === 'TEXTAREA') return (el as HTMLTextAreaElement).value.length;
  if (tag === 'SELECT') return (el as HTMLSelectElement).value.length;
  if (el.hasAttribute('contenteditable')) return (el.textContent ?? '').trim().length;
  return 0;
}

export class InputWatcher {
  private timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly lookupFp: LookupFp,
    private readonly emit: EmitReport,
    private readonly debounceMs: number = AEGIS_CONFIG.INPUT_DEBOUNCE_MS,
  ) {}

  attach(doc: Document): () => void {
    const onEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      this.scheduleReport(target);
    };
    doc.addEventListener('input', onEvent, true);
    doc.addEventListener('change', onEvent, true);
    return () => {
      doc.removeEventListener('input', onEvent, true);
      doc.removeEventListener('change', onEvent, true);
    };
  }

  private scheduleReport(el: Element): void {
    const existing = this.timers.get(el);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(el);
      const fp = this.lookupFp(el);
      if (!fp) return; // element wasn't in the last harvest (e.g. appeared after it) — Stage 1
      // doesn't re-harvest on every keystroke; the next full observation will pick it up.
      const isPassword = el.tagName === 'INPUT' && (el as HTMLInputElement).type.toLowerCase() === 'password';
      const len = getValueLength(el);
      this.emit({
        fp,
        hasValue: len > 0,
        valueLenBucket: isPassword ? undefined : bucketValueLen(len),
      });
    }, this.debounceMs);
    this.timers.set(el, timer);
  }
}
