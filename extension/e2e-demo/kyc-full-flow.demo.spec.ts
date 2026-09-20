import { mkdirSync } from 'node:fs';
import { test, expect } from '../e2e/fixtures/extension';
import { forceScenario, acceptConsent, respondToApproval, zoomOut } from '../e2e/fixtures/task';

/**
 * The scripted demo path (demo-readiness session, Part C): one deterministic, recordable run on
 * the synthetic KYC page showing, in order: consent -> observe -> detections (including a face,
 * since kyc.html's profile photo is now a real synthetic face image, Part C) -> redaction ->
 * sealed payload (the Privacy Receipt panel, Part B) -> server plan -> L5 approval -> execute ->
 * verify -> a deliberate stop once the submission is verified.
 *
 * Two adapters, one script:
 *   - Default: `pnpm demo` forces the deterministic `kyc_submit` mock scenario (same mechanism
 *     `extension/e2e/agent-scenarios.spec.ts` uses), so this is fast and repeatable for recording.
 *   - `pnpm demo:live` (AEGIS_DEMO_LIVE=1): does NOT force a scenario, so `/v1/plan` reaches
 *     whatever the server's own AEGIS_ADAPTER is configured to (see README's Demo path section for
 *     how to point it at qwen2.5vl:7b via Ollama). Expect real model latency here (~43s p50 per
 *     call, measured in eval/reports/model-probe-qwen2.5vl-7b.md) — this test's timeout is
 *     extended accordingly in playwright.demo.config.ts.
 *
 * Reset between runs: each invocation launches a brand-new persistent browser context (the same
 * fixture `pnpm e2e` uses), so there is no session, vault or dialog state to clean up manually —
 * running `pnpm demo` twice in a row is always a cold start.
 *
 * AEGIS_DEMO_SCREENSHOT_DIR: when set, saves the deck stills (Part D) at the two moments that
 * matter for the story — the detections/redaction step and the verified-done step — instead of
 * re-driving this same flow a second time just to take a screenshot.
 */

const LIVE = !!process.env.AEGIS_DEMO_LIVE;
const SCREENSHOT_DIR = process.env.AEGIS_DEMO_SCREENSHOT_DIR;

async function screenshot(page: import('@playwright/test').Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

test.describe('kyc full flow demo', () => {
  test('consent -> observe -> detect+redact -> seal -> plan -> L5 approval -> execute -> verify -> stop', async ({ context, sidepanelUrl }) => {
    const started = Date.now();
    if (LIVE) {
      test.setTimeout(600_000);
      console.log('[demo] AEGIS_DEMO_LIVE=1: no scenario forced — /v1/plan will reach the server\'s configured adapter. Expect ~43s p50 per model call (eval/reports/model-probe-qwen2.5vl-7b.md); a multi-step task can take several minutes.');
    } else {
      await forceScenario(context, 'kyc_submit');
    }

    const targetPage = await context.newPage();
    await targetPage.goto('/kyc.html');
    await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma');
    await expect(targetPage.locator('#email')).toHaveValue('');
    await expect(targetPage.locator('#kyc-profile-photo')).toBeVisible();

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);

    // See zoomOut()'s own docblock: kyc.html is taller than one viewport, and a plan that fills
    // near the top then clicks Submit near the bottom needs both in view at once.
    await zoomOut(panelPage, targetPage, 0.67);
    await expect(targetPage.locator('#submit')).toBeInViewport();
    await expect(targetPage.locator('#full-name')).toBeInViewport();

    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Fill in the form and submit it.');
    await panelPage.getByLabel('Data type 2').selectOption('EMAIL');
    await panelPage.getByLabel('Data value 2').fill('priya@example.test');
    if (!LIVE) {
      // AADHAAR matches kyc.html's pre-filled value: supplying it as task data is what makes
      // determineNecessity() decide the field is "needed" (the task supplies/confirms a value
      // for it) rather than merely masked — minting a real token, not just a redaction, for the
      // split-screen still and this step's token count. Mock-only: the live model already needs
      // more steps than the mock's scripted plan for the plain two-field task (see below), and
      // adding a third field the model might also decide to "confirm" only compounds that.
      await panelPage.getByRole('button', { name: 'Add another value' }).click();
      await panelPage.getByLabel('Data type 3').selectOption('AADHAAR');
      await panelPage.getByLabel('Data value 3').fill('2345 6789 0123');
    }
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    // --- consent ---------------------------------------------------------------------------
    await acceptConsent(panelPage);

    // --- observe -> detect+redact -> seal: the privacy receipt for this step ---------------
    const receipt = panelPage.getByRole('region', { name: 'Privacy receipt' });
    await expect(receipt).toBeVisible({ timeout: LIVE ? 120_000 : 20_000 });
    // The face detector runs on kyc.html's profile photo (Part C) and the redaction manifest
    // records it as a BLUR — the one non-text redaction category this page has.
    await expect(receipt).toContainText('FACE');
    // AADHAAR + PASSWORD (at minimum) are tokenized/redacted on this page — the "at least two
    // token substitutions" the split-screen still needs to show. Mock-only: the live task above
    // deliberately doesn't add the AADHAAR data row (see comment there), so its token count isn't
    // guaranteed to reach 2 — this is about a legible deck still, not the live path's own success.
    const tokenCountText = await receipt.locator('.receipt-counters').innerText();
    const tokenCount = Number(/(\d+)\s+tokens?/.exec(tokenCountText)?.[1] ?? '0');
    if (!LIVE) expect(tokenCount).toBeGreaterThanOrEqual(2);

    await screenshot(panelPage, 'privacy-receipt-kyc-redaction');

    const doneStatus = targetPage.locator('#kyc-submitted-status');
    if (LIVE) {
      // --- server plan -> L5 approval -> execute -> verify (live model) --------------------
      // Real, measured finding (this session): unlike the mock's deterministic kyc_submit
      // script, qwen2.5vl:7b does not go straight to Submit — it proposed filling the empty
      // PAN field first (a field this task never asked for), which needed its own L3 approval
      // before the model ever got to the L5 submit click. A scripted demo against a live model
      // cannot assume a fixed number or order of approvals the way the mock path can, so this
      // approves whatever the model proposes, in order, until the form is actually submitted.
      const approval = panelPage.getByRole('dialog', { name: 'Action approval' });
      const question = panelPage.getByRole('dialog', { name: 'Task question' });
      for (let round = 0; round < 8 && !(await doneStatus.isVisible()); round++) {
        const status = await panelPage.locator('[data-testid="task-status"]').innerText().catch(() => '?');
        console.log(`[demo][live] round ${round}: task-status=${status}, elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
        await Promise.race([
          approval.waitFor({ state: 'visible', timeout: 200_000 }),
          question.waitFor({ state: 'visible', timeout: 200_000 }),
          doneStatus.waitFor({ state: 'visible', timeout: 200_000 }),
        ]).catch(() => {});
        if (await doneStatus.isVisible()) break;
        if (await question.isVisible()) {
          const text = await question.innerText();
          console.log(`[demo][live] round ${round}: recovery question — ${text.replace(/\n/g, ' ')}`);
          break; // the model got stuck and recovery is asking the user — a real, reportable outcome, not a bug in this script
        }
        if (!(await approval.isVisible())) {
          console.log(`[demo][live] round ${round}: neither an approval nor a question showed up within 200s`);
          break;
        }
        const approvalText = await approval.innerText();
        console.log(`[demo][live] round ${round}: approving — ${approvalText.replace(/\n/g, ' ')}`);
        await respondToApproval(panelPage, 'approve');
      }
      await expect(doneStatus).toBeVisible({ timeout: 60_000 });
    } else {
      // --- server plan -> L5 approval -> execute -> verify (mock kyc_submit) ----------------
      await expect(targetPage.locator('#email')).toHaveValue('priya@example.test', { timeout: 20_000 });
      const approval = panelPage.getByRole('dialog', { name: 'Action approval' });
      await expect(approval).toBeVisible({ timeout: 15_000 });
      await expect(approval).toContainText('L5');
      await respondToApproval(panelPage, 'approve');
      await expect(doneStatus).toBeVisible({ timeout: 15_000 });
    }
    await expect(targetPage.locator('#kyc-form')).toBeHidden();

    // --- done: the submission is verified, so the demo stops here deliberately, the way a user
    // watching it succeed would, rather than waiting for the scenario to re-propose on the now-
    // hidden Submit control and stop itself via the recovery/ask-user path. ---------------------
    await panelPage.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');

    await screenshot(panelPage, 'demo-done-kyc-submitted');

    console.log(`[demo] full run wall-clock: ${((Date.now() - started) / 1000).toFixed(1)}s (adapter: ${LIVE ? 'live' : 'mock'})`);
  });
});
