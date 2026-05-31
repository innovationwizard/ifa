/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused',
    databaseUrl: 'unused',
    directUrl: 'unused',
    anthropicApiKey: 'unused',
  }),
}));

vi.mock('@/lib/auth/server', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  profileRepo: {
    findManyForUser: vi.fn(),
  },
}));

vi.mock('@/lib/ingestion/extractor', () => ({
  extractFromCsv: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { extractFromCsv } from '@/lib/ingestion/extractor';
import { POST } from './route';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const getCurrentUserMock = getCurrentUser as unknown as Mock;
const findManyForUserMock = profileRepo.findManyForUser as unknown as Mock;
const extractMock = extractFromCsv as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/imports/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function fakeUser(): { id: string } {
  return { id: 'user_test' };
}

function fakeProfile() {
  return { id: 'profile_test', displayName: 'Jorge' };
}

const VALID_PAYLOAD = {
  headers: ['Fecha', 'Concepto', 'Monto'],
  sampleRows: [{ Fecha: '2026-05-01', Concepto: 'PAGO', Monto: '-100' }],
};

beforeEach(() => {
  getCurrentUserMock.mockReset();
  findManyForUserMock.mockReset();
  extractMock.mockReset();
});

describe('POST /api/v1/imports/parse — auth gating', () => {
  it('returns 401 when no user is authenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_PAYLOAD));

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
    expect(findManyForUserMock).not.toHaveBeenCalled();
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 'no_profile' when authed user has no Profile (mid-onboarding)", async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([]);

    const res = await POST(makeRequest(VALID_PAYLOAD));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_profile');
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/imports/parse — payload validation', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it("returns 400 'invalid_json' when the body is not valid JSON", async () => {
    const res = await POST(makeRequest('not-json-at-all{'));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 'invalid_payload' when headers array is empty", async () => {
    const res = await POST(makeRequest({ headers: [], sampleRows: [] }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: unknown[] };
    expect(body.error).toBe('invalid_payload');
    expect(body.issues).toBeDefined();
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 'invalid_payload' when sampleRows is missing", async () => {
    const res = await POST(makeRequest({ headers: ['Fecha'] }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_payload');
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 'invalid_payload' when a sampleRow cell is non-string", async () => {
    /*
     * Zod is strict: `Record<string, string>` rejects numeric cells.
     * Pinning so a future schema-widening (e.g., to accept Date
     * objects or numbers) is an explicit decision, not an accident.
     */
    const res = await POST(
      makeRequest({
        headers: ['Fecha'],
        sampleRows: [{ Fecha: 12345 }],
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_payload');
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/imports/parse — happy path', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it('returns 200 with the orchestrator result for a valid payload', async () => {
    const orchestratorResult = {
      sample: [
        {
          date: '2026-05-01',
          description: 'PAGO',
          amount: '-100',
          debit: null,
          credit: null,
          merchantNit: null,
        },
      ],
      mapping: { Fecha: 'date', Concepto: 'description', Monto: 'amount' },
      confidence: { date: { score: 0.95 }, description: { score: 0.9 }, amount: { score: 0.9 } },
      overallConfidence: 0.92,
      source: 'heuristic',
      trace: { steps: [{ step: 'heuristic', durationMs: 1, outcome: 'matched' }] },
    };
    extractMock.mockResolvedValue(orchestratorResult);

    const res = await POST(makeRequest(VALID_PAYLOAD));

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof orchestratorResult;
    expect(body.overallConfidence).toBe(0.92);
    expect(body.source).toBe('heuristic');
    expect(body.mapping).toEqual(orchestratorResult.mapping);
  });

  it('forwards the exact payload to extractFromCsv (no shape mutation)', async () => {
    extractMock.mockResolvedValue({
      sample: [],
      confidence: {},
      overallConfidence: 0.92,
      source: 'heuristic',
      trace: { steps: [] },
    });

    await POST(makeRequest(VALID_PAYLOAD));

    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(extractMock).toHaveBeenCalledWith({
      headers: VALID_PAYLOAD.headers,
      sampleRows: VALID_PAYLOAD.sampleRows,
    });
  });
});
