import type { BrowserContext, Page } from '@playwright/test';

export interface TaskHandles {
  targetPage: Page;
  panelPage: Page;
}

export interface TaskDataRow {
  category: string;
  value: string;
}

/**
 * Forces every `/v1/plan` call this browser context makes to receive a deterministic scenario
 * from `server/app/vlm/mock_scenarios.py` (Stage 3A Part E), instead of a live model response.
 * Requires the server running with `AEGIS_ADAPTER=mock` — the header is refused otherwise.
 *
 * The fetch happens from the side panel document, not the target page, but `context.route`
 * applies context-wide, so this only needs to be set up once per test regardless of which page
 * ends up making the request.
 */
export async function forceScenario(context: BrowserContext, scenario: string): Promise<void> {
  await context.route('**/v1/plan', (route) => {
    const headers = { ...route.request().headers(), 'x-aegis-mock-scenario': scenario };
    void route.continue({ headers });
  });
}

/**
 * Opens the target page and the side panel, fills the task text and any task-data rows, and
 * clicks Start. Returns both pages so the caller can drive dialogs and assert page state.
 *
 * Does NOT wait for or resolve any dialog — different scenarios need different sequences
 * (consent only, consent + one approval, consent + a credential, ...), so that stays the
 * caller's job via the `consent`/`approve`/`question` helpers below.
 */
export async function startTask(
  context: BrowserContext,
  sidepanelUrl: string,
  path: string,
  taskText: string,
  data: TaskDataRow[] = [],
): Promise<TaskHandles> {
  const targetPage = await context.newPage();
  await targetPage.goto(path);
  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);
  await targetPage.bringToFront();

  await panelPage.getByLabel('Task', { exact: true }).fill(taskText);
  for (const [index, row] of data.entries()) {
    if (index >= 2) await panelPage.getByRole('button', { name: 'Add task data' }).click();
    await panelPage.getByLabel(`Data type ${index + 1}`).selectOption(row.category);
    await panelPage.getByLabel(`Data value ${index + 1}`).fill(row.value);
  }
  await panelPage.getByRole('button', { name: 'Start', exact: true }).click();
  return { targetPage, panelPage };
}

/**
 * Waits for the consent dialog and accepts it. `highCategories` checks the named individual
 * high-risk checkboxes (each rendered with the bare category name as its accessible name — see
 * TaskPanel.tsx); the medium group is always pre-checked by the panel itself, matching
 * docs/policy.yaml. `credential` fills the password row (only rendered when the task touched a
 * PASSWORD-classified field) before confirming, exactly as a user typing it in would.
 */
export async function acceptConsent(
  panelPage: Page,
  options: { highCategories?: string[]; credential?: string } = {},
): Promise<void> {
  const dialog = panelPage.getByRole('dialog', { name: 'Task consent' });
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  for (const category of options.highCategories ?? []) {
    await dialog.getByRole('checkbox', { name: category, exact: true }).check();
  }
  if (options.credential !== undefined) {
    await dialog.getByLabel('Credential').fill(options.credential);
  }
  await dialog.getByRole('button', { name: 'Continue with selected' }).click();
}

/** Waits for the approval dialog and clicks Approve or Skip & replan. */
export async function respondToApproval(panelPage: Page, choice: 'approve' | 'skip'): Promise<void> {
  const dialog = panelPage.getByRole('dialog', { name: 'Action approval' });
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await dialog.getByRole('button', { name: choice === 'approve' ? 'Approve' : 'Skip & replan' }).click();
}

/** Waits for the ask_user/recovery question dialog and stops the task from inside it. */
export async function stopFromQuestion(panelPage: Page, timeout = 20_000): Promise<void> {
  const dialog = panelPage.getByRole('dialog', { name: 'Task question' });
  await dialog.waitFor({ state: 'visible', timeout });
  await dialog.getByRole('button', { name: 'Stop task' }).click();
}

/** Reads the exported task snapshot (state, timeline, falseSuccess, ...) from the summary panel. */
export async function readSnapshot(panelPage: Page): Promise<{
  state: string;
  falseSuccess: boolean;
  timeline: Array<{ step: number; action: string; verdict: string; code?: string; level: string }>;
}> {
  const details = panelPage.locator('[data-testid="task-summary"]');
  if (!(await details.isVisible())) {
    await panelPage.getByText('Task summary and timeline').click();
  }
  return JSON.parse(await details.innerText());
}

/**
 * Zooms the target page out via the real `browser.tabs.setZoom` API (not a CDP viewport
 * emulation) and resets scroll to the top. Real users zoom out to see more of a page; this is
 * the same technique `calibration.spec.ts` uses to prove alignment holds at non-100% zoom.
 *
 * Two real findings drove this, found while trying a scroll-based version first:
 *   1. `extension/agent/executor.ts`'s `type` action calls `el.focus()` with no
 *      `{ preventScroll: true }`, which the browser default-scrolls into view — and the Authority
 *      Gate re-checks target visibility against whatever the page's CURRENT scroll position
 *      happens to be after that, with no step that scrolls a later target back into view. A plan
 *      combining a fill near the top of a page with a click near the bottom (e.g. kyc_submit) can
 *      permanently fail NOT_VISIBLE on a page taller than one viewport.
 *   2. `extension/scene/index.ts`'s `toOutboundDraft()` only includes `has_value` (and
 *      `input_type`, `value_token`, ...) for a VISIBLE element by design — an off-screen field
 *      carries none of that. `server/app/vlm/mock_scenarios.py`'s `_fill_actions()` needs
 *      `has_value` to decide a field is already correct and skip re-proposing it, so scrolling a
 *      field out of frame to make room for a distant target doesn't just risk finding #1 again —
 *      it removes the server's own ability to know that field doesn't need touching. There is
 *      also no single scroll position on kyc.html that keeps Full name, Email and Submit all
 *      visible at once (checked directly: their combined span exceeds one viewport). Zooming out
 *      shrinks the page enough that all three fit, sidestepping both problems at once.
 */
export async function zoomOut(panelPage: Page, targetPage: Page, factor: number): Promise<void> {
  await targetPage.bringToFront();
  await panelPage.evaluate(async (factor) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.setZoom(tab!.id!, factor);
  }, factor);
  await targetPage.evaluate(() => window.scrollTo(0, 0));
}
