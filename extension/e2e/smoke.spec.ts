import { test, expect } from './fixtures/extension';

test('extension loads and the side panel page renders', async ({ context, sidepanelUrl }) => {
  const page = await context.newPage();
  await page.goto(sidepanelUrl);
  await expect(page.locator('h1')).toContainText('Aegis');
});
