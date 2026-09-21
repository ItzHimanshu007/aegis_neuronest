import { mkdirSync } from 'node:fs';
import { test, expect } from '../e2e/fixtures/extension';
import { acceptConsent, readSnapshot, startTask, stopFromQuestion } from '../e2e/fixtures/task';
import { assertDemoServerReady } from './preconditions';

/**
 * The unverified-claim demo (Stage 5B): AEGIS does not take the model's word for it.
 *
 * The other half of the safety story. `blocked-exfiltration.demo.spec.ts` shows a plan refused
 * before it runs; this shows a COMPLETION refused after the fact — the model says the task is done,
 * and Aegis re-observes the page, cannot find the evidence the model offered, and declines to call
 * it finished.
 *
 * No scenario is forced here on purpose. The default mock adapter
 * (`server/app/vlm/mock_adapter.py`) answers with `done` carrying `text_present: "Task complete"`,
 * a string that appears on no demo or generated page. That is deliberate and is itself a Stage 4
 * finding: the adapter used to claim `url_path_prefix: "/"`, which every page satisfies, so a
 * completion could never fail. `verifier.ts` now rejects vacuous `done` evidence outright, and the
 * adapter offers evidence that is checkable and absent.
 *
 * What this proves in the real control path:
 *
 *   1. `verify()` runs against the RE-OBSERVED page, not against the model's assertion.
 *   2. The run never reaches state `done`. `runAgentLoop` only moves to `done` when verification
 *      passes, so a claimed-but-unverified completion cannot present as success.
 *   3. `falseSuccess` is set and shown to the user in words, rather than the run simply ending.
 *
 * This is the distinction requirement F asks for: VERIFIED SUCCESS vs MODEL CLAIMED SUCCESS.
 */

const SCREENSHOT_DIR = process.env.AEGIS_DEMO_SCREENSHOT_DIR;

async function screenshot(page: import('@playwright/test').Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

test.describe('unverified claim demo', () => {
  test.beforeEach(async ({ request }) => assertDemoServerReady(request));

  test('model claims the task is done -> Aegis re-checks the page, rejects the claim, and says so', async ({ context, sidepanelUrl }) => {
    test.setTimeout(120_000);
    const started = Date.now();

    // No forceScenario(): the default mock adapter's own `done` claim is the subject here.
    //
    // search.html deliberately, not kyc.html: MockAdapter branches on `page.type == "kyc_form"` and
    // answers a KYC page with a fill-then-ask_user plan, never reaching the `done` claim this demo
    // is about. Any non-KYC page takes the `done` branch.
    const { targetPage, panelPage } = await startTask(
      context,
      sidepanelUrl,
      '/search.html',
      'Confirm that the order has been placed.',
    );
    await acceptConsent(panelPage);

    // --- the claim is checked, and refused -----------------------------------------------------
    const note = panelPage.getByTestId('false-success-note');
    await expect(note).toBeVisible({ timeout: 90_000 });
    await expect(note).toContainText('could not confirm');

    await screenshot(panelPage, 'demo-unverified-claim-rejected');

    // The run must NOT present as finished: `done` is reachable only through a passing verify().
    await expect(panelPage.locator('[data-testid="task-status"]')).not.toHaveText('done');
    // And the evidence the model offered genuinely is not on the page — the claim was false, not
    // merely unproven.
    await expect(targetPage.getByText('Task complete')).toHaveCount(0);

    // --- recorded honestly ---------------------------------------------------------------------
    await stopFromQuestion(panelPage);
    const snapshot = await readSnapshot(panelPage);
    expect(snapshot.falseSuccess, 'the rejected completion claim must be recorded').toBe(true);
    expect(snapshot.state).not.toBe('done');
    // No timeline row may claim the task finished successfully.
    expect(snapshot.timeline.some((entry) => entry.action === 'done' && entry.verdict === 'PASS')).toBe(false);

    console.log(
      `[demo] unverified-claim run: falseSuccess=${snapshot.falseSuccess}, final state=${snapshot.state}, ` +
        `wall-clock ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  });
});
