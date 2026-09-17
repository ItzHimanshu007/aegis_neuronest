/**
 * The ONLY network path out of the extension. See AGENTS.md invariant 2.
 *
 * ESLint (`no-restricted-globals`, see eslint.config.ts) forbids `fetch`, `XMLHttpRequest` and
 * `WebSocket` everywhere else in this repository — this file is the sole exception.
 *
 * Stage 2 hardening (Part F.6): `send()` transmits the EXACT bytes `firewall.seal()` produced,
 * never a re-serialization of an object (re-serializing would let key order, number formatting or
 * a mutated field diverge from what was actually checked and digested). It recomputes the digest
 * over those bytes before sending, and a sealed payload is single-use — replaying one throws.
 */

import { consumeSealed, isRegisteredSealed, sha256Hex, type SanitizedPayload } from '../privacy/firewall';
import type { HealthResult } from '../shared/messages';

// TODO(stage-3): read from WXT env / import.meta.env.WXT_SERVER_URL properly once the build
// pipeline threads it through; default matches the Stage 0 server dev command.
const SERVER_URL = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.WXT_SERVER_URL ?? 'http://localhost:8000';

export interface SendResult {
  status: number;
  digest: string;
  size: number;
  body: unknown;
}

/**
 * Sends a sealed payload to `/v1/plan`. Accepts only a `SanitizedPayload` produced by
 * `privacy/firewall.ts -> seal()`, re-checks the runtime registry (so a type-level bypass such as
 * `as SanitizedPayload` still fails), re-verifies the digest over the exact bytes, and consumes
 * the registry entry so the same payload can never be sent twice.
 */
export async function send(payload: SanitizedPayload): Promise<SendResult> {
  if (!isRegisteredSealed(payload)) {
    throw new Error('network.send() refused: payload was not produced by firewall.seal() (or has already been sent)');
  }

  const recomputed = await sha256Hex(payload.bytes);
  if (recomputed !== payload.digest) {
    throw new Error('network.send() refused: digest mismatch — the sealed bytes were modified after sealing');
  }

  // Single-use: drop it from the registry BEFORE the request, so even a concurrent replay of the
  // same object fails rather than racing.
  consumeSealed(payload);

  const response = await fetch(`${SERVER_URL}/v1/plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Aegis-Digest': payload.digest,
    },
    body: payload.bytes as unknown as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }

  return { status: response.status, digest: payload.digest, size: payload.size, body: await response.json() };
}

/**
 * Checks server liveness. The only other request this extension is permitted to make. Carries no
 * page data.
 */
export async function health(): Promise<HealthResult> {
  const response = await fetch(`${SERVER_URL}/health`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json() as Promise<HealthResult>;
}
