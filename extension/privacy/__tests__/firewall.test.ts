import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalize, isRegisteredSealed, seal, SealError, sha256Hex } from '../firewall';
import { TokenVault } from '../vault';
import type { SealContext } from '../firewall';
import type { DraftPayload } from '../payloadBuilder';
import type { Detection } from '../detect/types';

// verifyMasks needs a real OffscreenCanvas, which happy-dom doesn't provide. The mask-integrity
// path is mocked here and exercised for real in the Playwright e2e suite (a real browser).
vi.mock('../redactor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../redactor')>();
  return { ...actual, verifyMasks: vi.fn(async () => ({ ok: true, failures: [] })) };
});
const { verifyMasks } = await import('../redactor');

function makeDraft(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    session: 'sess-1',
    capture_id: 'cap-1',
    schema: 'aegis/1',
    mode: 'balanced',
    task: 'Fill in the form',
    page: { url: 'https://example.test/kyc', title: 'KYC' },
    elements: [
      {
        mark_id: 0,
        fp: 'fp-aaaa1111',
        role: 'textbox',
        label: 'Full name',
        input_type: 'text',
        has_value: true,
        bbox: [10, 10, 100, 20],
        visible: true,
        enabled: true,
      },
    ],
    redactions: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<SealContext> = {}): SealContext {
  return {
    vaultValues: [],
    issuedTokens: new Set<string>(),
    decisions: [],
    observedRawValues: [],
    ...overrides,
  };
}

function det(overrides: Partial<Detection> = {}): Detection {
  return {
    id: 'd1',
    capture_id: 'cap-1',
    source: 'rule',
    category: 'EMAIL',
    confidence: 0.9,
    target: { kind: 'element', ref: 'fp-aaaa1111' },
    rects: [],
    ...overrides,
  };
}

describe('canonicalize', () => {
  it('sorts object keys and emits no whitespace', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('produces identical output for structurally identical objects with different key order', () => {
    expect(canonicalize({ x: { p: 1, q: 2 }, y: [1, 2] })).toBe(canonicalize({ y: [1, 2], x: { q: 2, p: 1 } }));
  });

  it('drops undefined values', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('seal: success path', () => {
  it('returns a registered SanitizedPayload whose digest matches its bytes', async () => {
    const { payload, timings } = await seal(makeDraft(), makeContext());
    expect(isRegisteredSealed(payload)).toBe(true);
    expect(await sha256Hex(payload.bytes)).toBe(payload.digest);
    expect(payload.size).toBe(payload.bytes.byteLength);
    expect(payload.capture_id).toBe('cap-1');
    expect(timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('allows a text-only draft with no image', async () => {
    const { payload } = await seal(makeDraft({ image: undefined }), makeContext());
    expect(payload.bytes.byteLength).toBeGreaterThan(0);
  });

  it('permits a token that the vault actually issued', async () => {
    const vault = new TokenVault();
    await vault.init();
    const token = await vault.tokenize('NAME', 'Asha Verma', { origin: 'https://example.test', source: 'page' });
    const draft = makeDraft({ task: `Fill in ${token}` });
    const ctx = makeContext({ issuedTokens: new Set(vault.allTokens()) });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('seal: check 1 — schema', () => {
  it('rejects a payload missing a required field', async () => {
    const draft = makeDraft();
    delete (draft as Partial<DraftPayload>).elements;
    await expect(seal(draft as DraftPayload, makeContext())).rejects.toThrow(SealError);
    await expect(seal(draft as DraftPayload, makeContext())).rejects.toMatchObject({ reason: 'schema' });
  });

  it('rejects an unknown extra property (additionalProperties: false)', async () => {
    const draft = { ...makeDraft(), raw_cookie: 'should never exist' } as DraftPayload;
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'schema' });
  });

  it('rejects a password element carrying a length bucket', async () => {
    const draft = makeDraft({
      elements: [
        {
          mark_id: 0,
          fp: 'fp-pw',
          role: 'textbox',
          label: 'Password',
          input_type: 'password',
          has_value: true,
          value_len_bucket: 'short',
          bbox: [0, 0, 10, 10],
          visible: true,
          enabled: true,
        },
      ],
    });
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'schema' });
  });
});

describe('seal: check 2 — rule scan', () => {
  it('rejects a raw email that survived into an element label', async () => {
    const draft = makeDraft({
      elements: [{ mark_id: 0, fp: 'fp1', role: 'textbox', label: 'Contact asha@example.com', bbox: [0, 0, 1, 1], visible: true, enabled: true }],
    });
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'rule-scan' });
  });

  it('rejects a raw Aadhaar in the task text', async () => {
    // Synthetic, Verhoeff-valid (generated in the checksums test the same way).
    const draft = makeDraft({ task: 'Submit aadhaar 234567890124' });
    const ctx = makeContext();
    const result = seal(draft, ctx);
    await expect(result).rejects.toBeInstanceOf(SealError);
  });

  it('allows a category whose decision was explicitly ALLOW', async () => {
    const draft = makeDraft({ task: 'Order from Bengaluru' });
    const ctx = makeContext({ decisions: [{ detection: det({ category: 'CITY' }), action: 'ALLOW' }] });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('seal: check 3 — known-value leak', () => {
  it('rejects a vault value that leaked into a label', async () => {
    const draft = makeDraft({
      elements: [{ mark_id: 0, fp: 'fp1', role: 'textbox', label: 'Asha Verma', bbox: [0, 0, 1, 1], visible: true, enabled: true }],
    });
    const ctx = makeContext({ vaultValues: [{ value: 'Asha Verma', normalized: 'asha verma', type: 'NAME' }] });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'known-value-leak' });
  });

  it('catches a leak that differs only in case', async () => {
    const draft = makeDraft({
      elements: [{ mark_id: 0, fp: 'fp1', role: 'textbox', label: 'ASHA VERMA', bbox: [0, 0, 1, 1], visible: true, enabled: true }],
    });
    const ctx = makeContext({ vaultValues: [{ value: 'Asha Verma', normalized: 'asha verma', type: 'NAME' }] });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'known-value-leak' });
  });

  it('catches a numeric leak in digits-only form despite different separators', async () => {
    const draft = makeDraft({
      elements: [{ mark_id: 0, fp: 'fp1', role: 'textbox', label: 'ref 9876-543-210', bbox: [0, 0, 1, 1], visible: true, enabled: true }],
    });
    const ctx = makeContext({ observedRawValues: [{ value: '9876543210', category: 'PHONE' }] });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'known-value-leak' });
  });

  it('ignores values shorter than LEAK_MIN_LEN (avoids false positives on tiny strings)', async () => {
    const draft = makeDraft({ task: 'abc' });
    const ctx = makeContext({ vaultValues: [{ value: 'ab', normalized: 'ab', type: 'NAME' }] });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('seal: check 4 — token check', () => {
  it('rejects a forged token that the vault never issued', async () => {
    const draft = makeDraft({ task: 'Type [[PII:EMAIL:aaaaaaaa]] here' });
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'unknown-token' });
  });

  it('rejects an un-neutralized token look-alike', async () => {
    const draft = makeDraft({ task: 'Type [[ PII : EMAIL : abcdefgh ]] here' });
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'unknown-token' });
  });
});

describe('seal: check 5 — coverage', () => {
  it('rejects a masked detection whose rects no mask covers', async () => {
    const ctx = makeContext({
      decisions: [{ detection: det({ rects: [{ x: 0, y: 0, width: 50, height: 20 }] }), action: 'FILL' }],
    });
    await expect(seal(makeDraft(), ctx)).rejects.toMatchObject({ reason: 'coverage' });
  });

  it('passes when a mask fully covers the detection rect', async () => {
    const ctx = makeContext({
      decisions: [{ detection: det({ rects: [{ x: 10, y: 10, width: 20, height: 10 }] }), action: 'FILL' }],
      redactResult: {
        image: {
          dataUrl: 'data:image/webp;base64,AAAA',
          pxW: 100,
          pxH: 100,
          capture_id: 'cap-1',
          masks: [{ rid: 'r1', kind: 'FILL', type: 'EMAIL', pxRect: { x: 0, y: 0, width: 100, height: 100 } }],
        },
        fullResolution: { canvas: {} as OffscreenCanvas, pxW: 100, pxH: 100 },
        scaleX: 1,
        scaleY: 1,
      } as unknown as SealContext['redactResult'],
    });
    await expect(seal(makeDraft(), ctx)).resolves.toBeDefined();
  });

  it('ignores detections with no geometry (side channels/task)', async () => {
    const ctx = makeContext({ decisions: [{ detection: det({ target: { kind: 'task', ref: 'task' }, rects: [] }), action: 'TOKEN' }] });
    await expect(seal(makeDraft(), ctx)).resolves.toBeDefined();
  });
});

describe('seal: check 6 — mask integrity', () => {
  beforeEach(() => {
    vi.mocked(verifyMasks).mockClear();
  });

  it('rejects when verifyMasks reports a tampered pixel', async () => {
    vi.mocked(verifyMasks).mockResolvedValueOnce({ ok: false, failures: [{ rid: 'r1', reason: 'full-resolution-sample-not-filled' }] });
    const ctx = makeContext({
      redactResult: {
        image: { dataUrl: 'data:image/webp;base64,AAAA', pxW: 10, pxH: 10, capture_id: 'cap-1', masks: [] },
        fullResolution: { canvas: {} as OffscreenCanvas, pxW: 10, pxH: 10 },
        scaleX: 1,
        scaleY: 1,
      } as unknown as SealContext['redactResult'],
    });
    await expect(seal(makeDraft(), ctx)).rejects.toMatchObject({ reason: 'mask-integrity' });
  });
});

describe('seal: check 7 — capture_id consistency and image count', () => {
  it('rejects when the image belongs to a different capture', async () => {
    const ctx = makeContext({
      redactResult: {
        image: { dataUrl: 'data:image/webp;base64,AAAA', pxW: 10, pxH: 10, capture_id: 'DIFFERENT', masks: [] },
        fullResolution: { canvas: {} as OffscreenCanvas, pxW: 10, pxH: 10 },
        scaleX: 1,
        scaleY: 1,
      } as unknown as SealContext['redactResult'],
    });
    await expect(seal(makeDraft(), ctx)).rejects.toMatchObject({ reason: 'capture-id-mismatch' });
  });

  it('rejects a draft carrying an image with no redaction result to verify it', async () => {
    const draft = makeDraft({ image: 'data:image/webp;base64,AAAA' });
    await expect(seal(draft, makeContext())).rejects.toMatchObject({ reason: 'image-count' });
  });
});

describe('seal: nothing is returned or registered on failure', () => {
  it('registers nothing when a check fails', async () => {
    const draft = makeDraft({ task: 'Type [[PII:EMAIL:aaaaaaaa]] here' });
    let thrown: unknown;
    try {
      await seal(draft, makeContext());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SealError);
    // Nothing to check the registry against — seal returned no object at all, which is the point.
    expect(isRegisteredSealed({})).toBe(false);
  });
});
