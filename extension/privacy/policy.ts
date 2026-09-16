/**
 * Policy engine. TODO(stage-2): load docs/policy.yaml and decide FILL / BLUR / FILL_REGION /
 * TOKEN / TOKEN_WITH_APPROVAL / USER_ENTERS / ALLOW for each detected PII item.
 */

export function decide(_piiType: string, _needed: boolean): never {
  throw new Error('NotImplemented: privacy/policy.ts lands in Stage 2');
}
