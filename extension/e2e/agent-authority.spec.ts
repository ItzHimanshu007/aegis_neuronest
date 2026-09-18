import { test, expect } from './fixtures/extension';
import { forceScenario, acceptConsent, respondToApproval, stopFromQuestion, readSnapshot } from './fixtures/task';

/**
 * Stage 3B Part II: the search-vs-commit Enter-key authority rule, driven through the real agent
 * loop — `extension/authority`'s own unit tests already prove `classifyAction()`'s pure logic;
 * this proves a plan proposing that same `key` action actually gets gated (or not) the same way
 * once it goes through consent, the Authority Gate, and the executor for real.
 */
test.describe('search-Enter vs form-Enter', () => {
  test('Enter in search.html\'s search field needs no approval (L2)', async ({ context, sidepanelUrl }) => {
    await forceScenario(context, 'search_enter');
    const targetPage = await context.newPage();
    await targetPage.goto('/search.html');
    await expect(targetPage.locator('#q')).toHaveValue('');

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Search for water bottles.');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();
    await acceptConsent(panelPage);

    await expect(targetPage.locator('#q')).toHaveValue('water bottle', { timeout: 20_000 });
    // No approval dialog at any point — L2 requires none.
    await expect(panelPage.getByRole('dialog', { name: 'Action approval' })).toHaveCount(0);
    // The real GET-form submit this Enter triggers proves it executed, not just that it was
    // classified L2 — the search's own classifyAction() unit test already covers classification.
    await expect(targetPage).toHaveURL(/[?&]q=water\+bottle/, { timeout: 20_000 });
  });

  test('Enter in an ordinary form field needs approval (L5)', async ({ context, sidepanelUrl }) => {
    test.setTimeout(60_000);
    await forceScenario(context, 'form_enter');
    const targetPage = await context.newPage();
    await targetPage.goto('/search.html');
    // The look-alike transfer form: same layout as the search box, but posting it moves money —
    // its own starting condition is that it's a real <form> with a real submit action.
    await expect(targetPage.locator('#transfer-form')).toHaveAttribute('method', 'post');
    await expect(targetPage.locator('#upi')).toHaveValue('asha@oksbi');

    const panelPage = await context.newPage();
    await panelPage.goto(sidepanelUrl);
    await targetPage.bringToFront();
    await panelPage.getByLabel('Task', { exact: true }).fill('Press Enter in the recipient field.');
    await panelPage.getByRole('button', { name: 'Start', exact: true }).click();
    await acceptConsent(panelPage);

    // The scenario re-proposes the identical key action on every replan after a Skip (same shape
    // as kyc_submit's Deny case): each round is its own L5 approval, not just one.
    for (let round = 0; round < 4; round++) {
      const dialog = panelPage.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      const label = await dialog.getAttribute('aria-label');
      if (label === 'Task question') break;
      expect(label, 'unexpected dialog while waiting for repeated Skip -> replan').toBe('Action approval');
      if (round === 0) await expect(dialog).toContainText('L5'); // checked once, not every round
      await respondToApproval(panelPage, 'skip');
    }
    await stopFromQuestion(panelPage, 20_000);
    await expect(panelPage.locator('[data-testid="task-status"]')).toHaveText('stopped');
    await expect(targetPage).toHaveURL(/search\.html$/); // never navigated/submitted
    const snapshot = await readSnapshot(panelPage);
    expect(snapshot.timeline.some((e) => e.action === 'key' && e.verdict === 'PASS')).toBe(false);
  });
});
