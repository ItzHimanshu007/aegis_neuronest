import type { EID, SceneGraph } from '../scene';
export interface ContextRequest { reason: string; kind: 'more_elements' | 'scroll_region' | 'higher_resolution' }
export interface ExpansionBudget { remaining: number; elementLimit: number; disclosedEids: ReadonlySet<EID> }
export type RegionSpec = { kind: 'scroll'; direction: 'down' } | { kind: 'router_resolution_request'; requiresRedaction: true };
export interface ExpansionDecision { add: EID[] | RegionSpec; remaining: number; deniedReason?: 'INVALID_REQUEST' | 'BUDGET_EXHAUSTED' | 'NO_SAFE_ELEMENTS' }
/** Pure decision only. Stage 8 must apply the returned remaining budget before using an expansion. */
export function decideContextExpansion(request: ContextRequest, scene: SceneGraph, budget: ExpansionBudget): ExpansionDecision {
  const deny = (deniedReason: ExpansionDecision['deniedReason']): ExpansionDecision => ({ add: [], remaining: budget.remaining, deniedReason });
  if (Object.keys(request).some(k => !['reason', 'kind'].includes(k)) || typeof request.reason !== 'string' || !request.reason.trim() || request.reason.length > 300 || !['more_elements', 'scroll_region', 'higher_resolution'].includes(request.kind)) return deny('INVALID_REQUEST');
  if (!Number.isSafeInteger(budget.remaining) || budget.remaining <= 0) return deny('BUDGET_EXHAUSTED');
  const remaining = budget.remaining - 1;
  if (request.kind === 'scroll_region') return { add: { kind: 'scroll', direction: 'down' }, remaining };
  if (request.kind === 'higher_resolution') return { add: { kind: 'router_resolution_request', requiresRedaction: true }, remaining };
  const add = [...scene.elements.values()].filter(e => e.visible && !e.hiddenInteractive && (!e.decision || e.decision === 'ALLOW') && !e.token && !budget.disclosedEids.has(e.eid)).slice(0, Math.max(0, budget.elementLimit)).map(e => e.eid);
  return add.length ? { add, remaining } : deny('NO_SAFE_ELEMENTS');
}
