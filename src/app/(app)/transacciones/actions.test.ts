/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingJob } from '@prisma/client';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused',
    databaseUrl: 'unused',
    directUrl: 'unused',
    anthropicApiKey: 'unused',
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
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

vi.mock('@/lib/jobs/queue', () => ({
  jobQueue: {
    countPendingForProfile: vi.fn(),
    claimForProfile: vi.fn(),
    markDone: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('@/lib/jobs/handlers', () => ({
  getHandler: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { jobQueue } from '@/lib/jobs/queue';
import { getHandler } from '@/lib/jobs/handlers';
import { processPendingJobs } from './actions';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const getUserMock = getCurrentUser as unknown as Mock;
const findManyMock = profileRepo.findManyForUser as unknown as Mock;
const countMock = jobQueue.countPendingForProfile as unknown as Mock;
const claimMock = jobQueue.claimForProfile as unknown as Mock;
const markDoneMock = jobQueue.markDone as unknown as Mock;
const markFailedMock = jobQueue.markFailed as unknown as Mock;
const getHandlerMock = getHandler as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function fakeJob(overrides: Partial<PendingJob> = {}): PendingJob {
  return {
    id: 'job_test_id',
    type: 'CATEGORIZE_TRANSACTION',
    payload: { transactionId: 'tx_1', profileId: 'profile_uuid_xyz' },
    status: 'PENDING',
    attempts: 0,
    scheduledAt: new Date('2026-05-22T00:00:00Z'),
    lockedAt: new Date('2026-05-22T00:00:01Z'),
    lockedBy: 'worker-1',
    lastError: null,
    createdAt: new Date('2026-05-22T00:00:00Z'),
    updatedAt: new Date('2026-05-22T00:00:01Z'),
    ...overrides,
  };
}

function authedUser(profileId = 'profile_uuid_xyz') {
  getUserMock.mockResolvedValue({ id: 'user_abc' });
  findManyMock.mockResolvedValue([{ id: profileId, displayName: 'Test' }]);
}

beforeEach(() => {
  getUserMock.mockReset();
  findManyMock.mockReset();
  countMock.mockReset();
  claimMock.mockReset();
  markDoneMock.mockReset();
  markFailedMock.mockReset();
  getHandlerMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {
    /* silence per-job markFailed-throws logging */
  });
});

describe('processPendingJobs — auth gating', () => {
  it('redirects anonymous callers to /ingresar', async () => {
    getUserMock.mockResolvedValue(null);
    await expect(processPendingJobs()).rejects.toThrow('REDIRECT:/ingresar');
    expect(countMock).not.toHaveBeenCalled();
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('redirects users without a profile to /bienvenida', async () => {
    getUserMock.mockResolvedValue({ id: 'user_abc' });
    findManyMock.mockResolvedValue([]);
    await expect(processPendingJobs()).rejects.toThrow('REDIRECT:/bienvenida');
    expect(countMock).not.toHaveBeenCalled();
  });
});

describe('processPendingJobs — empty queue short-circuit', () => {
  it('returns zero summary without claiming when count = 0', async () => {
    authedUser();
    countMock.mockResolvedValue(0);

    const result = await processPendingJobs();

    expect(result).toEqual({ pendingBefore: 0, claimed: 0, completed: 0, failed: 0 });
    expect(claimMock).not.toHaveBeenCalled();
    expect(getHandlerMock).not.toHaveBeenCalled();
  });
});

describe('processPendingJobs — happy path', () => {
  it('claims tenant-scoped, dispatches each handler, marks done, returns counts', async () => {
    authedUser('profile_uuid_xyz');
    countMock.mockResolvedValue(3);
    const jobs = [
      fakeJob({ id: 'j1' }),
      fakeJob({ id: 'j2', type: 'DETECT_ANOMALY' }),
      fakeJob({ id: 'j3' }),
    ];
    claimMock.mockResolvedValue(jobs);
    const handlerFn = vi.fn().mockResolvedValue(undefined);
    getHandlerMock.mockReturnValue(handlerFn);
    markDoneMock.mockResolvedValue(undefined);

    const result = await processPendingJobs();

    expect(claimMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user:user_abc:/) as string,
      25, // MAX_JOBS_PER_INVOCATION
      'profile_uuid_xyz',
    );
    expect(handlerFn).toHaveBeenCalledTimes(3);
    expect(markDoneMock).toHaveBeenCalledTimes(3);
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(result).toEqual({ pendingBefore: 3, claimed: 3, completed: 3, failed: 0 });
  });
});

describe('processPendingJobs — per-job failure isolation', () => {
  it('marks failed jobs failed without stopping the loop', async () => {
    authedUser();
    countMock.mockResolvedValue(3);
    claimMock.mockResolvedValue([
      fakeJob({ id: 'ok_1' }),
      fakeJob({ id: 'bad' }),
      fakeJob({ id: 'ok_2' }),
    ]);
    const handlerFn = vi.fn().mockImplementation((payload: { transactionId: string }) => {
      if (payload.transactionId === 'tx_1') {
        // Three calls share the same payload shape; differentiate via call order
      }
      return Promise.resolve();
    });
    // Fail the second handler call only.
    handlerFn.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('handler boom'));
    getHandlerMock.mockReturnValue(handlerFn);
    markDoneMock.mockResolvedValue(undefined);
    markFailedMock.mockResolvedValue(undefined);

    const result = await processPendingJobs();

    expect(result.claimed).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock).toHaveBeenCalledWith('bad', 'handler boom');
    expect(markDoneMock).toHaveBeenCalledTimes(2);
  });

  it('survives markFailed itself throwing', async () => {
    authedUser();
    countMock.mockResolvedValue(1);
    claimMock.mockResolvedValue([fakeJob({ id: 'unhappy' })]);
    const handlerFn = vi.fn().mockRejectedValue(new Error('handler boom'));
    getHandlerMock.mockReturnValue(handlerFn);
    markFailedMock.mockRejectedValue(new Error('db blip'));

    const result = await processPendingJobs();

    expect(result.failed).toBe(1);
    expect(result.completed).toBe(0);
  });
});
