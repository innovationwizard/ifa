import { expect, test } from '@playwright/test';

/**
 * GET / POST /api/v1/intelligence/health-score (Phase 6/7 Batch 11).
 *
 * Both methods require an authenticated user. These e2e tests pin
 * the anonymous-401 contract — the authenticated 429/200 paths are
 * covered by the unit suite at `route.test.ts` because a signed-in
 * Playwright fixture isn't set up yet.
 */
test.describe('Health Score API — authentication', () => {
  test('POST returns 401 for anonymous requests', async ({ request }) => {
    const response = await request.post('/api/v1/intelligence/health-score');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('GET returns 401 for anonymous requests', async ({ request }) => {
    const response = await request.get('/api/v1/intelligence/health-score');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('GET 401 even when historyLimit query param looks valid (auth checked first)', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/intelligence/health-score?historyLimit=10');
    expect(response.status()).toBe(401);
  });
});
