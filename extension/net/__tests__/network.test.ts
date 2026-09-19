import { beforeEach, describe, expect, it, vi } from 'vitest';
import { send, health, loadBundledAsset } from '../network';
import { seal } from '../../privacy/firewall';
import type { SanitizedPayload } from '../../privacy/firewall';
import type { DraftPayload } from '../../privacy/payloadBuilder';

// AGENTS.md invariant 2 + Stage 2 Part F.6: send() only accepts a registered SanitizedPayload,
// transmits the exact sealed bytes, verifies the digest, and is single-use.

function makeDraft(): DraftPayload {
  return {
    session: 'sess-1',
    capture_id: 'cap-1',
    schema: 'aegis/2', state_token: 'Sabcdefghij',
    mode: 'balanced',
    task: 'Do the thing',
    page: { url: 'https://example.test/', title: 'Example' },
    elements: [],
    redactions: [],
  };
}

async function sealOne(): Promise<SanitizedPayload> {
  const { payload } = await seal(makeDraft(), { vaultValues: [], issuedTokens: new Set(), decisions: [], observedRawValues: [] });
  return payload;
}

describe('network.send()', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ plan: [{ action: 'done', reason: 'ok' }] }), { status: 200 })),
    );
  });

  it('rejects a plain object that was never sealed, even when forced past the type system', async () => {
    const forged = { session: 's1', capture_id: 'c1' };
    // @ts-expect-error forged is not a SanitizedPayload — this is exactly what the brand exists to catch.
    await expect(send(forged)).rejects.toThrow(/refused/i);
  });

  it('rejects an object cast to SanitizedPayload without going through seal()', async () => {
    const forged = { bytes: new Uint8Array([1, 2]), digest: 'deadbeef', capture_id: 'c1', size: 2 } as unknown as SanitizedPayload;
    await expect(send(forged)).rejects.toThrow(/refused/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the EXACT sealed bytes as the body, with the digest header', async () => {
    const payload = await sealOne();
    const result = await send(payload);

    expect(result.status).toBe(200);
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/plan$/);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-Aegis-Digest']).toBe(payload.digest);
    // The body is the sealed byte array itself — not a re-serialization of an object.
    expect(init?.body).toBe(payload.bytes);
  });

  it('is single-use: replaying the same sealed payload throws', async () => {
    const payload = await sealOne();
    await send(payload);
    await expect(send(payload)).rejects.toThrow(/refused/i);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1); // the replay never reached the network
  });

  it('refuses when the sealed bytes were modified after sealing (digest mismatch)', async () => {
    const payload = await sealOne();
    payload.bytes[0] = payload.bytes[0]! ^ 0xff; // tamper
    await expect(send(payload)).rejects.toThrow(/digest mismatch/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws on a non-OK server response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const payload = await sealOne();
    await expect(send(payload)).rejects.toThrow(/500/);
  });
});

describe('network.loadBundledAsset()', () => {
  beforeEach(() => {
    vi.stubGlobal('browser', { runtime: { getURL: (p: string) => `chrome-extension://abc123/${p.replace(/^\//, '')}` } });
  });

  it('fetches this extension\'s own bundled resource and returns its bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(bytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const url = browser.runtime.getURL('/models/face-yunet/face_detection_yunet_2026may.onnx');
    const result = await loadBundledAsset(url);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(fetchMock).toHaveBeenCalledWith(url);
  });

  it('refuses a URL that is not this extension\'s own origin — never a remote/page URL', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBundledAsset('https://evil.example.com/payload')).rejects.toThrow(/refused/i);
    await expect(loadBundledAsset('chrome-extension://someOtherExtension/x')).rejects.toThrow(/refused/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const url = browser.runtime.getURL('/models/face-yunet/face_detection_yunet_2026may.onnx');
    await expect(loadBundledAsset(url)).rejects.toThrow(/404/);
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
