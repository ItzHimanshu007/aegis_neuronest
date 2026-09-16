import { describe, expect, it, vi, beforeEach } from 'vitest';
import { send, health } from '../network';
import type { SanitizedPayload } from '../../privacy/firewall';

// AGENTS.md invariant 2: send() must only accept a SanitizedPayload minted by firewall.seal(),
// and must re-check a runtime registry so a type-level bypass still fails.

describe('network.send()', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ plan: [{ action: 'done', reason: 'ok' }] }), { status: 200 })),
    );
  });

  it('rejects a plain object that was never sealed, even when forced past the type system', async () => {
    const forged = { session: 's1', capture_id: 'c1' };
    // @ts-expect-error forged is not a SanitizedPayload — this is exactly what the type brand exists to catch.
    await expect(send(forged)).rejects.toThrow(/refused/i);
  });

  it('rejects an object cast to SanitizedPayload without going through seal()', async () => {
    const forged = { session: 's1', capture_id: 'c1' } as unknown as SanitizedPayload;
    await expect(send(forged)).rejects.toThrow(/refused/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('network.health()', () => {
  it('calls GET /health and returns the parsed body', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ status: 'ok', version: '0.1.0', model_adapter: 'mock' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await health();

    expect(result).toEqual({ status: 'ok', version: '0.1.0', model_adapter: 'mock' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/health$/);
    expect(init?.method).toBe('GET');
  });
});
