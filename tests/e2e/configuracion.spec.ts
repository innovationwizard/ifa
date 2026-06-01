import { expect, test } from '@playwright/test';

/**
 * /configuracion — settings page shell (Phase L3.2).
 *
 * The route lives under `(app)/` so the auth proxy redirects
 * anonymous traffic to `/ingresar`. This spec pins that redirect;
 * the authenticated rendering of the 4 section placeholders is
 * exercised by the L3.2 server component itself (no signed-in
 * Playwright fixture exists in this repo).
 */
test.describe('/configuracion — auth proxy', () => {
  test('anonymous → 307 to /ingresar with ?next=/configuracion', async ({ request }) => {
    const response = await request.get('/configuracion', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location ?? '';
    expect(location).toContain('/ingresar');
    expect(location).toContain(encodeURIComponent('/configuracion'));
  });
});
