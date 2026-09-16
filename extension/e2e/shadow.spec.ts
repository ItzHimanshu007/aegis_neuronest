import { test, expect } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';

test('shadow.html: fields inside both open and closed shadow roots are found', async ({ context, sidepanelUrl }) => {
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/shadow.html');
  const result = await observe(panelPage, targetPage);

  const names = result.observation.elements.map((el) => el.name);
  expect(names).toContain('Open-shadow name');
  expect(names).toContain('Closed-shadow email');

  const openField = result.observation.elements.find((el) => el.name === 'Open-shadow name')!;
  const closedField = result.observation.elements.find((el) => el.name === 'Closed-shadow email')!;

  expect(openField.inShadow).toBe('open');
  expect(closedField.inShadow).toBe('closed');

  // Both should be real, visible, positioned textboxes — not phantom entries.
  for (const field of [openField, closedField]) {
    expect(field.role).toBe('textbox');
    expect(field.visible).toBe(true);
    expect(field.bbox.width).toBeGreaterThan(0);
    expect(field.bbox.height).toBeGreaterThan(0);
  }
});
