/**
 * The ONLY network path out of the extension. See AGENTS.md invariant 2.
 *
 * ESLint (`no-restricted-syntax`, see /.eslintrc / eslint.config.ts) forbids `fetch`,
 * `XMLHttpRequest` and `WebSocket` everywhere else in this repository — this file is the sole
 * exception.
 */

import { isRegisteredSealed, type SanitizedPayload } from '../privacy/firewall';
import type { HealthResult } from '../shared/messages';

// TODO(stage-3): read from WXT env / import.meta.env.WXT_SERVER_URL properly once the build
// pipeline threads it through; default matches the Stage 0 server dev command.
const SERVER_URL = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.WXT_SERVER_URL ?? 'http://localhost:8000';

/**
 * Sends a sealed payload to the server's `/v1/plan` endpoint. Accepts only a `SanitizedPayload`
 * produced by `privacy/firewall.ts -> seal()`, and re-checks a runtime registry of sealed payloads
 * so a type-level bypass (e.g. `as SanitizedPayload`) still fails at runtime.
 */
export async function send(payload: SanitizedPayload): Promise<unknown> {
  if (!isRegisteredSealed(payload)) {
    throw new Error('network.send() refused: payload was not produced by firewall.seal()');
  }
  const response = await fetch(`${SERVER_URL}/v1/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json();
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
