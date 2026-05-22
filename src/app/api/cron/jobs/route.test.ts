/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingJob } from '@prisma/client';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused',
    databaseUrl: 'unused',
    directUrl: 'unused',
    anthropicApiKey: 'unused',
  }),
}));

vi.mock('@/lib/jobs/queue', () => ({
  jobQueue: {
    claim: vi.fn(),
    markDone: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('@/lib/jobs/handlers', () => ({
  getHandler: vi.fn(),
}));

import { jobQueue } from '@/lib/jobs/queue';
import { getHandler } from '@/lib/jobs/handlers';
import { GET } from './route';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const claimMock = jobQueue.claim as unknown as Mock;
const markDoneMock = jobQueue.markDone as unknown as Mock;
const markFailedMock = jobQueue.markFailed as unknown as Mock;
const getHandlerMock = getHandler as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function fakeJob(overrides: Partial<PendingJob> = {}): PendingJob {
  return {
    id: 'job_test_id',
    type: 'CATEGORIZE_TRANSACTION',
    payload: { transactionId: 'tx_1' },
    status: 'PENDING',
    attempts: 0,
    scheduledAt: new Date('2026-05-21T00:00:00Z'),
    lockedAt: new Date('2026-05-21T00:00:01Z'),
    lockedBy: 'worker-1',
    lastError: null,
    createdAt: new Date('2026-05-21T00:00:00Z'),
    updatedAt: new Date('2026-05-21T00:00:01Z'),
    ...overrides,
  };
}

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/cron/jobs', { headers });
}

beforeEach(() => {
  claimMock.mockReset();
  markDoneMock.mockReset();
  markFailedMock.mockReset();
  getHandlerMock.mockReset();
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/jobs — auth', () => {
  it('returns 401 when CRON_SECRET env var is unset (fail-closed)', async () => {
    process.env.CRON_SECRET = '';
    const res = await GET(makeRequest({ authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header is present', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await GET(makeRequest({ authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('processes the queue when the bearer token matches', async () => {
    process.env.CRON_SECRET = 'super-secret';
    claimMock.mockResolvedValue([]);

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(res.status).toBe(200);
    expect(claimMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/jobs — processing loop', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret';
  });

  it('dispatches each job to its handler and marks success', async () => {
    const jobs = [
      fakeJob({ id: 'job_1', type: 'CATEGORIZE_TRANSACTION' }),
      fakeJob({ id: 'job_2', type: 'DETECT_ANOMALY' }),
    ];
    claimMock.mockResolvedValue(jobs);

    const okHandler = vi.fn().mockResolvedValue(undefined);
    getHandlerMock.mockReturnValue(okHandler);

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const body = (await res.json()) as {
      claimed: number;
      completed: number;
      failed: number;
      workerId: string;
      durationMs: number;
    };

    expect(body.claimed).toBe(2);
    expect(body.completed).toBe(2);
    expect(body.failed).toBe(0);
    expect(typeof body.workerId).toBe('string');
    expect(typeof body.durationMs).toBe('number');

    expect(okHandler).toHaveBeenCalledTimes(2);
    expect(markDoneMock).toHaveBeenCalledTimes(2);
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('isolates per-job failures — one throwing handler does not crash the batch', async () => {
    const jobs = [
      fakeJob({ id: 'job_ok_1' }),
      fakeJob({ id: 'job_boom' }),
      fakeJob({ id: 'job_ok_2' }),
    ];
    claimMock.mockResolvedValue(jobs);

    /*
     * Per-job handler routing: id-based dispatch so the middle job
     * deliberately throws while the surrounding jobs succeed. This
     * mirrors real-world handler failure patterns (e.g., one bad
     * payload in a batch of 25 categorization jobs).
     */
    const handler: (payload: unknown) => Promise<void> = (payload) => {
      const txId = (payload as { transactionId: string }).transactionId;
      if (txId === 'tx_1') {
        // The throwing job's payload was customized below
      }
      return Promise.resolve();
    };
    void handler;

    // Simpler: drive failure by patching getHandler per-call.
    let callIndex = 0;
    getHandlerMock.mockImplementation(() => {
      const i = callIndex;
      callIndex += 1;
      if (i === 1) {
        return () => Promise.reject(new Error('handler exploded'));
      }
      return () => Promise.resolve();
    });

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const body = (await res.json()) as { claimed: number; completed: number; failed: number };

    expect(body.claimed).toBe(3);
    expect(body.completed).toBe(2);
    expect(body.failed).toBe(1);

    expect(markDoneMock).toHaveBeenCalledTimes(2);
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock).toHaveBeenCalledWith('job_boom', 'handler exploded');
  });

  it('returns an empty summary when claim returns no jobs', async () => {
    claimMock.mockResolvedValue([]);
    getHandlerMock.mockReturnValue(() => Promise.resolve());

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const body = (await res.json()) as { claimed: number; completed: number; failed: number };

    expect(body.claimed).toBe(0);
    expect(body.completed).toBe(0);
    expect(body.failed).toBe(0);
    expect(markDoneMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('continues the loop when markFailed itself throws (logs + counts the failure)', async () => {
    const jobs = [fakeJob({ id: 'job_1' }), fakeJob({ id: 'job_2' })];
    claimMock.mockResolvedValue(jobs);
    getHandlerMock.mockReturnValue(() => Promise.reject(new Error('always fails')));
    markFailedMock.mockRejectedValueOnce(new Error('DB connection lost'));
    markFailedMock.mockResolvedValueOnce(undefined);

    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(((..._args: unknown[]) => undefined) as () => void);

    const res = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const body = (await res.json()) as { claimed: number; completed: number; failed: number };

    /*
     * Both jobs counted as failed even though one had a markFailed
     * DB blip. The loop did not crash. The blip surfaces in
     * structured logs (asserted via the spy).
     */
    expect(body.claimed).toBe(2);
    expect(body.completed).toBe(0);
    expect(body.failed).toBe(2);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
