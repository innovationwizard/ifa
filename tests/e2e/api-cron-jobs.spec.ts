import { expect, test } from '@playwright/test';

/**
 * GET /api/cron/jobs — the background-job drain.
 *
 * Auth is `Authorization: Bearer <CRON_SECRET>`. The cron endpoint
 * is intentionally outside the per-user auth flow (it runs from a
 * Vercel cron, not a browser session), so these tests pin the
 * unauthenticated cases. The authenticated happy-path is covered by
 * the unit suite at `src/app/api/cron/jobs/route.test.ts`.
 */
test.describe('GET /api/cron/jobs — authentication', () => {
  test('returns 401 for anonymous requests (no Authorization header)', async ({ request }) => {
    const response = await request.get('/api/cron/jobs');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 with a wrong bearer token', async ({ request }) => {
    const response = await request.get('/api/cron/jobs', {
      headers: { Authorization: 'Bearer wrong-token-not-the-secret' },
    });
    expect(response.status()).toBe(401);
  });

  test('returns 401 when the header is the right shape but not a Bearer scheme', async ({
    request,
  }) => {
    const response = await request.get('/api/cron/jobs', {
      headers: { Authorization: 'Basic Zm9vOmJhcg==' },
    });
    expect(response.status()).toBe(401);
  });
});
