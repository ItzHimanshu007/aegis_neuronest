import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize } from './fixtures/sanitize';

// Guards actual masks and payload values, independently of the baseline's annotation matcher.
test('zoo filled name input has an EID mask when centered in the viewport', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
  await targetPage.locator('#z-name').scrollIntoViewIfNeeded();
  const result = await observeAndSanitize(panelPage, targetPage);
  const payload = JSON.parse(result.preview.draftJson) as { elements: Array<{ eid: string; label: string }>; redactions: Array<{ eid?: string; type: string }> };
  const field = payload.elements.find(e => e.label === 'Full name');
  expect(field).toBeDefined();
  expect(payload.redactions).toContainEqual(expect.objectContaining({eid: field!.eid, type: 'NAME'}));
  expect(result.preview.draftJson).not.toContain('Asha Verma');
  expect(result.preview.draftJson).not.toContain('mark_id');
});

test('empty to partial sensitive field retains its EID and switches hint to mask', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/kyc.html');
  const input = targetPage.locator('input[type=email]');
  await input.fill('');
  await input.blur();
  const empty = JSON.parse((await observeAndSanitize(panelPage,targetPage)).preview.draftJson) as {elements:Array<{eid:string;input_type?:string}>;field_hints:Array<{eid:string;category:string;fill:string}>;redactions:Array<{eid?:string}>};
  const eid = empty.elements.find(e=>e.input_type==='email')!.eid;
  expect(empty.field_hints).toContainEqual({eid,category:'EMAIL',fill:'empty'});
  expect(empty.redactions.some(r=>r.eid===eid)).toBe(false);
  await input.fill('sensitive-partial');
  const partial = JSON.parse((await observeAndSanitize(panelPage,targetPage)).preview.draftJson) as typeof empty;
  expect(partial.elements.find(e=>e.input_type==='email')!.eid).toBe(eid);
  expect(partial.redactions.some(r=>r.eid===eid)).toBe(true);
  expect(partial.field_hints.some(h=>h.eid===eid)).toBe(false);
  expect(JSON.stringify(partial)).not.toContain('sensitive-partial');
});
