/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused',
    databaseUrl: 'unused',
    directUrl: 'unused',
    anthropicApiKey: 'unused',
  }),
}));

vi.mock('@/lib/db/repositories', () => ({
  profileRepo: {
    update: vi.fn(),
  },
}));

vi.mock('./persist', () => ({
  recomputeHealthScore: vi.fn(),
}));

import { profileRepo } from '@/lib/db/repositories';
import { recomputeHealthScore } from './persist';
import {
  STALENESS_THRESHOLD_MS,
  canAutoRecompute,
  isStale,
  maybeRecomputeStale,
} from './staleness';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const updateMock = profileRepo.update as unknown as Mock;
const recomputeMock = recomputeHealthScore as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

beforeEach(() => {
  updateMock.mockReset();
  recomputeMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {
    /* silence the recompute-failed log line during tests */
  });
});

describe('isStale', () => {
  const now = new Date('2026-05-22T12:00:00Z');

  it('returns false when there is no prior score (empty state, not auto-recompute)', () => {
    expect(isStale(null, now)).toBe(false);
  });

  it('returns false when the score is younger than the threshold', () => {
    const computedAt = new Date(now.getTime() - (STALENESS_THRESHOLD_MS - 1));
    expect(isStale({ computedAt }, now)).toBe(false);
  });

  it('returns true at exactly the threshold boundary', () => {
    const computedAt = new Date(now.getTime() - STALENESS_THRESHOLD_MS);
    expect(isStale({ computedAt }, now)).toBe(true);
  });

  it('returns true when the score is older than the threshold', () => {
    const computedAt = new Date(now.getTime() - (STALENESS_THRESHOLD_MS + 60_000));
    expect(isStale({ computedAt }, now)).toBe(true);
  });
});

describe('canAutoRecompute', () => {
  const now = new Date('2026-05-22T12:00:00Z');

  it('returns true when no prior recompute timestamp exists', () => {
    expect(canAutoRecompute(null, now)).toBe(true);
  });

  it('returns false inside the 1h throttle window', () => {
    const lastAt = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    expect(canAutoRecompute(lastAt, now)).toBe(false);
  });

  it('returns true past the throttle window', () => {
    const lastAt = new Date(now.getTime() - 61 * 60 * 1000); // 61 min ago
    expect(canAutoRecompute(lastAt, now)).toBe(true);
  });
});

describe('maybeRecomputeStale', () => {
  const now = new Date('2026-05-22T12:00:00Z');
  const profileId = 'profile_uuid_xyz';
  const stale = { computedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) }; // 25h ago
  const fresh = { computedAt: new Date(now.getTime() - 60 * 60 * 1000) }; // 1h ago

  it('returns false + does NOTHING when there is no prior score', async () => {
    const result = await maybeRecomputeStale({
      profileId,
      latestScore: null,
      lastRecomputeAt: null,
      now,
    });
    expect(result).toBe(false);
    expect(recomputeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns false + does nothing when the score is fresh', async () => {
    const result = await maybeRecomputeStale({
      profileId,
      latestScore: fresh,
      lastRecomputeAt: null,
      now,
    });
    expect(result).toBe(false);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('returns false + does nothing when the score is stale but throttle blocks', async () => {
    const result = await maybeRecomputeStale({
      profileId,
      latestScore: stale,
      lastRecomputeAt: new Date(now.getTime() - 30 * 60 * 1000),
      now,
    });
    expect(result).toBe(false);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('recomputes and stamps the timestamp when stale + throttle allows', async () => {
    recomputeMock.mockResolvedValue({ snapshot: {}, healthScoreId: 'hs_1', actionsCount: 0 });
    updateMock.mockResolvedValue({});

    const result = await maybeRecomputeStale({
      profileId,
      latestScore: stale,
      lastRecomputeAt: null,
      now,
    });

    expect(result).toBe(true);
    expect(recomputeMock).toHaveBeenCalledWith({ profileId, now, period: 'DAILY' });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: profileId },
      data: { lastHealthScoreRecomputeAt: now },
    });
  });

  it('returns false + does NOT stamp when recompute throws', async () => {
    /*
     * Production-first: a broken recompute MUST NOT bubble out to
     * the dashboard. The page renders the cached (stale) score
     * instead, and the un-stamped throttle lets the next visit
     * retry.
     */
    recomputeMock.mockRejectedValue(new Error('engine boom'));

    const result = await maybeRecomputeStale({
      profileId,
      latestScore: stale,
      lastRecomputeAt: null,
      now,
    });

    expect(result).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
