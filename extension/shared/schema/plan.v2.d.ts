/* eslint-disable */
/**
 * Generated from plan.v2.schema.json by `pnpm gen:types`. Do not hand-edit.
 */

/**
 * Untrusted server response: exactly one of plan, answer, extract or request_context; bound to the latest sealed state.
 */
export type PlanV2 = PlanResponse | AnswerResponse | ExtractResponse | ContextResponse;
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
  schema: 'aegis/2';
  state_token: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  plan_steps?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
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
  evidence?: Expect;
}
export interface Target {
  /**
   * Fingerprint from the payload. The extension refuses to act if the reacquired element's fingerprint does not match.
   */
  fp: string;
  eid: string;
}
/**
 * Post-condition checked locally after the action. All fields optional.
 */
export interface Expect {
  has_value?: boolean;
  visible?: boolean;
  enabled?: boolean;
  modal_open?: boolean;
  url_path_prefix?: string;
  eid?: string;
  no_validation_error?: boolean;
  text_present?: string;
}
export interface AnswerResponse {
  answer: {
    text: string;
  };
  schema: 'aegis/2';
  state_token: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  plan_steps?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
}
export interface ExtractResponse {
  extract: {
    data: {
      [k: string]: unknown;
    };
  };
  schema: 'aegis/2';
  state_token: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  plan_steps?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
}
export interface ContextResponse {
  request_context: ContextRequest;
  schema: 'aegis/2';
  state_token: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  plan_steps?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
}
export interface ContextRequest {
  reason: string;
  kind: 'more_elements' | 'scroll_region' | 'higher_resolution';
}
