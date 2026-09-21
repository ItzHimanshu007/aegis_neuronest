import { describe, expect, it, vi } from 'vitest';
import { seal, SealError } from '../firewall';
import type { SealContext } from '../firewall';
import type { DraftPayload, DraftRedaction } from '../payloadBuilder';

/**
 * Regression test for a `seal()` false positive found by the Stage 4 held-out corpus
 * (`eval/reports/stage4-heldout.md`).
 *
 * The bug: `orderIdRule` is context-gated but very broad — `[A-Za-z0-9][A-Za-z0-9-]{4,24}` — so on
 * a block whose field context is ORDER_ID it matches the bare words in the LABEL, not just the ID.
 * A field labelled "Order number" yields an observed raw value of literally `number`. The leak
 * check then scanned every payload string with a 4-character floor, including `redactions[].type`,
 * which for a card field is the literal string `CARD_NUMBER` — and `CARD_NUMBER` contains `number`.
 * `seal()` threw `known-value-leak` on a payload that leaked nothing.
 *
 * Reachable on a real checkout page, not just on generated ones: "Order number" plus a saved card
 * is an ordinary combination.
 *
 * Both halves are pinned here. The fix must stop the false positive AND must not have blunted the
 * check: a genuine leak of the same value through a page-derived field still has to throw.
 */

// verifyMasks needs a real OffscreenCanvas, which happy-dom doesn't provide — same mock the main
// firewall suite uses. The mask path is exercised for real in the Playwright suite.
vi.mock('../redactor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../redactor')>();
  return { ...actual, verifyMasks: vi.fn(async () => ({ ok: true, failures: [] })) };
});

function makeDraft(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    session: 'sess-1',
    capture_id: 'cap-1',
    schema: 'aegis/2',
    state_token: 'Sabcdefghij',
    mode: 'balanced',
    task: 'Check the order',
    page: { url: 'https://shop.example.test/checkout', title: 'Checkout' },
    elements: [
      {
        eid: 'E0',
        fp: 'fp-aaaa1111',
        role: 'textbox',
        label: 'Order reference',
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

/** The redaction a card field produces: `type` is the Category name, from `scene/index.ts`. */
const CARD_REDACTION: DraftRedaction = {
  rid: 'r1',
  eid: 'E0',
  kind: 'LABELLED_FILL',
  type: 'CARD_NUMBER',
  bbox: [10, 10, 100, 20],
  reason: 'field_context+rule -> TOKEN',
};

describe('seal: locally-generated vocabularies are not leak-check haystacks', () => {
  it('does not refuse a payload because a page word is a substring of a Category name', async () => {
    // Exactly the held-out failure: the observed ORDER_ID value is the word `number`, and the
    // payload carries a CARD_NUMBER redaction.
    const result = await seal(
      makeDraft({ redactions: [CARD_REDACTION] }),
      makeContext({ observedRawValues: [{ value: 'number', category: 'ORDER_ID' }] }),
    );
    expect(result.payload.size).toBeGreaterThan(0);
  });

  it('does not refuse on `kind` either, where a 4-character word collides with FILL', async () => {
    await expect(
      seal(
        makeDraft({ redactions: [{ ...CARD_REDACTION, kind: 'FILL', type: 'EMAIL' }] }),
        makeContext({ observedRawValues: [{ value: 'FILL', category: 'ORDER_ID' }] }),
      ),
    ).resolves.toBeDefined();
  });

  it('does not refuse on `reason`, built from the source and action vocabularies', async () => {
    await expect(
      seal(
        makeDraft({ redactions: [CARD_REDACTION] }),
        makeContext({ observedRawValues: [{ value: 'field_context', category: 'ORDER_ID' }] }),
      ),
    ).resolves.toBeDefined();
  });

  // --- the check must NOT have been blunted ---------------------------------------------------

  it('still throws when that same value really does leak through a page-derived label', async () => {
    await expect(
      seal(
        makeDraft({
          redactions: [CARD_REDACTION],
          elements: [{ ...makeDraft().elements[0]!, label: 'number' }],
        }),
        makeContext({ observedRawValues: [{ value: 'number', category: 'ORDER_ID' }] }),
      ),
    ).rejects.toThrow(SealError);
  });

  it('still throws when a value leaks through the task text', async () => {
    await expect(
      seal(
        makeDraft({ task: 'Look up order number 4415512', redactions: [CARD_REDACTION] }),
        makeContext({ observedRawValues: [{ value: '4415512', category: 'ORDER_ID' }] }),
      ),
    ).rejects.toThrow(SealError);
  });

  it('still throws when a real identifier leaks through a page-derived element label', async () => {
    await expect(
      seal(
        makeDraft({
          elements: [{ ...makeDraft().elements[0]!, label: 'Card ending 4111111111111111' }],
        }),
        makeContext({ observedRawValues: [{ value: '4111111111111111', category: 'CARD_NUMBER' }] }),
      ),
    ).rejects.toThrow(SealError);
  });
});
