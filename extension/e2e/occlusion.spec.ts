import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize } from './fixtures/sanitize';

/**
 * The occlusion signal (Stage 3A Part A1). The planner cannot clear an obstacle it is not told
 * about, so a visible-but-covered control has to reach the payload flagged rather than looking
 * like any other clickable element.
 */

interface OutboundElement {
  eid: string;
  label: string;
  visible: boolean;
  occluded?: boolean;
  covered_by?: string;
}

async function elementsFor(context: Parameters<typeof openPages>[0], sidepanelUrl: string, path: string): Promise<OutboundElement[]> {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, path);
  await targetPage.evaluate(() => document.getElementById('submit')?.scrollIntoView({ block: 'center' }));
  const { preview } = await observeAndSanitize(panelPage, targetPage);
  const draft = JSON.parse(preview.draftJson) as { elements: OutboundElement[] };
  await targetPage.close();
  await panelPage.close();
  return draft.elements;
}

test('a button covered by the cookie banner is reported as occluded', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  const elements = await elementsFor(context, sidepanelUrl, '/kyc.html?banner=1');
  const submit = elements.find((el) => /submit/i.test(el.label));
  expect(submit, 'the submit button should be in the payload').toBeDefined();
  expect(submit!.visible).toBe(true);
  expect(submit!.occluded, 'the banner covers it, so the planner must be told').toBe(true);
});

test('the same button is not occluded without the banner', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  const elements = await elementsFor(context, sidepanelUrl, '/kyc.html');
  const submit = elements.find((el) => /submit/i.test(el.label));
  expect(submit!.occluded ?? false, 'nothing covers it here').toBe(false);
});

test('no clear field is ever flagged as occluded', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  // Regression guard: sampling the centre of an element's BOX rather than of its on-screen part
  // reported every partly-scrolled field as covered.
  const elements = await elementsFor(context, sidepanelUrl, '/kyc.html');
  const wronglyFlagged = elements.filter((el) => el.occluded && !/submit/i.test(el.label)).map((el) => el.label);
  expect(wronglyFlagged).toEqual([]);
});

test('covered_by only ever names an element the server also received', async ({ context, sidepanelUrl }) => {
  test.setTimeout(120_000);
  const elements = await elementsFor(context, sidepanelUrl, '/kyc.html?banner=1');
  const eids = new Set(elements.map((el) => el.eid));
  for (const el of elements) {
    if (el.covered_by) expect(eids.has(el.covered_by), `${el.covered_by} is not in the payload`).toBe(true);
  }
});
