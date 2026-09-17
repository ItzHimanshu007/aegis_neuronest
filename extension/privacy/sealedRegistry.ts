/**
 * The sealed-payload registry and the digest helper, split out of privacy/firewall.ts so that
 * net/network.ts can import them WITHOUT pulling in ajv and the whole detection ruleset.
 *
 * That matters concretely: background.ts imports `health()` from net/network.ts, so anything
 * network.ts imports at module level ends up in the background service worker bundle. Before this
 * split, that was ajv + every rule + the JSON schema — ~130KB of code the background never runs.
 *
 * `SanitizedPayload` is a branded type. Only privacy/firewall.ts's `seal()` calls `registerSealed`,
 * so only sealed payloads exist; `send()` re-checks membership at runtime, which is what makes a
 * `as SanitizedPayload` cast insufficient to reach the network (AGENTS.md invariant 2).
 */

declare const SANITIZED_PAYLOAD_BRAND: unique symbol;

export interface SanitizedPayload {
  readonly [SANITIZED_PAYLOAD_BRAND]: true;
  /** The EXACT bytes to send. `send()` transmits these verbatim — it never re-serializes. */
  readonly bytes: Uint8Array;
  /** Lowercase hex SHA-256 of `bytes`. */
  readonly digest: string;
  readonly capture_id: string;
  readonly size: number;
}

const sealedRegistry = new WeakSet<object>();

/** @internal called only by privacy/firewall.ts's seal(). */
export function registerSealed(payload: object): void {
  sealedRegistry.add(payload);
}

/** @internal exposed only for net/network.ts's runtime check. */
export function isRegisteredSealed(payload: object): boolean {
  return sealedRegistry.has(payload);
}

/** @internal exposed only for net/network.ts — a sealed payload is single-use. */
export function consumeSealed(payload: object): boolean {
  return sealedRegistry.delete(payload);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
