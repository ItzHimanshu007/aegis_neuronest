import type { Action } from '../shared/schema/plan.v2';
import type { AuthorityLevel } from '../authority';
import type { Category } from '../privacy/categoryTypes';
export interface ApprovalRequest {
  action: Action['action']; eid?: string; label: string; category?: Category;
  origin: string; reason: string; level: AuthorityLevel; token?: string;
}
export type ApprovalReply = 'approve' | 'skip' | 'stop';
