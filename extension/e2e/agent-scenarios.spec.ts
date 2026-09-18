import { test, expect } from './fixtures/extension';
import { forceScenario, startTask, acceptConsent, respondToApproval, stopFromQuestion, readSnapshot, zoomOut } from './fixtures/task';

/**
 * Stage 3B Part II: the rest of the Stage 3A mock-scenario matrix, driven through the REAL,
 * fully-wired agent loop (consent, planner client, Authority Gate, executor, reacquire/rehydrate,
 * verify) — not the server-side unit tests in server/tests/test_mock_scenarios.py, which only
 * prove the scenario's OWN plan shape. Every test here first asserts the page's actual starting
 * condition, matching this session's rule (the checkpoint's bugs came from tests that passed
 * without their setup ever holding).
 */

test.describe('answer_balance', () => {
  test('the resolved value is displayed in the panel with its source site labelled', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'answer_balance');
    // determineNecessity() (extension/privacy/policy.ts) only tokenizes a page value the task
    // does not itself supply into an editable field of a matching category — a read-only "what is
    // X" question about page content qualifies for neither rule, so FINANCIAL_VALUE would
    // otherwise be FILLed (masked), never vaulted, and the mock's `_token_for` would fall back to
    // an un-vaulted stand-in the panel correctly shows as "[unavailable token]". Supplying the
    // EXACT page value as task data (rule (a): a detection matching an already-vaulted value is
    // "needed") is what actually makes this a meaningful display test rather than proving the
    // fallback. FINANCIAL_VALUE wasn't reachable from the panel's task-data dropdown at all before
    // this session — added alongside this test (TaskPanel.tsx's CATEGORIES list).
    //
    // Detection is viewport-limited (see baseline.spec.ts), so the row has to actually be on
    // screen before the task starts.
    const targetPage = await context.newPage();
    await targetPage.goto('/pii-zoo.html');
    const balanceCell = targetPage.locator('[data-gt="FINANCIAL_VALUE"]');
    await expect(balanceCell).toContainText('42,318.00');
    const balanceText = (await balanceCell.innerText()).trim();
    await balanceCell.scrollIntoViewIfNeeded();
    await expect(balanceCell).toBeInViewport();

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('What is the account balance shown on this page?');
    await panelPage.getByLabel('Data type 1').selectOption('FINANCIAL_VALUE');
    await panelPage.getByLabel('Data value 1').fill(balanceText);
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    await acceptConsent(panelPage);
    const answerSection = panelPage.getByRole('region', { name: 'Model answer' });
    await expect(answerSection).toBeVisible({ timeout: 20_000 });
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('done');
    await expect(answerSection).not.toContainText('unavailable token');
    await expect(answerSection).toContainText(balanceText);
    // The source site is labelled next to the resolved value — untrusted-text framing plus origin.
    await expect(answerSection).toContainText('localhost:5174');
  });
});

test.describe('stale_state', () => {
  test('a response with a wrong state_token is rejected client-side and the loop re-observes instead of acting', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'stale_state');
    const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/kyc.html', 'Fill in my name.', [{ category: 'NAME', value: 'Priya Sharma' }]);
    await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma'); // starting condition

    await acceptConsent(panelPage);
    // stale_state always returns a mismatched state_token, so checkPlan rejects every attempt —
    // recovery replans until the budget forces asking the user.
    await stopFromQuestion(panelPage, 30_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');

    // Never acted on the stale plan's own action (a harmless `wait`, but the point is it never runs).
    await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma');
    const snapshot = await readSnapshot(panelPage);
    expect(snapshot.timeline.some((e) => e.action === 'type')).toBe(false);
  });
});

test.describe('loop', () => {
  test('a repeatedly failing scenario triggers recovery -> ask_user -> the user can stop', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'loop');
    // The scenario targets the first visible, non-occluded element (mock_scenarios.py's
    // `_first_actionable`) — on kyc.html that is the "← back" link if it's on screen, and
    // clicking a real link repeatedly navigates the page rather than failing identically, which
    // breaks the very premise this test needs. Scroll it out of view first so the target is an
    // inert text field instead.
    const targetPage = await context.newPage();
    await targetPage.goto('/kyc.html');
    // #full-name sits right below the back link at this viewport size, so scrolling to IT still
    // leaves the link on screen too — scroll to a field further down the form instead.
    await targetPage.locator('#password').scrollIntoViewIfNeeded();
    await expect(targetPage.locator('a', { hasText: '← back' })).not.toBeInViewport();
    await expect(targetPage.locator('#full-name')).not.toBeInViewport();

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Click the same thing over and over.');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    await acceptConsent(panelPage);
    // The scenario always emits the identical click with an unsatisfiable expect, so verify()
    // fails identically every time until the loop/no-progress detector trips.
    await stopFromQuestion(panelPage, 30_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');
    await expect(targetPage).toHaveURL(/kyc\.html/); // never navigated away
    // LOOP_DETECTED/NO_PROGRESS themselves are recorded on the runner's internal history, not the
    // exported timeline (which records each attempt's own verify() code) — so the observable proof
    // that the detector actually fired, rather than the user just stopping an ordinary slow task,
    // is repeated identical-action failures followed by a stop with no further attempts.
    const snapshot = await readSnapshot(panelPage);
    const clickFails = snapshot.timeline.filter((e) => e.action === 'click' && e.verdict === 'FAIL');
    expect(clickFails.length, 'the same failing click must have been retried, not attempted once').toBeGreaterThanOrEqual(2);
  });
});

test.describe('impossible', () => {
  test('a fail response surfaces clearly and the task ends with nothing left running', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'impossible');
    const { panelPage } = await startTask(context, sidepanelUrl, '/kyc.html', 'Do something this page cannot do.');
    await acceptConsent(panelPage);
    const answerSection = panelPage.getByRole('region', { name: 'Model answer' });
    await expect(answerSection).toBeVisible({ timeout: 20_000 });
    await expect(answerSection).toContainText('TASK_NOT_POSSIBLE_ON_THIS_PAGE');
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('failed');
    // "Nothing left running": Stop is disabled (the task is over) and the task-data fields are
    // editable again (`start()` clears the task text itself, so Start stays disabled until new
    // text is typed — that's the panel always clearing input on run, not something left running).
    await expect(panelPage.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
    await expect(panelPage.getByLabel('Task', { exact: true })).toBeEditable();
  });
});

test.describe('banner_first', () => {
  test('the covering banner is closed before the agent acts on the element beneath it', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'banner_first');
    const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/kyc.html?banner=1', 'Dismiss whatever is covering the form.');
    // Starting condition: the banner is actually covering Submit, not just present.
    const banner = targetPage.locator('#cookie-banner');
    await expect(banner).toBeVisible();
    const submitBox = await targetPage.locator('#submit').boundingBox();
    const bannerBox = await banner.boundingBox();
    expect(submitBox && bannerBox && bannerBox.y < submitBox.y + submitBox.height, 'banner must actually overlap Submit for this scenario to test anything').toBe(true);

    await acceptConsent(panelPage);
    await expect(banner).toBeHidden({ timeout: 20_000 });
    // The banner hiding and the timeline entry recording it both come from the same executed
    // action, but through different paths (a DOM mutation vs. a React state update reaching the
    // summary <pre>) — poll rather than read once, so a benign ordering race doesn't fail this.
    await expect(async () => {
      const snapshot = await readSnapshot(panelPage);
      expect(snapshot.timeline.some((e) => e.action === 'click' && e.verdict === 'PASS')).toBe(true);
    }).toPass({ timeout: 10_000 });

    // The scenario re-proposes the same dismiss click on every replan (it matches by label, not
    // by "is anything still occluded"), and the dismiss control is now hidden, not just closed —
    // so the loop keeps retrying an invisible target until it asks the user. That is a real,
    // separate finding (the scenario has no "already done" signal), not this test's business to
    // fix; stop it the same way a user would.
    await stopFromQuestion(panelPage, 20_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');
  });
});

test.describe('login_credential', () => {
  test('credential row in consent; L4 approval; login succeeds; the raw password appears nowhere', async ({ context, sidepanelUrl }) => {
    test.setTimeout(90_000);
    const RAW_PASSWORD = 'sup3r-s3cr3t-e2e-only';
    await forceScenario(context, 'login_credential');

    // Capture every /v1/plan request body and every console message for the whole test, so
    // "appears in no request body, no log" is actually checked, not assumed.
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
    await expect(targetPage.locator('#password')).toHaveValue(''); // never pre-filled
    await expect(targetPage.locator('#dashboard')).toBeHidden();

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Sign in and show me the dashboard.');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    // Credential row appears in consent because the page's password field makes PASSWORD part of
    // this task's categories; filling it here is the ONLY place the password ever comes from.
    await acceptConsent(panelPage, { credential: RAW_PASSWORD });

    // L4: approval required for the password type action.
    const typeApproval = panelPage.getByRole('dialog', { name: 'Action approval' });
    await expect(typeApproval).toBeVisible({ timeout: 15_000 });
    await expect(typeApproval).toContainText('L4');
    await respondToApproval(panelPage, 'approve');
    await expect(targetPage.locator('#password')).not.toHaveValue('');

    // L5: approval required for the Sign in commit.
    const clickApproval = panelPage.getByRole('dialog', { name: 'Action approval' });
    await expect(clickApproval).toBeVisible({ timeout: 15_000 });
    await expect(clickApproval).toContainText('L5');
    await respondToApproval(panelPage, 'approve');

    // Login succeeds: the dashboard replaces the form.
    await expect(targetPage.locator('#dashboard')).toBeVisible({ timeout: 15_000 });
    await expect(targetPage.locator('#dashboard-status')).toContainText('Signed in successfully');

    // The scenario has no "already logged in" signal, so on the next round it looks for a
    // password field again — and, login.html having hidden the whole form on success, finds
    // none: an invisible element carries no `input_type` in the outbound payload at all
    // (extension/scene/index.ts, by design — see the WebP-vs-scroll comment above for the same
    // rule biting kyc_submit). `login_credential`'s own `next(el for el in payload.elements if
    // el.input_type == "password")` (mock_scenarios.py) then finds nothing and returns a `fail`
    // plan with reason NO_PASSWORD_FIELD — a clean, correct terminal state, not a hang.
    await expect(panelPage.getByRole('region', { name: 'Model answer' })).toContainText('NO_PASSWORD_FIELD', { timeout: 20_000 });
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('failed');

    // The actual proof: nowhere does the raw string appear.
    for (const body of requestBodies) {
      expect(body).not.toContain(RAW_PASSWORD);
    }
    for (const message of consoleMessages) {
      expect(message).not.toContain(RAW_PASSWORD);
    }
    const panelText = await panelPage.locator('body').innerText();
    expect(panelText).not.toContain(RAW_PASSWORD);
    const snapshot = await readSnapshot(panelPage);
    expect(JSON.stringify(snapshot)).not.toContain(RAW_PASSWORD);
  });
});

test.describe('kyc_submit', () => {
  test('Approve: L5 approval before submit, then the page shows the submitted state', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'kyc_submit');
    const targetPage = await context.newPage();
    await targetPage.goto('/kyc.html');
    await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma');
    await expect(targetPage.locator('#email')).toHaveValue('');
    await expect(targetPage.locator('#kyc-submitted-status')).toHaveCount(0); // not already submitted

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    // Real finding: kyc.html is taller than this harness's fixed browser window, and Full name
    // (top) to Submit (bottom) spans MORE of the page than one viewport holds. Server-side,
    // Full name only gets skipped as "already correct" when it's actually visible — an invisible
    // field carries no `has_value` in the outbound payload at all (extension/scene/index.ts), by
    // design, so the server has nothing to compare against. Client-side, `el.focus()` for a type
    // action default-scrolls its target into view, and nothing re-scrolls a LATER target (the
    // click on Submit) back into frame — so a plan combining a near-top fill with a far-below
    // click can permanently fail NOT_VISIBLE. Zooming out (a real user action, the same technique
    // calibration.spec.ts uses) is what actually resolves it, not a scroll position: there is no
    // scroll offset that keeps a 199px-to-774px span inside a 563px viewport, but shrinking that
    // span with real page zoom does.
    await zoomOut(panelPage, targetPage, 0.67);
    await expect(targetPage.locator('#submit')).toBeInViewport();
    await expect(targetPage.locator('#full-name')).toBeInViewport();

    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Fill in the form and submit it.');
    // Full name is already correct and the task doesn't mention it, so `_fill_actions()`
    // (mock_scenarios.py) leaves it alone — only EMAIL, which starts empty, needs task data.
    await panelPage.getByLabel('Data type 2').selectOption('EMAIL');
    await panelPage.getByLabel('Data value 2').fill('priya@example.test');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    await acceptConsent(panelPage);
    await expect(targetPage.locator('#email')).toHaveValue('priya@example.test', { timeout: 20_000 });

    const approval = panelPage.getByRole('dialog', { name: 'Action approval' });
    await expect(approval).toBeVisible({ timeout: 15_000 });
    await expect(approval).toContainText('L5');
    await respondToApproval(panelPage, 'approve');

    await expect(targetPage.locator('#kyc-submitted-status')).toBeVisible({ timeout: 15_000 });
    await expect(targetPage.locator('#kyc-form')).toBeHidden();

    // Same "scenario keeps re-proposing" shape as banner_first/login_credential: the submit
    // control is now hidden, not gone, so it retries until it asks the user.
    await stopFromQuestion(panelPage, 20_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');
  });

  test('Deny (Skip & replan): the form is never submitted', async ({ context, sidepanelUrl }) => {
    test.setTimeout(90_000);
    await forceScenario(context, 'kyc_submit');
    const targetPage = await context.newPage();
    await targetPage.goto('/kyc.html');
    await expect(targetPage.locator('#kyc-submitted-status')).toHaveCount(0);

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    // See the Approve test's comment: zoom, not scroll, is what actually fits Full name and
    // Submit in the same viewport on this page.
    await zoomOut(panelPage, targetPage, 0.67);
    await expect(targetPage.locator('#submit')).toBeInViewport();
    await expect(targetPage.locator('#full-name')).toBeInViewport();

    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Fill in the form and submit it.');
    // Full name is already correct and the task doesn't mention it, so `_fill_actions()`
    // (mock_scenarios.py) leaves it alone — only EMAIL, which starts empty, needs task data.
    await panelPage.getByLabel('Data type 2').selectOption('EMAIL');
    await panelPage.getByLabel('Data value 2').fill('priya@example.test');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

    await acceptConsent(panelPage);
    await expect(targetPage.locator('#email')).toHaveValue('priya@example.test', { timeout: 20_000 });

    // Skip -> recovery -> replan -> the scenario proposes the identical (still un-consented, so
    // still L5-gated) submit again, which means ANOTHER approval dialog each round, not just one
    // — until MAX_REPLANS is exhausted and the loop finally asks the user. The form must never
    // have been submitted at any point along the way.
    for (let round = 0; round < 4; round++) {
      const dialog = panelPage.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      const label = await dialog.getAttribute('aria-label');
      if (label === 'Task question') break;
      expect(label, `unexpected dialog while waiting for repeated Skip -> replan`).toBe('Action approval');
      await respondToApproval(panelPage, 'skip');
    }
    await stopFromQuestion(panelPage, 20_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');
    await expect(targetPage.locator('#kyc-submitted-status')).toHaveCount(0);
    await expect(targetPage.locator('#kyc-form')).toBeVisible();
  });
});
