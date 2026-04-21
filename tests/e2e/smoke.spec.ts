import { expect, test } from '@playwright/test';

test.describe('Smoke', () => {
  test('home page loads with IFA in the title and headline', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/IFA/);

    const heading = page.getByRole('heading', { level: 1, name: 'Inteligencia Financiera App' });
    await expect(heading).toBeVisible();

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'es-GT');
  });
});
