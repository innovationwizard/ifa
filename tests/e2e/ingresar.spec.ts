import { expect, test } from '@playwright/test';

test.describe('/ingresar — login page', () => {
  test('renders the form with title and inputs', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.getByRole('heading', { level: 1, name: /Entra a IFA/i })).toBeVisible();
    await expect(page.getByLabel(/Tu correo/i)).toBeVisible();
    await expect(page.getByLabel(/Tu clave/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Entrar$/ })).toBeVisible();
  });

  test('navigation links point at the expected auth routes', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.getByRole('link', { name: /Crea tu cuenta/i })).toHaveAttribute(
      'href',
      '/crear-cuenta',
    );
    await expect(page.getByRole('link', { name: /Olvidaste tu clave/i })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });

  test('invalid credentials surface the generic non-enumerating error', async ({ page }) => {
    await page.goto('/ingresar');
    // pressSequentially (not fill) — fill() on a controlled react-hook-form
    // input under WebKit sometimes fails to dispatch the change event RHF
    // listens for, leaving the form thinking the field is empty. Typing
    // character-by-character dispatches real input events and works on
    // every engine.
    await page.getByLabel(/Tu correo/i).pressSequentially('no-such-user@example.test');
    await page.getByLabel(/Tu clave/i).pressSequentially('definitely-wrong-password');
    await page.getByRole('button', { name: /^Entrar$/ }).click();
    // Scope the alert by text — Next.js's internal
    // `#__next-route-announcer__` also carries role="alert" but is empty.
    const alert = page.getByRole('alert').filter({ hasText: /El correo o la clave/ });
    await expect(alert).toBeVisible({ timeout: 10_000 });
    // Still on /ingresar — no redirect happened.
    expect(new URL(page.url()).pathname).toBe('/ingresar');
  });

  test('form is keyboard-navigable (Tab order + Enter to submit)', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel(/Tu correo/i).focus();
    await page.keyboard.type('keyboard@example.test');
    await page.keyboard.press('Tab');
    await page.keyboard.type('some-wrong-password');
    // Enter while focused on password submits the form.
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert').filter({ hasText: /El correo o la clave/ });
    await expect(alert).toBeVisible({ timeout: 10_000 });
  });
});
