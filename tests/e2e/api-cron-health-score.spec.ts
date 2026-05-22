import { expect, test } from '@playwright/test';

/**
 * GET /api/cron/health-score — the nightly Health Score recompute drain.
 *
 * Auth is `Authorization: Bearer <CRON_SECRET>`. Vercel Cron attaches
 * this header automatically when invoking the schedule registered in
 * `vercel.json`. These tests pin the unauthenticated cases; the
 * authenticated happy-path is covered by
 * `src/app/api/cron/health-score/route.test.ts`.
 */
test.describe('GET /api/cron/health-score — authentication', () => {
  test('returns 401 for anonymous requests (no Authorization header)', async ({ request }) => {
    const response = await request.get('/api/cron/health-score');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 with a wrong bearer token', async ({ request }) => {
    const response = await request.get('/api/cron/health-score', {
      headers: { Authorization: 'Bearer wrong-token-not-the-secret' },
    });
    expect(response.status()).toBe(401);
  });

  test('returns 401 when the header is the right shape but not a Bearer scheme', async ({
    request,
  }) => {
    const response = await request.get('/api/cron/health-score', {
      headers: { Authorization: 'Basic Zm9vOmJhcg==' },
    });
    expect(response.status()).toBe(401);
  });
});
