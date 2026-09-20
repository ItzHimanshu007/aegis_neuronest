import { test, expect } from './fixtures/extension';

/**
 * Stage 3B demo checkpoint: a KYC fill task runs end to end through the real extension against
 * the real page — consent, planner client, agent loop, executor, reacquisition, re-hydration and
 * postcondition verification, with no code path skipped for the test.
 *
 * The one thing swapped out is the MODEL: `X-Aegis-Mock-Scenario: kyc_fill` (Stage 3A Part E,
 * `server/app/vlm/mock_scenarios.py`) stands in for a live VLM call, so this test is fast and
 * deterministic. It still forces the server through `AEGIS_ADAPTER=mock` server-side — the header
 * is refused otherwise — and it still returns a real, schema-valid, ordinary plan that the CLIENT
 * treats exactly like a model response: nothing about consent, the authority gate, rehydrate(),
 * reacquire() or verify() knows this wasn't a live model. See `eval/reports/model-probe-*.md` for
 * live-model measurements.
 *
 * Requires `pnpm run server` running with `AEGIS_ADAPTER=mock` (see the header injection below —
 * it works with a `mock` adapter started any way, including plain `pnpm run server` after setting
 * that in the environment) and `pnpm portal` on :5174.
 */
test('kyc.html: a task fills the pre-filled name and the empty email from task data, then stops before submitting', async ({
  context,
  sidepanelUrl,
}) => {
  // Force the deterministic scenario for every /v1/plan call this test makes, on every page in
  // this context (the fetch happens from the side panel document, not from kycPage).
  await context.route('**/v1/plan', (route) => {
    const headers = { ...route.request().headers(), 'x-aegis-mock-scenario': 'kyc_fill' };
    void route.continue({ headers });
  });

  const kycPage = await context.newPage();
  await kycPage.goto('/kyc.html');
  // Full name starts pre-filled by the page; Email starts empty — the interesting case.
  await expect(kycPage.locator('#full-name')).toHaveValue('Asha Verma');
  await expect(kycPage.locator('#email')).toHaveValue('');

  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  await kycPage.bringToFront();

  await panelPage.getByLabel('Task', { exact: true }).fill('Fill my name and email, then stop before submitting.');
  await panelPage.getByLabel('Data value 1').fill('Priya Sharma'); // category: NAME (default row 1)
  await panelPage.getByLabel('Data value 2').fill('priya@example.test'); // category: EMAIL (default row 2)
  await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

  const consent = panelPage.getByRole('dialog', { name: 'Task consent' });
  await expect(consent).toBeVisible({ timeout: 15_000 });
  // NAME and EMAIL are `medium` (docs/policy.yaml): pre-checked, no separate high-risk prompt.
  await consent.getByRole('button', { name: 'Continue with selected' }).click();

  // The scenario's last action is ask_user ("Fields are filled. Submit this verification form?"),
  // which only fires after both `type` actions executed and passed their `expect: has_value`
  // postcondition — so seeing this dialog is itself proof the fill succeeded.
  const question = panelPage.getByRole('dialog', { name: 'Task question' });
  await expect(question).toBeVisible({ timeout: 20_000 });

  // Both fields were filled from the TASK's own tokens, not the page's pre-existing "Asha Verma"
  // (a task-supplied token always wins — see `_token_for` in mock_scenarios.py). The email field
  // had no page value to echo at all, so it specifically proves task-data rehydration into an
  // empty field; the name field proves the same path overwriting an already-filled one.
  await expect(kycPage.locator('#email')).toHaveValue('priya@example.test');
  await expect(kycPage.locator('#full-name')).toHaveValue('Priya Sharma');
  // Never submitted: the loop stopped at ask_user, never reaching a click on #submit.
  await expect(kycPage).toHaveURL(/kyc\.html$/);

  await question.getByRole('button', { name: 'Stop task' }).click();
  await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');

  // The timeline records two PASS steps (type name, type email) with no false success.
  await panelPage.getByText('Everything Aegis recorded').click(); // <details> starts collapsed
  const summary = JSON.parse(await panelPage.locator('[data-testid="task-summary"]').innerText());
  const typeSteps = summary.timeline.filter((entry: { action: string }) => entry.action === 'type');
  expect(typeSteps).toHaveLength(2);
  expect(typeSteps.every((entry: { verdict: string }) => entry.verdict === 'PASS')).toBe(true);
  expect(summary.falseSuccess).toBe(false);
});
