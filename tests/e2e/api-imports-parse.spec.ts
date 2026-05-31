import { expect, test } from '@playwright/test';

/**
 * POST /api/v1/imports/parse — universal AI-assisted column extractor
 * (Phase L1.7). Endpoint is auth-gated. These e2e tests pin the
 * anonymous-401 contract — the authenticated 200/400 paths are
 * covered by the unit suite at `route.test.ts` because a signed-in
 * Playwright fixture isn't set up yet (same constraint as the
 * existing `api-health-score.spec.ts`).
 */
test.describe('Imports parse API — authentication', () => {
  test('POST returns 401 for anonymous requests (no Authorization, no session cookie)', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/imports/parse', {
      data: { headers: ['Fecha'], sampleRows: [] },
    });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('POST 401 even with a well-formed payload (auth checked before payload)', async ({
    request,
  }) => {
    /*
     * Pins the order: auth gate runs FIRST, before Zod validation.
     * A payload-validation regression that flipped the order (e.g.,
     * 400 before 401) would leak to anonymous callers whether their
     * payload was well-formed — a small but real fingerprinting leak.
     */
    const response = await request.post('/api/v1/imports/parse', {
      data: {
        headers: ['Fecha', 'Concepto', 'Monto'],
        sampleRows: [{ Fecha: '2026-05-01', Concepto: 'PAGO', Monto: '-100' }],
      },
    });
    expect(response.status()).toBe(401);
  });

  test('POST 401 even when the body is missing entirely (auth checked before body parse)', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/imports/parse');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
  });
});
