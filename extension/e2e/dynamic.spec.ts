import { test, expect } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';

test('dynamic.html: the modal appearing produces NEW_SCREEN with reason dialog-appeared', async ({ context, sidepanelUrl }) => {
  const targetPage = await context.newPage();
  await targetPage.goto('/dynamic.html');
  const panelPage = await context.newPage();
  await panelPage.goto(sidepanelUrl);

  // Let the page's own 1s modal appear and dismiss it, so the "before" observation is
  // deterministically modal-free (racing the 1s timer with the observation pipeline's own
  // injection + settle wait is exactly the kind of flake worth designing out of a test).
  await targetPage.waitForSelector('#modal-close', { timeout: 5_000 });
  await targetPage.click('#modal-close');
  await targetPage.waitForSelector('#modal-backdrop', { state: 'detached' });

  const first = await observe(panelPage, targetPage);
  expect(first.change.decision).toBe('NEW_SCREEN'); // first observation of this tab, always

  // Re-open the modal, then observe again: closed -> open is the transition under test.
  await targetPage.click('#open-modal-btn');
  await targetPage.waitForSelector('#modal', { state: 'visible' });
  const second = await observe(panelPage, targetPage);

  expect(second.change.decision).toBe('NEW_SCREEN');
  expect(second.change.reason).toBe('dialog-appeared');
});

test('dynamic.html: re-rendering a form with new ids/classes keeps the same fp', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/dynamic.html');

  // The page pops a modal after 1s whose backdrop would swallow clicks on the re-render button —
  // dismiss it first so this test exercises fp stability, not modal handling.
  await targetPage.waitForSelector('#modal-close', { timeout: 5_000 });
  await targetPage.click('#modal-close');
  await targetPage.waitForSelector('#modal-backdrop', { state: 'detached' });

  const before = await observe(panelPage, targetPage);
  const fieldBefore = before.observation.elements.find((el) => el.name === 'Re-rendered field');
  expect(fieldBefore, 'the re-renderable field should be harvested').toBeDefined();

  // Re-render: same label/role, brand new id and class.
  await targetPage.click('#rerender-btn');
  await targetPage.waitForFunction(() => document.querySelector('#rerender-target input')?.id.startsWith('rerender-field-b'));

  const after = await observe(panelPage, targetPage);
  const fieldAfter = after.observation.elements.find((el) => el.name === 'Re-rendered field');
  expect(fieldAfter, 'the field should still be harvested after the re-render').toBeDefined();

  expect(fieldAfter!.fp, 'fp must survive an id/class change').toBe(fieldBefore!.fp);
});

test('dynamic.html: three identical "Add" buttons get fpOrdinals 0, 1, 2', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/dynamic.html');
  const result = await observe(panelPage, targetPage);

  const addButtons = result.observation.elements.filter((el) => el.role === 'button' && el.name === 'Add');
  expect(addButtons).toHaveLength(3);

  // Same fingerprint (identical semantics), distinguished only by document-order ordinal.
  const uniqueFps = new Set(addButtons.map((b) => b.fp));
  expect(uniqueFps.size, 'three identical buttons should share one fp').toBe(1);
  expect(addButtons.map((b) => b.fpOrdinal).sort()).toEqual([0, 1, 2]);
});
