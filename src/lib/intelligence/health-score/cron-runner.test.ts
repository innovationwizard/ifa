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
    listActiveProfileIds: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./persist', () => ({
  recomputeHealthScore: vi.fn(),
}));

import { profileRepo } from '@/lib/db/repositories';
import { recomputeHealthScore } from './persist';
import { runHealthScoreCron } from './cron-runner';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const listIdsMock = profileRepo.listActiveProfileIds as unknown as Mock;
const updateMock = profileRepo.update as unknown as Mock;
const recomputeMock = recomputeHealthScore as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

beforeEach(() => {
  listIdsMock.mockReset();
  updateMock.mockReset();
  recomputeMock.mockReset();
  // Silence the per-failure console.error so the suite output stays clean.
  vi.spyOn(console, 'error').mockImplementation(() => {
    /* no-op */
  });
});

describe('runHealthScoreCron — empty profile set', () => {
  it('returns a zero summary when no active profiles exist', async () => {
    listIdsMock.mockResolvedValue([]);
    const summary = await runHealthScoreCron({ now: new Date('2026-05-21T08:00:00Z') });
    expect(summary).toMatchObject({
      totalProfiles: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
    });
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(recomputeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('runHealthScoreCron — happy path', () => {
  it('recomputes each profile and stamps lastHealthScoreRecomputeAt', async () => {
    const now = new Date('2026-05-21T08:00:00Z');
    listIdsMock.mockResolvedValue(['p_1', 'p_2', 'p_3']);
    recomputeMock.mockResolvedValue({ snapshot: {}, healthScoreId: 'hs_1', actionsCount: 0 });
    updateMock.mockResolvedValue({});

    const summary = await runHealthScoreCron({ now });

    expect(summary.totalProfiles).toBe(3);
    expect(summary.succeeded).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.failures).toEqual([]);

    /*
     * Each profile is invoked with period: 'DAILY' (canonical cron
     * recompute, distinct from the user-pressed 'ON_DEMAND' path).
     */
    expect(recomputeMock).toHaveBeenCalledTimes(3);
    for (const profileId of ['p_1', 'p_2', 'p_3']) {
      expect(recomputeMock).toHaveBeenCalledWith({ profileId, now, period: 'DAILY' });
    }

    /*
     * Throttle stamp goes out per-profile after each successful
     * recompute. Same `now` Date instance so the API's 1×/hour
     * throttle check returns retryAfter > 0 for any ON_DEMAND
     * request inside the next hour.
     */
    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'p_1' },
      data: { lastHealthScoreRecomputeAt: now },
    });
  });
});

describe('runHealthScoreCron — per-profile isolation', () => {
  it('continues the batch when a single recompute throws', async () => {
    listIdsMock.mockResolvedValue(['p_ok_1', 'p_fail', 'p_ok_2']);
    recomputeMock.mockImplementation(({ profileId }: { profileId: string }) => {
      if (profileId === 'p_fail') throw new Error('engine boom');
      return Promise.resolve({ snapshot: {}, healthScoreId: 'hs', actionsCount: 0 });
    });
    updateMock.mockResolvedValue({});

    const summary = await runHealthScoreCron();

    expect(summary.totalProfiles).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.failures).toEqual([{ profileId: 'p_fail', error: 'engine boom' }]);

    // The throttle stamp is NOT applied to the failed profile — only
    // succeeded ones get it. A retry on the next cron firing should
    // see lastHealthScoreRecomputeAt unchanged for `p_fail`.
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).not.toHaveBeenCalledWith({
      where: { id: 'p_fail' },
      data: expect.anything() as unknown,
    });
  });

  it('continues the batch when the throttle-stamp update throws', async () => {
    /*
     * The stamp is a hardening detail — a transient blip there must
     * not crash the entire cron. The recompute already succeeded, so
     * we count the profile as succeeded if the recompute itself was
     * fine, but record the failure entry for ops visibility.
     */
    listIdsMock.mockResolvedValue(['p_stamp_fails', 'p_ok']);
    recomputeMock.mockResolvedValue({ snapshot: {}, healthScoreId: 'hs', actionsCount: 0 });
    updateMock.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'p_stamp_fails') {
        throw new Error('db blip');
      }
      return Promise.resolve({});
    });

    const summary = await runHealthScoreCron();

    // The stamp failure surfaces in the failure list (single source of
    // truth for ops). The recompute counter reflects engine successes.
    expect(summary.totalProfiles).toBe(2);
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(summary.failures.some((f) => f.profileId === 'p_stamp_fails')).toBe(true);
  });

  it('serializes the error message for non-Error throws', async () => {
    listIdsMock.mockResolvedValue(['p_string_throw']);
    recomputeMock.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional non-Error throw to exercise the runner's defensive `String(err)` branch
      throw 'plain string boom';
    });
    const summary = await runHealthScoreCron();
    expect(summary.failures[0]?.error).toBe('plain string boom');
  });
});
