import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Demo preconditions (Stage 5B).
 *
 * The scripted demos are deterministic only while `/v1/plan` is answered by the mock adapter. A
 * server started with `AEGIS_ADAPTER=openai_compat` will instead reach a hosted model — which, on
 * the endpoint this repo is currently configured for, is rate-limited enough that a demo run fails
 * for reasons that have nothing to do with AEGIS. `server/.env` in this checkout does set
 * `openai_compat`, so the wrong mode is one server restart away.
 *
 * Failing here, before the run gets going, turns that into one readable sentence instead of a
 * mid-demo timeout in front of an audience.
 *
 * `forceScenario()` depends on the same thing: the `x-aegis-mock-scenario` header is refused unless
 * the server is in mock mode.
 *
 * Uses Playwright's own `request` fixture rather than `fetch`, which ESLint reserves for
 * `extension/net/network.ts` (AGENTS.md invariant 2 — the single network path).
 */
export async function assertDemoServerReady(request: APIRequestContext): Promise<void> {
  if (process.env.AEGIS_DEMO_LIVE) return; // deliberately measuring a real model; caller owns the risk

  let health: { status?: string; model_adapter?: string };
  try {
    const response = await request.get('http://127.0.0.1:8000/health');
    health = (await response.json()) as typeof health;
  } catch {
    throw new Error(
      'Demo precondition failed: no server on http://127.0.0.1:8000.\n' +
        '  Start it with:  AEGIS_ADAPTER=mock pnpm server',
    );
  }

  expect(
    health.model_adapter,
    `Demo precondition failed: the server is running the "${health.model_adapter}" adapter, not "mock".\n` +
      '  The scripted demos force deterministic mock scenarios and cannot drive a live model.\n' +
      '  Restart the server with:  AEGIS_ADAPTER=mock pnpm server\n' +
      '  (server/.env sets AEGIS_ADAPTER=openai_compat, which is why a restart can land in the wrong mode.)\n' +
      '  To demo against a real model instead, use: pnpm demo:live',
  ).toBe('mock');
}
