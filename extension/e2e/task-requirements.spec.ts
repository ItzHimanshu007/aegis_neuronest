import { test, expect } from './fixtures/extension';
import { forceScenario, startTask, acceptConsent, stopFromQuestion, readSnapshot } from './fixtures/task';

/**
 * The task requirement ledger, end to end through the real extension.
 *
 * What these pin down: `plan.v2` gives a `done` action ONE `evidence` object with at most one
 * `eid`, forbids `target` on it, and the loop stops at the first `done`. So the strongest
 * completion claim any model can make about "fill in my name and email" proves a single field —
 * `{eid:<email>, has_value:true}` is perfectly true while the name beside it is empty or was
 * silently dropped. Every other evidence form is unsatisfiable by construction. Real runs against
 * live forms therefore ended DONE_UNVERIFIED with falseSuccess after ten replans, or worse, would
 * have been accepted on half-finished work.
 *
 * The fix is not a richer plan schema — that would hand the untrusted server a wider surface for
 * nothing. The client already knows which values it was given and which EIDs it typed them into,
 * so it checks that itself, against a capture taken AFTER the claim, and the model is never
 * believed on the point.
 *
 * As with `task-kyc.spec.ts`, the only thing swapped out is the model: the scenarios in
 * `server/app/vlm/mock_scenarios.py` return real, schema-valid plans that the client treats
 * exactly like a live response. Requires `pnpm run server` with `AEGIS_ADAPTER=mock` and
 * `pnpm portal` on :5174.
 */

const NAME = { category: 'NAME', value: 'Priya Sharma' };
const EMAIL = { category: 'EMAIL', value: 'priya@example.test' };
const TASK = 'Fill in my name and email on this form, but do not submit it.';

test('kyc.html: a done that proves one field is refused while the other value is missing', async ({ context, sidepanelUrl }) => {
  await forceScenario(context, 'done_after_one_field');

  const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/kyc.html', TASK, [NAME, EMAIL]);
  await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma');
  await expect(targetPage.locator('#email')).toHaveValue('');
  await acceptConsent(panelPage);

  // The scenario fills EMAIL, then claims the whole task is done on the strength of that one
  // field. Its evidence is true, schema-valid and survives the server's enforce(); before the
  // ledger the loop accepted it and reported success with the name value never placed.
  const question = panelPage.getByRole('dialog', { name: 'Task question' });
  await expect(question).toBeVisible({ timeout: 40_000 });
  await expect(question).toContainText('REQUIREMENTS_UNMET');
  // The question names the outstanding category so the user can tell what was missed — never the
  // value itself.
  await expect(question).toContainText('name');

  await expect(targetPage.locator('#email')).toHaveValue(EMAIL.value);
  // Untouched: the page's own pre-filled value, never the task's NAME value.
  await expect(targetPage.locator('#full-name')).toHaveValue('Asha Verma');

  await stopFromQuestion(panelPage);
  const snapshot = await readSnapshot(panelPage);
  expect(snapshot.falseSuccess).toBe(true);
  // The refusal is on the user-visible timeline, attributed to `done` — not buried, and not
  // mislabelled as an observation.
  const refusals = snapshot.timeline.filter((e) => e.action === 'done');
  expect(refusals.length).toBeGreaterThan(0);
  expect(refusals.every((e) => e.verdict === 'FAIL' && e.code === 'REQUIREMENTS_UNMET')).toBe(true);
});

test('kyc.html: a done is accepted once every supplied value is confirmed on the page, without submitting', async ({ context, sidepanelUrl }) => {
  await forceScenario(context, 'fill_then_done');

  const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/kyc.html', TASK, [NAME, EMAIL]);
  await expect(targetPage.locator('#email')).toHaveValue('');
  await acceptConsent(panelPage);

  await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('done', { timeout: 40_000 });

  await expect(targetPage.locator('#full-name')).toHaveValue(NAME.value);
  await expect(targetPage.locator('#email')).toHaveValue(EMAIL.value);
  // "but do not submit it": the plan never proposes a commit, so the L5 gate is never reached and
  // the form is never posted.
  await expect(targetPage).toHaveURL(/kyc\.html$/);
  await expect(targetPage.locator('#kyc-submitted-status')).toHaveCount(0);

  const snapshot = await readSnapshot(panelPage);
  expect(snapshot.state).toBe('done');
  expect(snapshot.falseSuccess).toBe(false);
  expect(snapshot.timeline.filter((e) => e.action === 'type').every((e) => e.verdict === 'PASS')).toBe(true);
});

test('controlled.html: a value the page drops after the write is confirmed still blocks completion', async ({ context, sidepanelUrl }) => {
  await forceScenario(context, 'fill_then_done');

  const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/controlled.html?revert=c-full-name', TASK, [NAME, EMAIL]);
  await acceptConsent(panelPage);

  // The name really was typed: the executor read it back and matched, so the `type` step PASSes.
  // Filling the email then makes the form drop it. Nothing the model can observe or claim catches
  // this — only a fresh capture taken after the completion claim does.
  //
  // The task never completes, and the escalation the user eventually sees is LOOP_DETECTED rather
  // than REQUIREMENTS_UNMET: the page re-empties the field every round, so the loop really is
  // going in circles and the repeat detector reaches its limit before the replan streak does.
  // That is the honest diagnosis of this page. What this test pins is the refusal itself, on the
  // timeline, where every completion claim is recorded as REQUIREMENTS_UNMET.
  const question = panelPage.getByRole('dialog', { name: 'Task question' });
  await expect(question).toBeVisible({ timeout: 40_000 });

  await expect(targetPage.locator('#c-full-name')).toHaveValue('');
  await expect(targetPage.locator('#c-email')).toHaveValue(EMAIL.value);

  await stopFromQuestion(panelPage);
  const snapshot = await readSnapshot(panelPage);
  expect(snapshot.state).not.toBe('done');
  expect(snapshot.falseSuccess).toBe(true);
  // The write itself succeeded; it is the ledger's re-check, not the executor, that refuses.
  expect(snapshot.timeline.filter((e) => e.action === 'type').every((e) => e.verdict === 'PASS')).toBe(true);
  const claims = snapshot.timeline.filter((e) => e.action === 'done');
  expect(claims.length).toBeGreaterThan(0);
  expect(claims.every((e) => e.verdict === 'FAIL' && e.code === 'REQUIREMENTS_UNMET')).toBe(true);
});

test('frames-form.html: requirements resolve for fields reached through a frame path', async ({ context, sidepanelUrl }) => {
  await forceScenario(context, 'fill_then_done');

  const { targetPage, panelPage } = await startTask(context, sidepanelUrl, '/frames-form.html', TASK, [NAME, EMAIL]);
  await acceptConsent(panelPage);

  await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('done', { timeout: 40_000 });

  // Every EID here belongs to an element inside the iframe, so this proves reacquire()'s frame
  // traversal and the ledger agree on element identity across a frame boundary.
  const frame = targetPage.frameLocator('#two-field-frame');
  await expect(frame.locator('#framed-full-name')).toHaveValue(NAME.value);
  await expect(frame.locator('#framed-email')).toHaveValue(EMAIL.value);

  const snapshot = await readSnapshot(panelPage);
  expect(snapshot.falseSuccess).toBe(false);
});
