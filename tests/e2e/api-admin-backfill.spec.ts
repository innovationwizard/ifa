import { expect, test } from '@playwright/test';

/**
 * POST /api/admin/backfill-categorization — operator-only endpoint
 * that enqueues a categorization job per uncategorized transaction.
 *
 * Auth is `Authorization: Bearer <CRON_SECRET>` PLUS a `?confirm=yes`
 * query parameter (defense against accidental fire). These e2e tests
 * pin the rejection cases. The full happy-path is covered by the
 * unit suite at `src/app/api/admin/backfill-categorization/route.test.ts`.
 */
test.describe('POST /api/admin/backfill-categorization — authentication', () => {
  test('returns 401 for anonymous requests (no Authorization header)', async ({ request }) => {
    const response = await request.post('/api/admin/backfill-categorization?confirm=yes');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 with a wrong bearer token (even with ?confirm=yes)', async ({ request }) => {
    const response = await request.post('/api/admin/backfill-categorization?confirm=yes', {
      headers: { Authorization: 'Bearer wrong-token-not-the-secret' },
    });
    expect(response.status()).toBe(401);
  });

  test('returns 401 even with a wrong scheme (Basic, not Bearer)', async ({ request }) => {
    const response = await request.post('/api/admin/backfill-categorization?confirm=yes', {
      headers: { Authorization: 'Basic Zm9vOmJhcg==' },
    });
    expect(response.status()).toBe(401);
  });
});
