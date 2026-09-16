/* eslint-disable */
/**
 * Generated from plan.v1.schema.json by `pnpm gen:types`. Do not hand-edit.
 */

/**
 * Server response. The server only PROPOSES: the extension validates, reacquires, re-hydrates and executes. Exactly one of plan, answer or extract is present.
 */
export type PlanV1 = PlanResponse | AnswerResponse | ExtractResponse;
export type Action = Action1 & Action1;
export type ActionName =
  | 'click'
  | 'type'
  | 'select'
  | 'check'
  | 'scroll'
  | 'hover'
  | 'key'
  | 'wait'
  | 'navigate'
  | 'ask_user'
  | 'done'
  | 'fail';

export interface PlanResponse {
  /**
   * A batch of actions to attempt in order.
   *
   * @minItems 1
   */
  plan: [Action, ...Action[]];
}
export interface Action1 {
  action: ActionName;
  target?: Target;
  /**
   * type only. May contain [[PII:TYPE:xxxxxxxx]] tokens, re-hydrated locally under strict rules.
   */
  text?: string;
  /**
   * select only.
   */
  value?: string;
  /**
   * scroll only.
   */
  direction?: 'up' | 'down';
  /**
   * scroll only.
   */
  amount?: number;
  /**
   * key only.
   */
  key?: string;
  /**
   * wait only.
   */
  ms?: number;
  /**
   * navigate only. Never re-hydrated.
   */
  url?: string;
  /**
   * Human-readable justification. Required for ask_user and fail.
   */
  reason?: string;
  expect?: Expect;
}
export interface Target {
  mark_id: number;
  /**
   * Fingerprint from the payload. The extension refuses to act if the reacquired element's fingerprint does not match.
   */
  fp: string;
}
/**
 * Post-condition checked locally after the action. All fields optional.
 */
export interface Expect {
  mark_id?: number;
  has_value?: boolean;
  visible?: boolean;
  enabled?: boolean;
  modal_open?: boolean;
  url_path_prefix?: string;
}
export interface AnswerResponse {
  answer: {
    text: string;
  };
}
export interface ExtractResponse {
  extract: {
    data: {
      [k: string]: unknown;
    };
  };
}
