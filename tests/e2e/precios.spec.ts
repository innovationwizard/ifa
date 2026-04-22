import { expect, test } from '@playwright/test';

test.describe('/precios — public pricing page', () => {
  test('renders heading, both plan cards, trial badge, and price-change notice', async ({
    page,
  }) => {
    await page.goto('/precios');
    await expect(page.getByRole('heading', { level: 1, name: /Precios de IFA/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Personal$/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Empresa$/ })).toBeVisible();
    // Trial badge copy.
    await expect(page.getByText(/1 mes gratis, sin tarjeta/i)).toBeVisible();
    // "Prices subject to change" legal notice — MUST be present per locked
    // product decision.
    await expect(page.getByText(/Los precios pueden cambiar en cualquier momento/i)).toBeVisible();
    // Terms link footer.
    await expect(page.getByRole('link', { name: /Términos/i })).toHaveAttribute(
      'href',
      '/terminos',
    );
  });

  test('shows both prices — $1 for Personal and $20 for Empresa', async ({ page }) => {
    await page.goto('/precios');
    await expect(page.getByText(/\$1/)).toBeVisible();
    await expect(page.getByText(/\$20/)).toBeVisible();
  });

  test('renders a CTA for each plan (Pasar a este plan or Pronto)', async ({ page }) => {
    await page.goto('/precios');
    /*
     * The button label depends on Stripe configuration: when the secret
     * key is set it reads "Pasar a este plan"; when it's absent the
     * button falls back to a disabled "Pronto" state. Either label is
     * acceptable — assert the count (one per plan) instead.
     */
    const buttons = page.getByRole('button', { name: /Pasar a este plan|Pronto/ });
    await expect(buttons).toHaveCount(2);
  });
});

test.describe('/terminos — includes the pricing-change clause', () => {
  test('renders the pricing-change section (locked product requirement)', async ({ page }) => {
    await page.goto('/terminos');
    await expect(
      page.getByText(/Los precios de IFA pueden cambiar en cualquier momento, sin aviso previo/i),
    ).toBeVisible();
  });
});
