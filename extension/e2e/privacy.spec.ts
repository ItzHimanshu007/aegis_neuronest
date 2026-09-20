import { TOKEN_PATTERN, isToken } from '../shared/schema/tokens';
import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { digitsOnly, observeAndSanitize, readGroundTruth, sealedText } from './fixtures/sanitize';

/**
 * Stage 2's headline acceptance criterion: **zero synthetic raw PII values in the sealed bytes**.
 *
 * The sealed bytes are the exact bytes `send()` transmits, so this is a direct test of what would
 * leave the device — not a proxy for it.
 */

/** Categories the policy deliberately lets through as-is, so their values legitimately appear. */
const ALLOWED_CATEGORIES = new Set(['NONE', 'CITY', 'PIN_CODE', 'EMPLOYER', 'DATE', 'ORDER_ID', 'IFSC']);

test.describe('pii-zoo.html: nothing raw survives into the sealed payload', () => {
  test('no non-ALLOW ground-truth value appears in the sealed bytes, in any form', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html?email=asha.query@example.com&ref=ORD-99123');

    const groundTruth = await readGroundTruth(targetPage);
    expect(groundTruth.length, 'the zoo page should declare ground truth').toBeGreaterThan(20);

    const result = await observeAndSanitize(panelPage, targetPage, 'Complete this form');
    const sealed = sealedText(result);
    const sealedLower = sealed.toLowerCase();
    const sealedDigits = digitsOnly(sealed);

    const leaks: string[] = [];
    for (const { category, value } of groundTruth) {
      if (ALLOWED_CATEGORIES.has(category)) continue;
      if (value.length < 4) continue; // below LEAK_MIN_LEN, not meaningfully identifying

      if (sealedLower.includes(value.toLowerCase())) {
        leaks.push(`${category}: "${value}" (verbatim)`);
        continue;
      }
      const valueDigits = digitsOnly(value);
      if (valueDigits.length >= 6 && sealedDigits.includes(valueDigits)) {
        leaks.push(`${category}: "${value}" (digits-only form)`);
      }
    }

    expect(leaks, `raw PII leaked into the sealed bytes:\n${leaks.join('\n')}`).toEqual([]);
  });

  test('the URL query is dropped and the title is sanitized', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html?email=asha.query@example.com&ref=ORD-99123');
    const result = await observeAndSanitize(panelPage, targetPage);
    const sealed = sealedText(result);

    // The query carried an email; neither the query nor its value may survive.
    expect(sealed).not.toContain('asha.query@example.com');
    expect(sealed).not.toContain('email=');
    expect(sealed).not.toContain('ORD-99123');

    // The page <title> is "PII Zoo for asha.verma@example.com" — the address must be gone.
    expect(sealed).not.toContain('asha.verma@example.com');
  });

  test('planted token strings are neutralized, and no forged token survives', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    const result = await observeAndSanitize(panelPage, targetPage);
    const sealed = sealedText(result);

    // The page plants [[PII:EMAIL:abcdefgh]] and a zero-width variant. Neither may appear, and
    // seal()'s token check would have thrown if one had.
    expect(sealed).not.toContain('[[PII:EMAIL:abcdefgh]]');
    expect(sealed).not.toContain('[[PII:NAME:ijklmnop]]');

    // Every token that IS present must be one the vault issued — seal() enforces this, so the
    // payload existing at all is the proof; this assertion documents it.
    const tokens = sealed.match(new RegExp(TOKEN_PATTERN.source, 'g')) ?? [];
    for (const token of tokens) {
      expect(isToken(token)).toBe(true);
    }
  });

  test('canvas, img and cross-origin iframe regions are all masked', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');

    // The media row sits well below the fold. Media outside the viewport isn't in the screenshot
    // at all, so there is correctly nothing to mask — scroll it into view so this test exercises
    // what it claims to.
    await targetPage.evaluate(() => document.getElementById('zoo-canvas')!.scrollIntoView({ block: 'center' }));

    const result = await observeAndSanitize(panelPage, targetPage);

    // The canvas and the <img> are opaque to Aegis until Stage 6 vision, so both must become
    // UNSCANNED_MEDIA and be fully filled.
    const unscanned = result.preview.detections.filter((d) => d.category === 'UNSCANNED_MEDIA');
    expect(unscanned.length, 'the canvas and the img must both be treated as unscanned media').toBeGreaterThanOrEqual(2);
    for (const detection of unscanned) {
      expect(detection.action).toBe('FILL_REGION');
    }

    // The cross-origin iframe has two correct outcomes, exactly as in the Stage 1 frames test:
    // either it stays opaque (another UNSCANNED_MEDIA region), or Stage 1's FRAME_HELLO size
    // match resolved it into a real mapped frame — in which case its CONTENT went through this
    // same pipeline instead of being blanket-masked. What must never happen is it being silently
    // dropped, so assert its framed field either produced detections or is masked.
    const observation = await panelPage.evaluate(
      () =>
        (window as unknown as { __aegisLastObserveResult?: { observation: { frames: Array<{ mapping: string }> } } }).__aegisLastObserveResult?.observation
          .frames ?? [],
    );
    const iframeResolved = observation.some((f) => f.mapping === 'src-size-match');
    const iframeMaskedAsMedia = unscanned.length >= 3;
    expect(iframeResolved || iframeMaskedAsMedia, 'the cross-origin iframe must be either mapped as a frame or masked as unscanned media').toBe(true);
  });

  test('secret fields (password/CVV/OTP) never contribute a length bucket', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    const result = await observeAndSanitize(panelPage, targetPage);
    const payload = JSON.parse(sealedText(result)) as { elements: Array<{ input_type?: string; value_len_bucket?: string; label: string }> };

    for (const element of payload.elements) {
      const label = element.label.toLowerCase();
      const isSecret = element.input_type === 'password' || label.includes('cvv') || label.includes('one time password');
      if (isSecret) {
        expect(element.value_len_bucket, `secret field "${element.label}" must not carry a length bucket`).toBeUndefined();
      }
    }
  });

  test('the STALE fallback masks the whole block when the page mutates mid-capture', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');

    // Mutate the text AFTER the observation is captured but before span rects are resolved, by
    // clicking the page's own mutate button and then sanitizing against the now-stale capture.
    await targetPage.bringToFront();
    await targetPage.click('#mutate-btn');

    const result = await observeAndSanitize(panelPage, targetPage);
    // Either the fresh capture picked up the new text (no fallback needed), or the span-rect
    // service reported STALE and the whole block was masked — both are correct, fail-closed
    // outcomes. What must NOT happen is the stale email surviving into the payload.
    expect(sealedText(result)).not.toContain('stale.test@example.com');
  });
});

test.describe('kyc.html: the Stage 1 page still sanitizes cleanly', () => {
  test('no known synthetic value from kyc.html reaches the sealed bytes', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await observeAndSanitize(panelPage, targetPage, 'Complete the KYC form');
    const sealed = sealedText(result);

    for (const value of ['Asha Verma', 'hunter22', '2345 6789 0123', '234567890123', '221B, MG Road']) {
      expect(sealed, `"${value}" must not appear in the sealed bytes`).not.toContain(value);
    }
    expect(digitsOnly(sealed)).not.toContain('234567890123');
  });

  test('send() delivers exactly the sealed bytes and the server verifies the digest', async ({ context, sidepanelUrl }) => {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
    const result = await observeAndSanitize(panelPage, targetPage);

    // The mock server must be running for this one (pnpm server).
    const serverUp = await panelPage.evaluate(async () => {
      try {
        const r = await fetch('http://localhost:8000/health');
        return r.ok;
      } catch {
        return false;
      }
    });
    test.skip(!serverUp, 'requires the mock server (pnpm server) to be running');

    await panelPage.getByRole('button', { name: 'Send this to the server' }).click();
    await expect(panelPage.locator('pre', { hasText: 'sent' })).toBeVisible({ timeout: 15_000 });

    const sentText = await panelPage.locator('pre', { hasText: 'sent' }).innerText();
    expect(sentText).toContain(result.preview.digest);
  });
});

test.describe('span-rect lookup', () => {
  test('resolves every text span on a static page instead of falling back to whole-block masks', async ({ context, sidepanelUrl }) => {
    // Regression guard. The panel used to hand the content script the viewport object in place of
    // the capture's StateToken — structurally similar, but with no `mutationCounter`, so the
    // freshness check reported every lookup stale and the redactor fell back to masking each
    // detection's entire text block. The payload stayed safe (fail-closed), which is exactly why
    // nothing caught it: the only visible symptom was a screenshot blacked out far past the PII.
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
    const result = await observeAndSanitize(panelPage, targetPage);

    expect(
      result.preview.spanFallbacks,
      'pii-zoo.html is static, so no span lookup has any reason to be stale or not-found',
    ).toEqual([]);
    expect(
      result.preview.detections.some((d) => d.targetKind === 'text_span' && d.rectCount > 0),
      'text-span detections must carry real rects',
    ).toBe(true);
  });
});
