import { mkdirSync } from 'node:fs';
import { test, expect } from '../e2e/fixtures/extension';
import { forceScenario, acceptConsent, respondToApproval } from '../e2e/fixtures/task';

/**
 * The scripted demo path for `login_credential` (hosted-inference session, Part D) — the second
 * of the two full task flows the hosted-model report requires, alongside `kyc-full-flow.demo.spec`.
 * Mirrors that file's structure and `AEGIS_DEMO_LIVE` convention on purpose, so both flows are
 * driven and read the same way:
 *
 *   - Default: `pnpm demo` forces the deterministic `login_credential` mock scenario.
 *   - `pnpm demo:live` (AEGIS_DEMO_LIVE=1): does NOT force a scenario, so `/v1/plan` reaches
 *     whatever the server's own AEGIS_ADAPTER is configured to (local Ollama or a hosted
 *     openai_compat endpoint — see server/.env.example). Expect real model latency; this test's
 *     timeout is extended accordingly in playwright.demo.config.ts.
 *
 * The credential row exists because login.html has a password field, which is what makes PASSWORD
 * a category of this task (AGENTS.md invariant 4/8: the raw password is typed into the panel once,
 * at consent time, lives only in the in-memory vault, and re-hydrates only inside a `type` action
 * on the consented origin — never logged, never sent to the server as anything but a token).
 */

const LIVE = !!process.env.AEGIS_DEMO_LIVE;
const SCREENSHOT_DIR = process.env.AEGIS_DEMO_SCREENSHOT_DIR;
const RAW_PASSWORD = 'sup3r-s3cr3t-demo-only';

async function screenshot(page: import('@playwright/test').Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

test.describe('login full flow demo', () => {
  test('consent + credential -> L4 type -> L5 sign in -> dashboard -> stop', async ({ context, sidepanelUrl }) => {
    const started = Date.now();
    if (LIVE) {
      test.setTimeout(600_000);
      console.log('[demo] AEGIS_DEMO_LIVE=1: no scenario forced — /v1/plan will reach the server\'s configured adapter.');
    } else {
      await forceScenario(context, 'login_credential');
    }

    // Same proof agent-scenarios.spec.ts's login_credential test makes: the raw password appears
    // in no request body and no console message, whichever adapter answered it.
    const requestBodies: string[] = [];
    context.on('request', (request) => {
      if (request.url().includes('/v1/plan')) {
        const body = request.postData();
        if (body) requestBodies.push(body);
      }
    });
    const consoleMessages: string[] = [];
    context.on('console', (message) => consoleMessages.push(message.text()));

    const targetPage = await context.newPage();
    await targetPage.goto('/login.html');
    await expect(targetPage.locator('#password')).toHaveValue('');
    await expect(targetPage.locator('#dashboard')).toBeHidden();

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Sign in and show me the dashboard.');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    await acceptConsent(panelPage, { credential: RAW_PASSWORD });

    const dashboard = targetPage.locator('#dashboard');
    if (LIVE) {
      // Same reasoning as kyc-full-flow.demo.spec.ts's LIVE branch: an unscripted model's plan
      // shape/order isn't guaranteed the way the mock's is, so this approves whatever it proposes,
      // in order, until sign-in actually succeeds (or the loop gives up and asks a question).
      const approval = panelPage.getByRole('dialog', { name: 'Action approval' });
      const question = panelPage.getByRole('dialog', { name: 'Task question' });
      for (let round = 0; round < 8 && !(await dashboard.isVisible()); round++) {
        const status = await panelPage.locator('[data-testid="task-status"]').innerText().catch(() => '?');
        console.log(`[demo][live] round ${round}: task-status=${status}, elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
        await Promise.race([
          approval.waitFor({ state: 'visible', timeout: 200_000 }),
          question.waitFor({ state: 'visible', timeout: 200_000 }),
          dashboard.waitFor({ state: 'visible', timeout: 200_000 }),
        ]).catch(() => {});
        if (await dashboard.isVisible()) break;
        if (await question.isVisible()) {
          const text = await question.innerText();
          console.log(`[demo][live] round ${round}: recovery question — ${text.replace(/\n/g, ' ')}`);
          break;
        }
        if (!(await approval.isVisible())) {
          console.log(`[demo][live] round ${round}: neither an approval nor a question showed up within 200s`);
          break;
        }
        const approvalText = await approval.innerText();
        console.log(`[demo][live] round ${round}: approving — ${approvalText.replace(/\n/g, ' ')}`);
        await respondToApproval(panelPage, 'approve');
      }
    } else {
      const typeApproval = panelPage.getByRole('dialog', { name: 'Action approval' });
      await expect(typeApproval).toBeVisible({ timeout: 15_000 });
      await expect(typeApproval).toContainText('L4');
      await respondToApproval(panelPage, 'approve');
      await expect(targetPage.locator('#password')).not.toHaveValue('');

      const clickApproval = panelPage.getByRole('dialog', { name: 'Action approval' });
      await expect(clickApproval).toBeVisible({ timeout: 15_000 });
      await expect(clickApproval).toContainText('L5');
      await respondToApproval(panelPage, 'approve');
    }

    await expect(dashboard).toBeVisible({ timeout: LIVE ? 60_000 : 15_000 });
    await expect(targetPage.locator('#dashboard-status')).toContainText('Signed in successfully');

    await screenshot(panelPage, 'demo-done-login-dashboard');

    // The actual proof: nowhere does the raw string appear, live model or mock.
    for (const body of requestBodies) expect(body).not.toContain(RAW_PASSWORD);
    for (const message of consoleMessages) expect(message).not.toContain(RAW_PASSWORD);
    const panelText = await panelPage.locator('body').innerText();
    expect(panelText).not.toContain(RAW_PASSWORD);

    // Done: the sign-in is verified, so the demo stops here deliberately rather than waiting for
    // the loop to re-propose on a now-hidden password field and hit NO_PASSWORD_FIELD on its own
    // (the behavior agent-scenarios.spec.ts's mock test already covers).
    await panelPage.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');

    console.log(`[demo] full run wall-clock: ${((Date.now() - started) / 1000).toFixed(1)}s (adapter: ${LIVE ? 'live' : 'mock'})`);
  });
});
