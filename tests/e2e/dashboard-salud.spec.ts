import { expect, test } from '@playwright/test';

/**
 * /dashboard/salud — full Health Score detail page (Phase 6/7 Batch 13).
 *
 * The route lives under `(app)/` so the auth proxy redirects
 * anonymous traffic to `/ingresar`. This spec pins that redirect;
 * the authenticated rendering of the bullet + factor bars +
 * history + improvements is covered by unit + RTL tests in the
 * vitest suite.
 */
test.describe('/dashboard/salud — auth proxy', () => {
  test('anonymous → 307 to /ingresar with ?next=/dashboard/salud', async ({ request }) => {
    const response = await request.get('/dashboard/salud', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location ?? '';
    expect(location).toContain('/ingresar');
    expect(location).toContain(encodeURIComponent('/dashboard/salud'));
  });
});
