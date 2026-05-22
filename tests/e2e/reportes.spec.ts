import { expect, test } from '@playwright/test';

/**
 * Reports hub + the three report routes (Phase 6/7 Batch 7).
 *
 * These routes live under `(app)/` so the auth proxy redirects
 * anonymous traffic to `/ingresar` with the original path preserved
 * in `?next=`. These e2e tests pin that redirect for each new route.
 * Authenticated rendering of the actual charts requires a signed-in
 * fixture (none in this repo yet); per the existing auth-redirect
 * spec convention, we test the rejection cases here and trust the
 * unit + RTL coverage for the chart rendering itself.
 */
test.describe('Reports routes — auth proxy', () => {
  const ROUTES = ['/reportes', '/reportes/flujo', '/reportes/gastos', '/reportes/comercios'];

  for (const route of ROUTES) {
    test(`anonymous → 307 to /ingresar with ?next=${route}`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      const location = response.headers().location ?? '';
      expect(location).toContain('/ingresar');
      expect(location).toContain(encodeURIComponent(route));
    });
  }

  test('preserves the period query param across the redirect', async ({ request }) => {
    const response = await request.get('/reportes/flujo?period=3m', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location ?? '';
    expect(location).toContain('period%3D3m');
  });
});
