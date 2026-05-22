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

/*
 * Mock the prisma surface the queue touches. `$queryRaw` /
 * `$executeRaw` are template-tag functions; vitest's `vi.fn` captures
 * them as plain functions so each call records the args (TemplateStringsArray
 * first, interpolation values following).
 */
vi.mock('@/lib/db/prisma', () => ({
  prismaUnscoped: {
    pendingJob: {
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import { prismaUnscoped } from '@/lib/db/prisma';
import { MAX_ATTEMPTS, jobQueue } from './queue';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const createMock = prismaUnscoped.pendingJob.create as unknown as Mock;
const updateMock = prismaUnscoped.pendingJob.update as unknown as Mock;
const groupByMock = prismaUnscoped.pendingJob.groupBy as unknown as Mock;
const queryRawMock = prismaUnscoped.$queryRaw as unknown as Mock;
const executeRawMock = prismaUnscoped.$executeRaw as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function fakeJob(overrides: Partial<PendingJob> = {}): PendingJob {
  return {
    id: 'job_test_id',
    type: 'CATEGORIZE_TRANSACTION',
    payload: { transactionId: 'tx_1' },
    status: 'PENDING',
    attempts: 0,
    scheduledAt: new Date('2026-05-21T00:00:00Z'),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: new Date('2026-05-21T00:00:00Z'),
    updatedAt: new Date('2026-05-21T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Recover the literal SQL fragments from a tagged-template call.
 * `$queryRaw`/`$executeRaw` receive `TemplateStringsArray` as the
 * first arg; concatenating the strings gives the parameterized
 * statement (with `?` placeholders for interpolated values).
 */
function readSql(rawCall: unknown[]): string {
  const strings = rawCall[0] as TemplateStringsArray;
  return strings.join('?');
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  groupByMock.mockReset();
  queryRawMock.mockReset();
  executeRawMock.mockReset();
});

describe('jobQueue.enqueue', () => {
  it('inserts a PENDING row with the given type + payload', async () => {
    createMock.mockResolvedValue(
      fakeJob({ type: 'CATEGORIZE_TRANSACTION', payload: { transactionId: 'tx_abc' } }),
    );

    const result = await jobQueue.enqueue({
      type: 'CATEGORIZE_TRANSACTION',
      payload: { transactionId: 'tx_abc' },
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.type).toBe('CATEGORIZE_TRANSACTION');
    expect(args.data.payload).toEqual({ transactionId: 'tx_abc' });
    // No explicit scheduledAt = let the DB default kick in.
    expect(args.data.scheduledAt).toBeUndefined();
    expect(result.type).toBe('CATEGORIZE_TRANSACTION');
  });

  it('honors an explicit scheduledAt (delayed job)', async () => {
    createMock.mockResolvedValue(fakeJob());
    const when = new Date('2026-05-21T12:00:00Z');

    await jobQueue.enqueue({
      type: 'DETECT_ANOMALY',
      payload: { transactionId: 'tx_xyz' },
      scheduledAt: when,
    });

    const args = createMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.scheduledAt).toBe(when);
  });
});

describe('jobQueue.claim', () => {
  it('emits SELECT ... FOR UPDATE SKIP LOCKED with the provided limit', async () => {
    queryRawMock.mockResolvedValue([fakeJob()]);

    await jobQueue.claim('worker-1', 5);

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const sql = readSql(queryRawMock.mock.calls[0] as unknown[]);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('status = \'PENDING\'::"JobStatus"');
    expect(sql).toContain('\'RUNNING\'::"JobStatus"');
    expect(sql).toContain('"lockedBy"');
    expect(sql).toContain('"lockedAt"');

    /*
     * Interpolated values follow the TemplateStringsArray. Order
     * matches the appearance order in the template: LIMIT first,
     * then lockedBy.
     */
    const call = queryRawMock.mock.calls[0] as unknown[];
    expect(call[1]).toBe(5);
    expect(call[2]).toBe('worker-1');
  });

  it('short-circuits with an empty array when limit <= 0 (no SQL emitted)', async () => {
    const result = await jobQueue.claim('worker-1', 0);
    expect(result).toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('returns the rows the DB returned', async () => {
    const rows = [fakeJob({ id: 'job_1' }), fakeJob({ id: 'job_2', type: 'DETECT_ANOMALY' })];
    queryRawMock.mockResolvedValue(rows);

    const result = await jobQueue.claim('worker-x', 10);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('job_1');
    expect(result[1]?.id).toBe('job_2');
  });
});

describe('jobQueue.markDone', () => {
  it('transitions to DONE and clears lock fields', async () => {
    updateMock.mockResolvedValue(fakeJob({ status: 'DONE' }));

    await jobQueue.markDone('job_test_id');

    expect(updateMock).toHaveBeenCalledTimes(1);
    const args = updateMock.mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(args.where.id).toBe('job_test_id');
    expect(args.data.status).toBe('DONE');
    expect(args.data.lockedAt).toBeNull();
    expect(args.data.lockedBy).toBeNull();
    expect(args.data.lastError).toBeNull();
  });
});

describe('jobQueue.markFailed', () => {
  it('emits an atomic UPDATE that bumps attempts and branches on MAX_ATTEMPTS', async () => {
    executeRawMock.mockResolvedValue(1);

    await jobQueue.markFailed('job_test_id', 'boom');

    expect(executeRawMock).toHaveBeenCalledTimes(1);
    const sql = readSql(executeRawMock.mock.calls[0] as unknown[]);

    // Atomic read-modify-write: attempts referenced in both arms of the CASE.
    expect(sql).toContain('attempts = attempts + 1');
    // Dead-letter arm: keep FAILED at MAX_ATTEMPTS.
    expect(sql).toContain('attempts + 1 >=');
    expect(sql).toContain('\'FAILED\'::"JobStatus"');
    expect(sql).toContain('\'PENDING\'::"JobStatus"');
    // Backoff: scheduledAt advances via integer * INTERVAL.
    expect(sql).toContain("INTERVAL '1 second'");
    // Lock fields cleared so a retry can be claimed by any worker.
    expect(sql).toContain('"lockedAt" = NULL');
    expect(sql).toContain('"lockedBy" = NULL');

    /*
     * Interpolated parameter order, per the template:
     *   1. trimmedError
     *   2. MAX_ATTEMPTS
     *   3. MAX_ATTEMPTS (second use)
     *   4. RETRY_DELAYS_SECONDS[0]
     *   5. RETRY_DELAYS_SECONDS[1]
     *   6. jobId
     */
    const call = executeRawMock.mock.calls[0] as unknown[];
    expect(call[1]).toBe('boom');
    expect(call[2]).toBe(MAX_ATTEMPTS);
    expect(call[3]).toBe(MAX_ATTEMPTS);
    expect(call[call.length - 1]).toBe('job_test_id');
  });

  it('truncates very long error messages so the row size stays bounded', async () => {
    executeRawMock.mockResolvedValue(1);
    const longError = 'x'.repeat(2000);

    await jobQueue.markFailed('job_test_id', longError);

    const trimmedError = (executeRawMock.mock.calls[0] as unknown[])[1] as string;
    expect(trimmedError.length).toBeLessThanOrEqual(500);
    expect(trimmedError.endsWith('…')).toBe(true);
  });
});

describe('jobQueue.countByStatus', () => {
  it('aggregates groupBy rows into a fixed-shape summary', async () => {
    groupByMock.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 12 } },
      { status: 'RUNNING', _count: { _all: 2 } },
      { status: 'DONE', _count: { _all: 134 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);

    const result = await jobQueue.countByStatus();
    expect(result).toEqual({ pending: 12, running: 2, done: 134, failed: 1 });
  });

  it('returns zeros when the table is empty (no groupBy rows)', async () => {
    groupByMock.mockResolvedValue([]);

    const result = await jobQueue.countByStatus();
    expect(result).toEqual({ pending: 0, running: 0, done: 0, failed: 0 });
  });
});
