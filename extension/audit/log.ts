import { ALL_CATEGORIES, type Category } from '../privacy/categoryTypes';
import type { EID } from '../scene';
import type { ActionName } from '../shared/schema/plan.v2';
import type { AuthorityLevel } from '../authority';
import { AEGIS_CONFIG } from '../shared/config';
export type AuditVerdict = 'SEALED' | 'PASS' | 'REJECT' | 'ABORT_BATCH' | 'DROP_REMAINING' | 'USER_REQUIRED';
export interface AuditRecord {
  ts: number; digest: string; categoryCounts: Partial<Record<Category, number>>; eids: EID[];
  action: ActionName | 'observe'; level: AuthorityLevel; verdict: AuditVerdict;
  timings: Partial<Record<'observeMs' | 'detectMs' | 'policyMs' | 'redactMs' | 'sealMs' | 'actionMs', number>>;
}
const ACTIONS = ['observe', 'click', 'type', 'select', 'check', 'scroll', 'hover', 'key', 'wait', 'navigate', 'ask_user', 'done', 'fail'];
const VERDICTS: AuditVerdict[] = ['SEALED', 'PASS', 'REJECT', 'ABORT_BATCH', 'DROP_REMAINING', 'USER_REQUIRED'];
const KEYS = ['ts', 'digest', 'categoryCounts', 'eids', 'action', 'level', 'verdict', 'timings'];
/** Closed record vocabulary, checked at runtime before retention. No free-form string slots. */
export class AuditLog {
  private records: AuditRecord[] = [];
  constructor(private readonly capacity: number = AEGIS_CONFIG.AUDIT_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid audit capacity');
  }
  append(record: AuditRecord): void {
    const validNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (Object.keys(record).some(k => !KEYS.includes(k)) || KEYS.some(k => !(k in record)) || !validNumber(record.ts) ||
        typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest) || !ACTIONS.includes(record.action) || typeof record.level !== 'string' || !/^L[0-5]$/.test(record.level) || !VERDICTS.includes(record.verdict) ||
        !Array.isArray(record.eids) || record.eids.some(e => typeof e !== 'string' || !/^E[0-9]{1,6}$/.test(e)) ||
        Object.entries(record.categoryCounts).some(([k, v]) => !ALL_CATEGORIES.includes(k as Category) || !validNumber(v) || !Number.isSafeInteger(v)) ||
        Object.entries(record.timings).some(([k, v]) => !['observeMs', 'detectMs', 'policyMs', 'redactMs', 'sealMs', 'actionMs'].includes(k) || !validNumber(v))) throw new Error('Invalid audit record');
    // Reconstruct arrays/maps so exotic extra array properties cannot carry text into storage.
    this.records.push({ ts: record.ts, digest: record.digest, categoryCounts: Object.fromEntries(Object.entries(record.categoryCounts)),
      eids: [...record.eids], action: record.action, level: record.level, verdict: record.verdict, timings: Object.fromEntries(Object.entries(record.timings)) });
    if (this.records.length > this.capacity) this.records.shift();
  }
  get size(): number { return this.records.length; }
  export(mode: 'judge' | 'normal'): AuditRecord[] {
    if (mode !== 'judge') throw new Error('Audit export requires Judge Mode');
    return structuredClone(this.records);
  }
  clear(): void { this.records = []; }
}
