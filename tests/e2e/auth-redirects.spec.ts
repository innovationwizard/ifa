import { expect, test } from '@playwright/test';

test.describe('Auth proxy — route protection', () => {
  test.describe('anonymous user', () => {
    test('redirect from /dashboard to /ingresar with next param', async ({ page }) => {
      const response = await page.goto('/dashboard');
      expect(response).not.toBeNull();
      // After redirect chain resolves, the URL should be /ingresar?next=/dashboard.
      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname).toBe('/ingresar');
      expect(finalUrl.searchParams.get('next')).toBe('/dashboard');
    });

    test('redirect from a nested protected route preserves the full path + query', async ({
      page,
    }) => {
      await page.goto('/transacciones/abc?filter=unmatched');
      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname).toBe('/ingresar');
      expect(finalUrl.searchParams.get('next')).toBe('/transacciones/abc?filter=unmatched');
    });

    test('does NOT redirect from the landing page', async ({ page }) => {
      await page.goto('/');
      expect(new URL(page.url()).pathname).toBe('/');
    });

    test('does NOT redirect from an auth page', async ({ page }) => {
      // /ingresar does not exist yet (S-2.3); the proxy should still NOT bounce
      // anonymous users away. Accept either a 200 (once the page ships) or a
      // 404 (Next's default not-found) as long as the URL is still /ingresar.
      await page.goto('/ingresar').catch(() => {
        // Page may not exist yet — that's fine. What we're testing is that the
        // proxy didn't redirect us.
      });
      expect(new URL(page.url()).pathname).toBe('/ingresar');
    });
  });

  /*
   * Authenticated-user redirects (auth page → /dashboard) are covered by a
   * full login-flow E2E test that lands with S-2.3. Pre-conditions for that
   * test (a seeded test user, a visible /ingresar form) do not exist yet.
   */
});
