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
    update: vi.fn(),
  },
  healthScoreRepo: {
    findLatestForProfile: vi.fn(),
    findHistoryForProfile: vi.fn(),
  },
}));

vi.mock('@/lib/intelligence/health-score/persist', () => ({
  recomputeHealthScore: vi.fn(),
}));

vi.mock('@/lib/db/tenant-context', () => ({
  withTenant: <T>(_ctx: unknown, fn: () => T | Promise<T>): Promise<T> => Promise.resolve(fn()),
}));

import { getCurrentUser } from '@/lib/auth/server';
import { healthScoreRepo, profileRepo } from '@/lib/db/repositories';
import { recomputeHealthScore } from '@/lib/intelligence/health-score/persist';
import { GET, POST } from './route';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const getCurrentUserMock = getCurrentUser as unknown as Mock;
const findManyForUserMock = profileRepo.findManyForUser as unknown as Mock;
const profileUpdateMock = profileRepo.update as unknown as Mock;
const findLatestMock = healthScoreRepo.findLatestForProfile as unknown as Mock;
const findHistoryMock = healthScoreRepo.findHistoryForProfile as unknown as Mock;
const recomputeMock = recomputeHealthScore as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function fakeUser(): { id: string } {
  return { id: 'user_test' };
}

function fakeProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'profile_test',
    displayName: 'Jorge',
    type: 'INDIVIDUAL',
    lastHealthScoreRecomputeAt: null,
    ...overrides,
  };
}

function fakeHealthScoreRow(score = 720): Record<string, unknown> {
  return {
    id: 'hs_test',
    profileId: 'profile_test',
    score,
    previousScore: null,
    factors: { breakdown: [] },
    computedAt: new Date('2026-05-21T00:00:00Z'),
    period: 'ON_DEMAND',
    metadata: {},
  };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  findManyForUserMock.mockReset();
  profileUpdateMock.mockReset();
  findLatestMock.mockReset();
  findHistoryMock.mockReset();
  recomputeMock.mockReset();
});

function req(url = 'http://localhost/api/v1/intelligence/health-score'): NextRequest {
  return new NextRequest(url);
}

describe('POST /api/v1/intelligence/health-score', () => {
  it('401 anonymous', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('400 when authenticated user has no profile', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_profile');
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('429 + Retry-After when within the 1h throttle window', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    /*
     * Last recompute was 10 minutes ago — 50 minutes remaining
     * (3000s). The exact integer drifts as the test runs; we just
     * assert the shape + sane bounds.
     */
    findManyForUserMock.mockResolvedValue([
      fakeProfile({ lastHealthScoreRecomputeAt: new Date(Date.now() - 10 * 60 * 1000) }),
    ]);

    const res = await POST(req());
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterSeconds: number };
    expect(body.error).toBe('throttled');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
    expect(res.headers.get('retry-after')).toBe(String(body.retryAfterSeconds));
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('200 + recompute + writes Profile.lastHealthScoreRecomputeAt when outside window', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([
      fakeProfile({
        // 2 hours ago — outside the 1h window
        lastHealthScoreRecomputeAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }),
    ]);
    recomputeMock.mockResolvedValue({
      snapshot: { score: 723 },
      healthScoreId: 'hs_new',
      actionsCount: 3,
    });
    findLatestMock.mockResolvedValue(fakeHealthScoreRow(723));
    profileUpdateMock.mockResolvedValue(fakeProfile());

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(recomputeMock).toHaveBeenCalledTimes(1);
    const args = recomputeMock.mock.calls[0]?.[0] as { profileId: string; period: string };
    expect(args.profileId).toBe('profile_test');
    expect(args.period).toBe('ON_DEMAND');

    expect(profileUpdateMock).toHaveBeenCalledTimes(1);
    const updateArgs = profileUpdateMock.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { lastHealthScoreRecomputeAt: Date };
    };
    expect(updateArgs.where.id).toBe('profile_test');
    expect(updateArgs.data.lastHealthScoreRecomputeAt).toBeInstanceOf(Date);

    const body = (await res.json()) as { data: { score: number }; healthScoreId: string };
    expect(body.data.score).toBe(723);
    expect(body.healthScoreId).toBe('hs_new');
  });

  it('200 + recompute on first-ever call (lastRecomputeAt is null)', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile({ lastHealthScoreRecomputeAt: null })]);
    recomputeMock.mockResolvedValue({
      snapshot: { score: 500 },
      healthScoreId: 'hs_first',
      actionsCount: 2,
    });
    findLatestMock.mockResolvedValue(fakeHealthScoreRow(500));
    profileUpdateMock.mockResolvedValue(fakeProfile());

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(recomputeMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/intelligence/health-score', () => {
  it('401 anonymous', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns { data, history } with default limit (30)', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
    findLatestMock.mockResolvedValue(fakeHealthScoreRow(720));
    findHistoryMock.mockResolvedValue([fakeHealthScoreRow(720), fakeHealthScoreRow(700)]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { score: number }; history: unknown[] };
    expect(body.data.score).toBe(720);
    expect(body.history).toHaveLength(2);

    const histArgs = findHistoryMock.mock.calls[0]?.[0] as { limit: number };
    expect(histArgs.limit).toBe(30);
  });

  it('honors a custom historyLimit query param (clamped to 90)', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
    findLatestMock.mockResolvedValue(null);
    findHistoryMock.mockResolvedValue([]);

    await GET(req('http://localhost/api/v1/intelligence/health-score?historyLimit=200'));
    const histArgs = findHistoryMock.mock.calls[0]?.[0] as { limit: number };
    expect(histArgs.limit).toBe(90);
  });

  it('returns { data: null, history: [] } when the user has no score yet', async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
    findLatestMock.mockResolvedValue(null);
    findHistoryMock.mockResolvedValue([]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown; history: unknown[] };
    expect(body.data).toBeNull();
    expect(body.history).toEqual([]);
  });
});
