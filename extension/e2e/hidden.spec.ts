import { test, expect } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';
import type { RawElement } from '../observe/types';

function byLabel(elements: RawElement[], label: string): RawElement | undefined {
  return elements.find((el) => el.labelText === label || el.name === label);
}

test('hidden.html: each hiding technique gets the right visibilityReason', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/hidden.html');
  const result = await observe(panelPage, targetPage);
  const elements = result.observation.elements;

  const cases: Array<{ label: string; reason: RawElement['visibilityReason'] }> = [
    { label: 'display:none', reason: 'display-none' },
    { label: 'visibility:hidden', reason: 'visibility-hidden' },
    { label: 'opacity:0', reason: 'opacity-zero' },
    { label: 'aria-hidden', reason: 'aria-hidden' },
    { label: 'inert ancestor', reason: 'inert' },
    { label: 'zero-size', reason: 'zero-size' },
  ];

  for (const { label, reason } of cases) {
    const el = byLabel(elements, label);
    expect(el, `element labelled "${label}" should still be harvested even though it is hidden`).toBeDefined();
    expect(el!.visible, `"${label}" should be invisible`).toBe(false);
    expect(el!.visibilityReason, `"${label}" visibilityReason`).toBe(reason);
    // Hidden interactive elements are kept and flagged — see docs/threat_model.md T2.
    expect(el!.hiddenInteractive).toBe(true);
  }

  // The off-screen field is positioned far to the left; it must be flagged, though whether the
  // engine reports it as outside-viewport or clipped depends on its containing block.
  const offScreen = byLabel(elements, 'off-screen');
  expect(offScreen).toBeDefined();
  expect(offScreen!.visible).toBe(false);
  expect(['outside-viewport', 'clipped']).toContain(offScreen!.visibilityReason);
});

test('hidden.html: a button covered by a banner reports hitOk=false', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/hidden.html');
  const result = await observe(panelPage, targetPage);

  const covered = result.observation.elements.find((el) => el.name === 'Click me');
  expect(covered, 'the covered button should be harvested').toBeDefined();
  // It IS geometrically visible (that's the point — it looks clickable)...
  expect(covered!.visible).toBe(true);
  // ...but the banner sits on top of it, so hit-testing at its centre finds something else.
  expect(covered!.hitOk).toBe(false);
});
