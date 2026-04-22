import { expect, test } from '@playwright/test';

test.describe('/ingresar — magic-link + Google OAuth sign-in', () => {
  test('renders the page chrome: heading, Google button, email form, terms link', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    await expect(page.getByRole('heading', { level: 1, name: /Entra a IFA/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continúa con Google/i })).toBeVisible();
    await expect(page.getByLabel(/Tu correo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mándame el enlace/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Términos$/ })).toHaveAttribute(
      'href',
      '/terminos',
    );
    await expect(page.getByRole('link', { name: /^Privacidad$/ })).toHaveAttribute(
      'href',
      '/privacidad',
    );
  });

  test('submitting a valid email navigates to /ingresar/revisa-tu-correo with the email in the query', async ({
    page,
  }) => {
    /*
     * Intercept Supabase's OTP endpoint so the test doesn't depend on
     * real network or email deliverability. Supabase's JS client posts to
     * `{projectUrl}/auth/v1/otp`; we match any supabase.co host's `/otp`
     * path and return a minimal success body.
     */
    await page.route('**/auth/v1/otp**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/ingresar');
    const emailInput = page.getByLabel(/Tu correo/i);
    // Clicking first forces the React hydration handshake — on chromium we
    // occasionally typed into the input before RHF had attached its
    // onChange listener, and the form stayed empty on submit.
    await emailInput.click();
    await emailInput.pressSequentially('first-time-user-at-example.test'.replace('-at-', '@'));
    await page.getByRole('button', { name: /Mándame el enlace/i }).click();
    // Wait for navigation to the check-inbox page.
    await page.waitForURL(/\/ingresar\/revisa-tu-correo/, { timeout: 10_000 });
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe('/ingresar/revisa-tu-correo');
    expect(finalUrl.searchParams.get('email')).toBe('first-time-user@example.test');
  });

  test('revisa-tu-correo renders the submitted email and a back-to-ingresar link', async ({
    page,
  }) => {
    await page.goto('/ingresar/revisa-tu-correo?email=check%40example.test');
    await expect(page.getByRole('heading', { level: 1, name: /Revisa tu correo/i })).toBeVisible();
    await expect(page.getByText('check@example.test')).toBeVisible();
    await expect(page.getByRole('link', { name: /Reenviar/i })).toHaveAttribute(
      'href',
      '/ingresar',
    );
  });

  test('zod validation rejects a badly-formatted email before it hits Supabase', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    const emailInput = page.getByLabel(/Tu correo/i);
    await emailInput.click();
    await emailInput.pressSequentially('not-an-email');
    await page.getByRole('button', { name: /Mándame el enlace/i }).click();
    // No navigation — we're still on /ingresar.
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});
