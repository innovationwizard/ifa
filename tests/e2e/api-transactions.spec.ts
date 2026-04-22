import { expect, test } from '@playwright/test';

test.describe('GET /api/v1/transactions — authentication', () => {
  test('returns 401 + { error: "unauthenticated" } for anonymous requests', async ({ request }) => {
    const response = await request.get('/api/v1/transactions');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 even when query params look valid (auth is checked first)', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/transactions?limit=10&source=BANK_CSV');
    expect(response.status()).toBe(401);
  });
});

test.describe('GET /api/v1/transactions/[id] — authentication + validation', () => {
  test('returns 401 for anonymous requests (any id shape)', async ({ request }) => {
    const response = await request.get('/api/v1/transactions/01900000-0000-7000-8000-000000000000');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 for a malformed id too (auth is checked before id validation)', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/transactions/not-a-uuid');
    expect(response.status()).toBe(401);
  });
});

test.describe('POST /api/v1/transactions — authentication + validation', () => {
  test('returns 401 for anonymous POST', async ({ request }) => {
    const response = await request.post('/api/v1/transactions', {
      data: {
        amount: 100,
        date: '2026-04-21',
        type: 'EXPENSE',
        description: 'test',
      },
    });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('returns 401 even when the body is invalid (auth is checked first)', async ({ request }) => {
    const response = await request.post('/api/v1/transactions', { data: {} });
    expect(response.status()).toBe(401);
  });

  test('returns 401 even when an Idempotency-Key is set', async ({ request }) => {
    const response = await request.post('/api/v1/transactions', {
      headers: { 'Idempotency-Key': '01900000-0000-7000-8000-000000000000' },
      data: {
        amount: 50,
        date: '2026-04-21',
        type: 'INCOME',
        description: 'test',
      },
    });
    expect(response.status()).toBe(401);
  });
});
