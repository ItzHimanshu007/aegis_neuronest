/**
 * The firewall is the single point where a raw payload becomes something that is allowed to leave
 * the browser. See AGENTS.md invariant 2.
 *
 * `SanitizedPayload` is a branded type: no amount of structural matching produces one, only this
 * module can mint one, and `net/network.ts` re-checks a runtime registry of sealed instances so a
 * `// @ts-expect-error` type assertion still fails at runtime.
 */

declare const SANITIZED_PAYLOAD_BRAND: unique symbol;

/** A payload that has passed through `seal()`. Only `net/network.ts -> send()` accepts this type. */
export type SanitizedPayload = { readonly [SANITIZED_PAYLOAD_BRAND]: true } & Readonly<Record<string, unknown>>;

/**
 * Runtime registry of every payload this module has sealed. `send()` checks membership here in
 * addition to the type brand, so bypassing the type system alone is not sufficient to reach the
 * network.
 */
const sealedRegistry = new WeakSet<object>();

/** @internal exposed only for net/network.ts's runtime check. */
export function isRegisteredSealed(payload: object): boolean {
  return sealedRegistry.has(payload);
}

/**
 * Takes an unsanitized capture (DOM state, screenshot, detected PII, policy decisions) and produces
 * a `SanitizedPayload` ready for `send()`.
 *
 * TODO(stage-2): implement the real pipeline —
 *   1. run privacy/policy.ts against detected PII to decide FILL / BLUR / TOKEN / USER_ENTERS
 *   2. tokenize via privacy/vault.ts (HMAC-SHA-256, non-extractable per-session key)
 *   3. redact via privacy/redactor.ts (solid fill for text, blur for faces only)
 *   4. sanitize side channels via privacy/sideChannels.ts
 *   5. neutralize any token-like strings found in raw page text
 *   6. verify fail-closed: if verification cannot confirm every detected PII region was handled,
 *      throw instead of sealing
 *   7. register the result in sealedRegistry and return it
 *
 * Until Stage 2 lands, this throws so nothing can accidentally reach the network.
 */
export function seal(_unsanitized: unknown): SanitizedPayload {
  throw new Error('NotImplemented: firewall.seal() lands in Stage 2 — see AGENTS.md and docs/STAGES.md');
}
