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

vi.mock('@/lib/db/prisma', () => ({
  prismaUnscoped: {
    transaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prismaUnscoped } from '@/lib/db/prisma';
import { detectAnomalyHandler } from './detect-anomaly';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const findFirstMock = prismaUnscoped.transaction.findFirst as unknown as Mock;
const findManyMock = prismaUnscoped.transaction.findMany as unknown as Mock;
const updateMock = prismaUnscoped.transaction.update as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

const VALID_PAYLOAD = {
  transactionId: '019e4c88-ab95-74a2-87fb-d330bd90c236',
  profileId: '019e4c88-ab95-74a2-87fb-d330bd90c237',
};

function fakeTx(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: VALID_PAYLOAD.transactionId,
    type: 'EXPENSE',
    amount: 100,
    merchantName: 'Walmart',
    merchantNit: '2345678-9',
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  findFirstMock.mockReset();
  findManyMock.mockReset();
  updateMock.mockReset();
});

describe('detectAnomalyHandler', () => {
  it('throws on malformed payload', async () => {
    await expect(detectAnomalyHandler({ profileId: VALID_PAYLOAD.profileId })).rejects.toThrow();
  });

  it('no-ops when the transaction is missing (deleted between enqueue and handler)', async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(detectAnomalyHandler(VALID_PAYLOAD)).resolves.toBeUndefined();
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no-ops when the transaction already carries an anomaly.method (idempotency)', async () => {
    findFirstMock.mockResolvedValue(
      fakeTx({
        metadata: {
          anomaly: { method: 'merchant_zscore', zScore: 4.0, detectedAt: '2026-05-21T00:00:00Z' },
        },
      }),
    );
    await detectAnomalyHandler(VALID_PAYLOAD);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips non-EXPENSE rows (INCOME / TRANSFER) without querying history', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ type: 'INCOME' }));
    await detectAnomalyHandler(VALID_PAYLOAD);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns early when neither merchantNit nor merchantName is set', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ merchantName: null, merchantNit: null }));
    await detectAnomalyHandler(VALID_PAYLOAD);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('prefers merchantNit over merchantName when both are present', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ merchantNit: '2345678-9', merchantName: 'Walmart' }));
    findManyMock.mockResolvedValue([]);

    await detectAnomalyHandler(VALID_PAYLOAD);

    const findArgs = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({ merchantNit: '2345678-9' });
    expect(findArgs.where.merchantName).toBeUndefined();
  });

  it('falls back to merchantName when merchantNit is empty/whitespace', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ merchantNit: '   ', merchantName: 'Pollo Campero' }));
    findManyMock.mockResolvedValue([]);

    await detectAnomalyHandler(VALID_PAYLOAD);

    const findArgs = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({ merchantName: 'Pollo Campero' });
    expect(findArgs.where.merchantNit).toBeUndefined();
  });

  it('flags a new merchant when history is empty', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ amount: 100 }));
    findManyMock.mockResolvedValue([]);
    updateMock.mockResolvedValue({});

    await detectAnomalyHandler(VALID_PAYLOAD);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { metadata: { anomaly: { method: string; zScore: number; detectedAt: string } } };
    };
    expect(updateArgs.where.id).toBe(VALID_PAYLOAD.transactionId);
    expect(updateArgs.data.metadata.anomaly.method).toBe('new_merchant');
    expect(updateArgs.data.metadata.anomaly.zScore).toBe(0);
    expect(typeof updateArgs.data.metadata.anomaly.detectedAt).toBe('string');
  });

  it('writes merchant_zscore when the current amount is past ±3σ', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ amount: 500 }));
    // Tight history around 100 with stdDev = 1
    findManyMock.mockResolvedValue(
      [99, 99, 99, 99, 99, 101, 101, 101, 101, 101].map((amount) => ({ amount })),
    );
    updateMock.mockResolvedValue({});

    await detectAnomalyHandler(VALID_PAYLOAD);

    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      data: { metadata: { anomaly: { method: string; zScore: number } } };
    };
    expect(updateArgs.data.metadata.anomaly.method).toBe('merchant_zscore');
    expect(updateArgs.data.metadata.anomaly.zScore).toBeGreaterThan(3);
  });

  it('returns null (no update) when amount is within ±3σ of merchant history', async () => {
    findFirstMock.mockResolvedValue(fakeTx({ amount: 102 }));
    findManyMock.mockResolvedValue(
      [99, 99, 99, 99, 99, 101, 101, 101, 101, 101].map((amount) => ({ amount })),
    );

    await detectAnomalyHandler(VALID_PAYLOAD);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('preserves existing metadata siblings (e.g. possibleDuplicateOf) when writing the anomaly slice', async () => {
    findFirstMock.mockResolvedValue(
      fakeTx({
        amount: 999,
        metadata: { possibleDuplicateOf: 'tx_other_id', duplicateDismissed: true },
      }),
    );
    findManyMock.mockResolvedValue([]);
    updateMock.mockResolvedValue({});

    await detectAnomalyHandler(VALID_PAYLOAD);

    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(updateArgs.data.metadata.possibleDuplicateOf).toBe('tx_other_id');
    expect(updateArgs.data.metadata.duplicateDismissed).toBe(true);
    expect(updateArgs.data.metadata.anomaly).toBeDefined();
  });

  it('scopes both lookups (candidate + history) by profileId for cross-tenant safety', async () => {
    findFirstMock.mockResolvedValue(fakeTx());
    findManyMock.mockResolvedValue([]);

    await detectAnomalyHandler(VALID_PAYLOAD);

    const findFirstArgs = findFirstMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findFirstArgs.where.profileId).toBe(VALID_PAYLOAD.profileId);

    const findManyArgs = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findManyArgs.where.profileId).toBe(VALID_PAYLOAD.profileId);
    expect(findManyArgs.where.id).toEqual({ not: VALID_PAYLOAD.transactionId });
  });
});
