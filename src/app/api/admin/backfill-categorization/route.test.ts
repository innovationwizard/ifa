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

vi.mock('@/lib/db/prisma', () => ({
  prismaUnscoped: {
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/jobs/queue', () => ({
  jobQueue: {
    enqueueMany: vi.fn(),
  },
}));

import { prismaUnscoped } from '@/lib/db/prisma';
import { jobQueue } from '@/lib/jobs/queue';
import { POST } from './route';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const findManyMock = prismaUnscoped.transaction.findMany as unknown as Mock;
const enqueueManyMock = jobQueue.enqueueMany as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function makeRequest(opts: { authorization?: string; confirm?: string }): NextRequest {
  const url = new URL('http://localhost/api/admin/backfill-categorization');
  if (opts.confirm !== undefined) url.searchParams.set('confirm', opts.confirm);
  const headers: Record<string, string> = {};
  if (opts.authorization !== undefined) headers.authorization = opts.authorization;
  return new NextRequest(url, { method: 'POST', headers });
}

beforeEach(() => {
  findManyMock.mockReset();
  enqueueManyMock.mockReset();
  delete process.env.CRON_SECRET;
});

describe('POST /api/admin/backfill-categorization — auth', () => {
  it('returns 401 when CRON_SECRET is unset (fail-closed)', async () => {
    const res = await POST(makeRequest({ authorization: 'Bearer anything', confirm: 'yes' }));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns 401 without an Authorization header', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await POST(makeRequest({ confirm: 'yes' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the bearer token is wrong', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await POST(makeRequest({ authorization: 'Bearer wrong-token', confirm: 'yes' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/backfill-categorization — confirm guard', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret';
  });

  it('returns 400 confirm_required when ?confirm is missing', async () => {
    const res = await POST(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('confirm_required');
    expect(findManyMock).not.toHaveBeenCalled();
    expect(enqueueManyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ?confirm is set to anything other than "yes"', async () => {
    const res = await POST(makeRequest({ authorization: 'Bearer super-secret', confirm: 'true' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/backfill-categorization — happy path', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret';
  });

  it('enqueues one CATEGORIZE_TRANSACTION job per uncategorized row across all tenants', async () => {
    findManyMock.mockResolvedValue([
      { id: 'tx_1', profileId: 'profile_A' },
      { id: 'tx_2', profileId: 'profile_A' },
      { id: 'tx_3', profileId: 'profile_B' },
    ]);
    enqueueManyMock.mockResolvedValue({ inserted: 3 });

    const res = await POST(makeRequest({ authorization: 'Bearer super-secret', confirm: 'yes' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scanned: number;
      enqueued: number;
      durationMs: number;
    };
    expect(body.scanned).toBe(3);
    expect(body.enqueued).toBe(3);
    expect(typeof body.durationMs).toBe('number');

    // Scan condition: `category IS NULL` only.
    const findArgs = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findArgs.where).toEqual({ category: null });

    // Each enqueued job carries (transactionId, profileId).
    expect(enqueueManyMock).toHaveBeenCalledTimes(1);
    const enqueueArgs = enqueueManyMock.mock.calls[0]?.[0] as {
      type: string;
      payload: { transactionId: string; profileId: string };
    }[];
    expect(enqueueArgs).toHaveLength(3);
    expect(enqueueArgs[0]?.type).toBe('CATEGORIZE_TRANSACTION');
    expect(enqueueArgs[0]?.payload).toEqual({ transactionId: 'tx_1', profileId: 'profile_A' });
    expect(enqueueArgs[2]?.payload).toEqual({ transactionId: 'tx_3', profileId: 'profile_B' });
  });

  it('returns scanned=0 and enqueued=0 when no rows need categorization', async () => {
    findManyMock.mockResolvedValue([]);
    enqueueManyMock.mockResolvedValue({ inserted: 0 });

    const res = await POST(makeRequest({ authorization: 'Bearer super-secret', confirm: 'yes' }));
    const body = (await res.json()) as { scanned: number; enqueued: number };
    expect(body.scanned).toBe(0);
    expect(body.enqueued).toBe(0);
  });
});
