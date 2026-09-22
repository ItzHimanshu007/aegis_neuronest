/**
 * Phase 3B: Privacy safety validation of the best-effort capture fallback.
 *
 * Commit 9a2c478 fixed "Capture did not stabilize after 3 attempts" on pages with continuous
 * DOM mutations (such as live Jotform forms) by using the last complete capture candidate
 * when all CAPTURE_RETRIES exhaust without an exact mutationCounter match.
 *
 * INVARIANT UNDER TEST:
 *   "best-effort capture remains fail-closed because every candidate, stable or unstable,
 *    passes through the same privacy sealing and outgoing-byte verification."
 *
 * The proof has two layers:
 *   A. Structural (source-level): `cleanMatch` is purely local to background.ts and never
 *      escapes into ObserveResult or agentHost. processObservation() calls seal() unconditionally.
 *   B. Behavioural (seal() calls): a DraftPayload carrying unmasked PII or an unmasked screenshot
 *      is rejected by seal() regardless of how the underlying capture was obtained.
 *
 * Cases 1-3 are adversarial (fail closed).
 * Case 4 confirms that harmless continuous mutations do not cause false rejections.
 * Case 5 confirms existing stable captures remain unchanged.
 * Case 6 confirms the hard-throw guard is preserved when no usable capture exists.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seal, SealError } from '../firewall';
import { TokenVault } from '../vault';
import type { SealContext } from '../firewall';
import type { DraftPayload } from '../payloadBuilder';
import type { Detection } from '../detect/types';
import type { AppliedMask } from '../redactor';

// verifyMasks needs a real OffscreenCanvas, which happy-dom doesn't provide.
let mockVerifyResult: { ok: boolean; failures: unknown[] } = { ok: true, failures: [] };
vi.mock('../redactor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../redactor')>();
  return {
    ...actual,
    verifyMasks: vi.fn(async () => mockVerifyResult),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDraft(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    session: 'sess-1',
    capture_id: 'cap-1',
    schema: 'aegis/2',
    state_token: 'Sabcdefghij',
    mode: 'balanced',
    task: 'Fill in the form',
    page: { url: 'https://form.jotform.com/test', title: 'Test Form' },
    elements: [
      {
        eid: 'E0',
        fp: 'fp-aaaa1111',
        role: 'textbox',
        label: 'Full name',
        input_type: 'text',
        has_value: false,
        bbox: [10, 10, 100, 20],
        visible: true,
        enabled: true,
      },
    ],
    redactions: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SealContext> = {}): SealContext {
  return {
    vaultValues: [],
    issuedTokens: new Set<string>(),
    decisions: [],
    observedRawValues: [],
    ...overrides,
  };
}

function makeRedactResult(overrides: { capture_id?: string; masks?: unknown[] } = {}) {
  return {
    image: {
      dataUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2wAA',
      pxW: 100,
      pxH: 100,
      capture_id: overrides.capture_id ?? 'cap-1',
      masks: (overrides.masks ?? []) as AppliedMask[],
      somLabels: [],
    },
    fullResolution: { canvas: {} as OffscreenCanvas, pxW: 100, pxH: 100 },
    scaleX: 1,
    scaleY: 1,
  } as unknown as SealContext['redactResult'];
}

function makeDet(overrides: Partial<Detection> = {}): Detection {
  return {
    id: 'd1',
    capture_id: 'cap-1',
    source: 'rule',
    category: 'EMAIL',
    confidence: 0.99,
    target: { kind: 'element', ref: 'fp-aaaa1111' },
    evidence: ['test@example.com'],
    rects: [{ x: 10, y: 10, width: 80, height: 20 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Layer A: Structural invariants (source-level)
// ---------------------------------------------------------------------------

const backgroundSrc = readFileSync(
  path.resolve(__dirname, '../../entrypoints/background.ts'),
  'utf8',
);
const agentHostSrc = readFileSync(
  path.resolve(__dirname, '../../agentHost/index.ts'),
  'utf8',
);

describe('Structural invariant: cleanMatch never escapes background.ts', () => {
  it('cleanMatch is declared inside runObservationPipeline, not at module scope', () => {
    const moduleScope = backgroundSrc.split('async function runObservationPipeline')[0]!;
    expect(moduleScope).not.toContain('cleanMatch');
  });

  it('cleanMatch is not part of the returned ObserveResult', () => {
    const returnMatch = /return \{[^}]*\}/.exec(backgroundSrc.split('cleanMatch')[1]!);
    if (returnMatch) {
      expect(returnMatch[0]).not.toContain('cleanMatch');
    }
    expect(backgroundSrc).not.toMatch(/ObserveResult[^{]*{[^}]*cleanMatch/);
  });

  it('processObservation() calls seal() unconditionally — no cleanMatch branch around it', () => {
    expect(agentHostSrc).toMatch(/await seal\(draft,/);
    expect(agentHostSrc).not.toContain('cleanMatch');
    const sealCallIndex = agentHostSrc.indexOf('await seal(draft,');
    expect(sealCallIndex).toBeGreaterThan(0);
  });

  it('the ObserveResult type returned by background carries only observation/change/tabId/stateToken', () => {
    expect(backgroundSrc).not.toMatch(/isStable|captureQuality|bestEffort|stableCapture/i);
    expect(agentHostSrc).not.toMatch(/isStable|captureQuality|bestEffort|stableCapture/i);
  });
});

// ---------------------------------------------------------------------------
// Layer B: Behavioural — seal() rejects PII regardless of capture stability
// ---------------------------------------------------------------------------

describe('Case 1: PII inserted after DOM harvest — DOM has PII, seal() must reject or mask', () => {
  /**
   * Scenario: HARVEST_TREE sees page without sensitive value.
   * Screenshot proceeds. Sensitive value is inserted into the page.
   * Stabilization mismatch forces fallback candidate.
   * Resulting candidate cannot pass privacy boundary unmasked.
   */
  it('rejects a raw email that survived into an element label (rule-scan)', async () => {
    const draft = makeDraft({
      elements: [
        {
          eid: 'E0',
          fp: 'fp1',
          role: 'textbox',
          label: 'Contact user@jotform.com',
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    await expect(seal(draft, makeCtx())).rejects.toMatchObject({ reason: 'rule-scan' });
  });

  it('rejects a raw phone number inserted into task/page text (rule-scan)', async () => {
    const draft = makeDraft({ task: 'Call me at +91 98765 43210 to confirm' });
    await expect(seal(draft, makeCtx())).rejects.toBeInstanceOf(SealError);
  });

  it('rejects a vault NAME value that leaked into a DOM element (known-value-leak)', async () => {
    const draft = makeDraft({
      elements: [
        {
          eid: 'E0',
          fp: 'fp1',
          role: 'textbox',
          label: 'Welcome Priya Sharma',
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    const ctx = makeCtx({
      vaultValues: [{ value: 'Priya Sharma', normalized: 'priya sharma', type: 'NAME' }],
    });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'known-value-leak' });
  });

  it('safely seals when the inserted PII is properly tokenized by vault', async () => {
    const vault = new TokenVault();
    await vault.init();
    const token = await vault.tokenize('EMAIL', 'user@jotform.com', {
      origin: 'https://form.jotform.com',
      source: 'page',
    });
    const draft = makeDraft({
      elements: [
        {
          eid: 'E0',
          fp: 'fp1',
          role: 'textbox',
          label: `Contact ${token}`,
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    const ctx = makeCtx({
      issuedTokens: new Set(vault.allTokens()),
      vaultValues: [{ value: 'user@jotform.com', normalized: 'user@jotform.com', type: 'EMAIL' }],
    });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('Case 2: PII exists in screenshot but not DOM candidate — fail closed', () => {
  /**
   * Scenario: DOM candidate contains no sensitive value.
   * Screenshot contains sensitive content.
   * mutationCounter changes, fallback candidate is selected.
   * Outgoing payload cannot contain sensitive screenshot content unmasked.
   */
  it('rejects with image-count when an unverified/raw image is attached without redactResult', async () => {
    const draft = makeDraft({
      image: 'data:image/webp;base64,rawUnredactedScreenshotData',
    });
    // No redactResult in ctx -> fail closed!
    await expect(seal(draft, makeCtx())).rejects.toMatchObject({ reason: 'image-count' });
  });

  it('rejects with coverage when screenshot contains sensitive detection rect with no mask', async () => {
    const draft = makeDraft({
      image: 'data:image/webp;base64,AAAA',
    });
    const ctx = makeCtx({
      decisions: [{ detection: makeDet({ rects: [{ x: 10, y: 10, width: 80, height: 20 }] }), action: 'FILL' }],
      redactResult: makeRedactResult({ masks: [] }), // No mask covers the detection!
    });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'coverage' });
  });

  it('rejects with mask-integrity when mask verification on the screenshot fails', async () => {
    mockVerifyResult = { ok: false, failures: [{ reason: 'unmasked pixel' }] };
    const draft = makeDraft({
      image: 'data:image/webp;base64,AAAA',
    });
    const ctx = makeCtx({
      decisions: [{ detection: makeDet({ rects: [{ x: 10, y: 10, width: 80, height: 20 }] }), action: 'FILL' }],
      redactResult: makeRedactResult({
        masks: [
          {
            rid: 'det-1',
            kind: 'FILL',
            type: 'EMAIL',
            pxRect: { x: 10, y: 10, width: 80, height: 20 },
            label: '[EMAIL]',
          },
        ],
      }),
    });
    try {
      await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'mask-integrity' });
    } finally {
      mockVerifyResult = { ok: true, failures: [] };
    }
  });

  it('rejects with capture-id-mismatch when screenshot capture_id does not match draft', async () => {
    const draft = makeDraft({
      capture_id: 'cap-draft-1',
      image: 'data:image/webp;base64,AAAA',
    });
    const ctx = makeCtx({
      redactResult: makeRedactResult({ capture_id: 'cap-screenshot-2' }),
    });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'capture-id-mismatch' });
  });

  it('text PII adjacent to the screenshot is still caught by rule-scan', async () => {
    const draft = makeDraft({
      image: 'data:image/webp;base64,AAAA',
      elements: [
        {
          eid: 'E0',
          fp: 'fp1',
          role: 'textbox',
          label: 'Credit card: 4111 1111 1111 1111',
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    const ctx = makeCtx({
      redactResult: makeRedactResult(),
    });
    await expect(seal(draft, ctx)).rejects.toBeInstanceOf(SealError);
  });
});

describe('Case 3: DOM from state A, screenshot from state B — mismatched candidate still sealed or rejected', () => {
  /**
   * Scenario: DOM candidate = state A, screenshot = state B.
   * State B contains sensitive content.
   * Verify: seal() rejects unmasked content OR correctly masks. Never allows unprotected payload.
   */
  it('rejects when state A DOM candidate contains unmasked PII', async () => {
    const draft = makeDraft({
      task: 'Fill in name: John Doe',
      elements: [
        {
          eid: 'E1',
          fp: 'fp2',
          role: 'textbox',
          label: 'Email: test@jotform.com',
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    await expect(seal(draft, makeCtx())).rejects.toBeInstanceOf(SealError);
  });

  it('rejects when state B screenshot contains unmasked sensitive region', async () => {
    const draft = makeDraft({
      image: 'data:image/webp;base64,AAAA',
    });
    const ctx = makeCtx({
      decisions: [{ detection: makeDet({ rects: [{ x: 5, y: 5, width: 50, height: 20 }] }), action: 'FILL' }],
      redactResult: makeRedactResult({ masks: [] }),
    });
    await expect(seal(draft, ctx)).rejects.toMatchObject({ reason: 'coverage' });
  });

  it('safely seals when DOM has no PII and screenshot is properly verified and masked', async () => {
    const draft = makeDraft({
      image: 'data:image/webp;base64,AAAA',
    });
    const ctx = makeCtx({
      decisions: [{ detection: makeDet({ rects: [{ x: 10, y: 10, width: 80, height: 20 }] }), action: 'FILL' }],
      redactResult: makeRedactResult({
        masks: [
          {
            rid: 'det-1',
            kind: 'FILL',
            type: 'EMAIL',
            pxRect: { x: 10, y: 10, width: 80, height: 20 },
            label: '[EMAIL]',
          },
        ],
      }),
    });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('Case 4: Continuous harmless mutations — best-effort fallback succeeds', () => {
  /**
   * Scenario: Live page mutates harmless DOM metadata (focus, styles, counters).
   * No PII changes.
   * Best-effort fallback produces candidate, seal() succeeds.
   */
  it('clean payload from an unstable-but-safe page passes seal() cleanly', async () => {
    const draft = makeDraft({
      task: 'Fill in my name and email on this form, but do not submit it.',
      elements: [
        {
          eid: 'E1',
          fp: 'fp-name',
          role: 'textbox',
          label: 'Name',
          input_type: 'text',
          has_value: false,
          bbox: [10, 50, 200, 30],
          visible: true,
          enabled: true,
        },
        {
          eid: 'E2',
          fp: 'fp-email',
          role: 'textbox',
          label: 'Email',
          input_type: 'email',
          has_value: false,
          bbox: [10, 100, 200, 30],
          visible: true,
          enabled: true,
        },
      ],
    });
    await expect(seal(draft, makeCtx())).resolves.toBeDefined();
  });

  it('task tokens issued by vault for name/email pass seal() without false positives', async () => {
    const vault = new TokenVault();
    await vault.init();
    const nameToken = await vault.tokenize('NAME', 'TestUser', {
      origin: 'https://form.jotform.com',
      source: 'task',
    });
    const emailToken = await vault.tokenize('EMAIL', 'testuser@example.com', {
      origin: 'https://form.jotform.com',
      source: 'task',
    });
    const draft = makeDraft({
      task: `Fill ${nameToken} and ${emailToken} into the form`,
    });
    const ctx = makeCtx({ issuedTokens: new Set(vault.allTokens()) });
    await expect(seal(draft, ctx)).resolves.toBeDefined();
  });
});

describe('Case 5: Existing stable capture — existing clean-match behavior is unchanged', () => {
  /**
   * Regression guard: when mutationCounter matches on first attempt, behavior is unchanged.
   */
  it('clean payload passes seal() exactly as before (no regression)', async () => {
    await expect(seal(makeDraft(), makeCtx())).resolves.toBeDefined();
  });

  it('a PII-carrying payload from a stable capture is still rejected (no regression)', async () => {
    const draft = makeDraft({
      elements: [
        {
          eid: 'E0',
          fp: 'fp1',
          role: 'textbox',
          label: 'asha@example.com',
          bbox: [0, 0, 1, 1],
          visible: true,
          enabled: true,
        },
      ],
    });
    await expect(seal(draft, makeCtx())).rejects.toBeInstanceOf(SealError);
  });

  it('cleanMatch flag is purely internal to background and does not affect agentHost or seal', () => {
    expect(agentHostSrc).not.toContain('cleanMatch');
  });
});

describe('Case 6: No usable capture — hard throw is preserved', () => {
  /**
   * Regression guard: the fix must not weaken the guard when no capture candidate exists.
   */
  it('background.ts still throws when no screenshot and not domOnly', () => {
    expect(backgroundSrc).toContain('throw new Error(`Capture did not stabilize after');
  });

  it('the throw condition checks !screenshotDataUrl && !finalStateToken && !finalCaptureId', () => {
    const throwLine = backgroundSrc.match(/if \(!domOnly.*screenshotDataUrl.*finalStateToken.*finalCaptureId/s);
    expect(throwLine).not.toBeNull();
  });

  it('a null candidate cannot be returned — the throw fires before the return statement', () => {
    const throwIdx = backgroundSrc.lastIndexOf('throw new Error(`Capture did not stabilize');
    const returnIdx = backgroundSrc.lastIndexOf('return { observation, change, tabId, stateToken');
    expect(throwIdx).toBeGreaterThan(0);
    expect(returnIdx).toBeGreaterThan(throwIdx);
  });
});
