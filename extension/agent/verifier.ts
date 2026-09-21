import type { Expect, Action } from '../shared/schema/plan.v2';
import type { SceneGraph, EID } from '../scene';
import type { ExecutionResult } from './executor';
export type Verification = { verdict: 'PASS' } | { verdict: 'FAIL'; code: 'VALUE_MISMATCH' | 'EXPECT_FAILED' | 'EXEC_UNTRUSTED_REJECTED' } | { verdict: 'UNVERIFIABLE'; code: 'UNVERIFIABLE' };

/** Checks sanitized scene facts only. Secret value comparison is never performed here. */
export function verify(expect: Expect | undefined, scene: SceneGraph, action?: Action, execution?: ExecutionResult): Verification {
  if (action?.action === 'type' && execution?.match === false) return { verdict: 'FAIL', code: 'VALUE_MISMATCH' };
  if (!expect) return { verdict: 'UNVERIFIABLE', code: 'UNVERIFIABLE' };
  const eid = expect.eid ?? action?.target?.eid;
  const el = eid ? scene.elements.get(eid as EID) : undefined;
  let conditions = 0;
  const checks: boolean[] = [];
  for (const [key, wanted] of Object.entries(expect)) {
    if (key === 'eid') continue;
    conditions++;
    switch (key) {
      case 'visible': checks.push((el?.visible ?? false) === wanted); break;
      case 'enabled': checks.push(Boolean(el && !el.states.disabled) === wanted); break;
      case 'has_value': checks.push(Boolean(el?.hasValue) === wanted); break;
      case 'modal_open': checks.push((scene.relations.inModal.size > 0) === wanted); break;
      case 'text_present': checks.push([...scene.texts.values()].some(t => t.text.toLowerCase().includes(String(wanted).toLowerCase()))); break;
      case 'url_path_prefix': checks.push(new URL(scene.page.urlSanitized).pathname.startsWith(String(wanted))); break;
      case 'no_validation_error': {
        if (execution?.validationError === undefined) return { verdict: 'UNVERIFIABLE', code: 'UNVERIFIABLE' };
        checks.push(!execution.validationError === wanted); break;
      }
    }
  }
  if (!conditions) return { verdict: 'UNVERIFIABLE', code: 'UNVERIFIABLE' };
  if (!checks.every(Boolean)) return { verdict: 'FAIL', code: execution?.changed === false ? 'EXEC_UNTRUSTED_REJECTED' : 'EXPECT_FAILED' };
  // For `done` actions, evidence must prove the task was completed — not merely describe the
  // current page. A `url_path_prefix` of "/" or "" is always true (every pathname starts with /)
  // and cannot demonstrate that any task-specific state change occurred. If all conditions are
  // satisfied but the ONLY non-eid condition is a vacuously-true url_path_prefix, reject: the
  // model chose evidence that cannot fail, which is not evidence. A more specific prefix (e.g.
  // "/kyc.html?submitted=1"), a text_present, or an eid-bound state predicate is required.
  // This gate applies only to `done`; ordinary action `expect` clauses are unchanged.
  if (action?.action === 'done') {
    const prefix = typeof expect.url_path_prefix === 'string' ? expect.url_path_prefix : null;
    const isVacuousPrefix = prefix !== null && (prefix === '/' || prefix === '');
    // Count conditions that go beyond a vacuous url_path_prefix.
    // `eid` is a reference key, not a state predicate — excluded from both counts.
    const totalConds = conditions; // already excludes eid
    const vacuousConds = isVacuousPrefix ? 1 : 0;
    const meaningfulConds = totalConds - vacuousConds;
    if (meaningfulConds === 0) {
      // Every condition is vacuously satisfiable; this is not real completion evidence.
      return { verdict: 'FAIL', code: 'EXPECT_FAILED' };
    }
  }
  return { verdict: 'PASS' };
}
