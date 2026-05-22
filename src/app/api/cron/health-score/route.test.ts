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

vi.mock('@/lib/intelligence/health-score/cron-runner', () => ({
  runHealthScoreCron: vi.fn(),
}));

import { runHealthScoreCron } from '@/lib/intelligence/health-score/cron-runner';
import { GET } from './route';

const runMock = runHealthScoreCron as unknown as Mock;

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/cron/health-score', { headers });
}

beforeEach(() => {
  runMock.mockReset();
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/health-score — auth', () => {
  it('returns 401 when CRON_SECRET env var is unset (fail-closed)', async () => {
    process.env.CRON_SECRET = '';
    const res = await GET(makeRequest({ authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header is present', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token does not match', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await GET(makeRequest({ authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/health-score — happy path', () => {
  it('returns the cron summary as JSON when authorized', async () => {
    process.env.CRON_SECRET = 'super-secret';
    runMock.mockResolvedValue({
      totalProfiles: 3,
      succeeded: 3,
      failed: 0,
      durationMs: 42,
      failures: [],
    });

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      totalProfiles: 3,
      succeeded: 3,
      failed: 0,
      failures: [],
    });
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
