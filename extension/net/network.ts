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

import { consumeSealed, isRegisteredSealed, sha256Hex, type SanitizedPayload } from '../privacy/sealedRegistry';
import type { HealthResult } from '../shared/messages';

// Read from a `WXT_`-prefixed env var — WXT sets Vite's `envPrefix` to `['VITE_', 'WXT_']`, so
// any `WXT_SERVER_URL` in extension/.env (see .env.example) reaches `import.meta.env` at build
// time with no extra config; verified empirically (Stage 3B Part II) by building with an
// override and confirming the built bundle contains it. Falls back to the Stage 0 server dev
// command's port when unset, which covers ordinary development with no .env file at all.
const SERVER_URL = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.WXT_SERVER_URL ?? 'http://localhost:8000';

export interface SendResult {
  status: number;
  digest: string;
  size: number;
  body: unknown;
  modelMs: number;
  networkMs: number;
}

/**
 * Sends a sealed payload to `/v1/plan`. Accepts only a `SanitizedPayload` produced by
 * `privacy/firewall.ts -> seal()`, re-checks the runtime registry (so a type-level bypass such as
 * `as SanitizedPayload` still fails), re-verifies the digest over the exact bytes, and consumes
 * the registry entry so the same payload can never be sent twice.
 */
export async function send(payload: SanitizedPayload, signal?: AbortSignal): Promise<SendResult> {
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

  signal?.throwIfAborted();
  const start = performance.now();
  const response = await fetch(`${SERVER_URL}/v1/plan`, {
    signal,
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

  const body: unknown = await response.json();
  signal?.throwIfAborted();
  let modelMs = 0;
  try { const timing = JSON.parse(response.headers.get("X-Aegis-Timings") ?? "{}"); if (typeof timing.model_ms === "number" && Number.isFinite(timing.model_ms)) modelMs = Math.max(0, timing.model_ms); } catch { /* Timing never affects acceptance. */ }
  return { status: response.status, digest: payload.digest, size: payload.size, body, modelMs, networkMs: performance.now() - start };
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

/** The only task cleanup request: a random session id, no page data. */
export async function endSession(sessionId: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("Invalid session ID");
  const response = await fetch(`${SERVER_URL}/v1/session/end`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: sessionId }), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Session cleanup failed");
}
