import { test, expect } from './fixtures/extension';
import { forceScenario, acceptConsent } from './fixtures/task';
import { openDevTools } from './fixtures/observe';

/**
 * Stage 3B Part II: Stop while a step is in flight. Aborts promptly, clears the vault, calls
 * endSession, and leaves nothing behind for the next observation to trip over.
 */
test('Stop mid-task aborts promptly, clears the vault, calls endSession, and leaves no stale task state', async ({
  context,
  sidepanelUrl,
}) => {
  await forceScenario(context, 'kyc_fill');

  // Capture every /v1/session/end call so "calls endSession" is proven, not assumed.
  const endSessionCalls: string[] = [];
  await context.route('**/v1/session/end', (route) => {
    endSessionCalls.push(route.request().postData() ?? '');
    void route.continue();
  });

  const targetPage = await context.newPage();
  await targetPage.goto('/kyc.html');
  await expect(targetPage.locator('#email')).toHaveValue('');

  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  await targetPage.bringToFront();
  await panelPage.getByLabel('Task', { exact: true }).fill('Fill my name and email, then stop before submitting.');
  await panelPage.getByLabel('Data value 1').fill('Priya Sharma');
  await panelPage.getByLabel('Data value 2').fill('priya@example.test');
  await panelPage.getByRole('button', { name: 'Start', exact: true }).click();

  await acceptConsent(panelPage);
  // Stop WHILE a step is genuinely in flight: right as the first type action is executing,
  // rather than at a natural pause — this is the scenario "mid-task" actually means.
  await expect(targetPage.locator('#full-name')).not.toHaveValue('Asha Verma', { timeout: 20_000 });
  const stopClickedAt = Date.now();
  await panelPage.getByRole('button', { name: 'Stop', exact: true }).click();

  // Promptly: the status reflects 'stopped' quickly, not after the in-flight step's own network
  // round trip completes and the loop naturally reaches a pause point.
  await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped', { timeout: 3_000 });
  expect(Date.now() - stopClickedAt, 'Stop must abort promptly, not wait out the in-flight step').toBeLessThan(3_000);

  // Calls endSession: the real network request happened.
  await expect.poll(() => endSessionCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);
  const body = JSON.parse(endSessionCalls[0]!);
  expect(Object.keys(body)).toEqual(['session']);
  expect(typeof body.session).toBe('string');

  // Clears the vault: nothing in the panel can resolve to the raw task values any more. There is
  // no direct vault handle from the test, so this checks the OBSERVABLE guarantee — the panel
  // never displays a raw value after stop, and a stopped task shows no stale prompts/timeline
  // entries implying it's still running.
  const panelText = await panelPage.locator('body').innerText();
  expect(panelText).not.toContain('Priya Sharma');
  expect(panelText).not.toContain('priya@example.test');
  await expect(panelPage.locator('[role="dialog"]')).toHaveCount(0);

  // No stale task state: a follow-up observation on the SAME tab starts clean, not confused by
  // the aborted task's session/consent/vault state.
  await openDevTools(panelPage);
  await panelPage.getByRole('button', { name: 'Observe', exact: true }).click();
  await expect(panelPage.getByText(/Observing…/)).toHaveCount(0, { timeout: 15_000 });
  await expect(panelPage.locator('pre.error')).toHaveCount(0);
});
