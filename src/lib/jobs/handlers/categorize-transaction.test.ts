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
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ai/categorization', () => ({
  categorizeMerchant: vi.fn(),
}));

import { prismaUnscoped } from '@/lib/db/prisma';
import { categorizeMerchant } from '@/lib/ai/categorization';
import { categorizeTransactionHandler } from './categorize-transaction';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const findFirstMock = prismaUnscoped.transaction.findFirst as unknown as Mock;
const updateMock = prismaUnscoped.transaction.update as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */
const categorizeMock = categorizeMerchant as unknown as Mock;

const VALID_PAYLOAD = {
  transactionId: '019e4c88-ab95-74a2-87fb-d330bd90c236',
  profileId: '019e4c88-ab95-74a2-87fb-d330bd90c237',
};

beforeEach(() => {
  findFirstMock.mockReset();
  updateMock.mockReset();
  categorizeMock.mockReset();
});

describe('categorizeTransactionHandler', () => {
  it('throws on malformed payload (missing transactionId)', async () => {
    await expect(
      categorizeTransactionHandler({ profileId: VALID_PAYLOAD.profileId }),
    ).rejects.toThrow();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('throws on malformed payload (non-uuid profileId)', async () => {
    await expect(
      categorizeTransactionHandler({
        transactionId: VALID_PAYLOAD.transactionId,
        profileId: 'not-a-uuid',
      }),
    ).rejects.toThrow();
  });

  it('no-ops when the transaction is missing (deleted between enqueue and handler)', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(categorizeTransactionHandler(VALID_PAYLOAD)).resolves.toBeUndefined();
    expect(categorizeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no-ops when the transaction already has a category (idempotency)', async () => {
    findFirstMock.mockResolvedValue({
      id: VALID_PAYLOAD.transactionId,
      category: 'Alimentación',
      merchantName: 'Walmart',
      merchantNit: null,
    });

    await expect(categorizeTransactionHandler(VALID_PAYLOAD)).resolves.toBeUndefined();
    expect(categorizeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('writes category + aiCategoryConfidence on successful categorization', async () => {
    findFirstMock.mockResolvedValue({
      id: VALID_PAYLOAD.transactionId,
      category: null,
      merchantName: 'Pollo Campero',
      merchantNit: '8901234-5',
    });
    categorizeMock.mockResolvedValue({ category: 'Restaurantes', confidence: 0.91 });
    updateMock.mockResolvedValue({});

    await categorizeTransactionHandler(VALID_PAYLOAD);

    expect(categorizeMock).toHaveBeenCalledTimes(1);
    expect(categorizeMock).toHaveBeenCalledWith(VALID_PAYLOAD.profileId, {
      merchantName: 'Pollo Campero',
      merchantNit: '8901234-5',
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { category: string; aiCategoryConfidence: number | null };
    };
    expect(updateArgs.where.id).toBe(VALID_PAYLOAD.transactionId);
    expect(updateArgs.data.category).toBe('Restaurantes');
    expect(updateArgs.data.aiCategoryConfidence).toBe(0.91);
  });

  it('propagates the AI confidence even when null (USER override row)', async () => {
    findFirstMock.mockResolvedValue({
      id: VALID_PAYLOAD.transactionId,
      category: null,
      merchantName: 'Walmart',
      merchantNit: null,
    });
    categorizeMock.mockResolvedValue({ category: 'Alimentación', confidence: null });
    updateMock.mockResolvedValue({});

    await categorizeTransactionHandler(VALID_PAYLOAD);

    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      data: { aiCategoryConfidence: number | null };
    };
    expect(updateArgs.data.aiCategoryConfidence).toBeNull();
  });

  it('throws (does NOT write) when categorizeMerchant returns null', async () => {
    findFirstMock.mockResolvedValue({
      id: VALID_PAYLOAD.transactionId,
      category: null,
      merchantName: 'Mystery Vendor',
      merchantNit: null,
    });
    categorizeMock.mockResolvedValue(null);

    await expect(categorizeTransactionHandler(VALID_PAYLOAD)).rejects.toThrow(
      /returned null for transaction/,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('scopes the findFirst by both transactionId AND profileId (cross-tenant safety)', async () => {
    findFirstMock.mockResolvedValue(null);
    await categorizeTransactionHandler(VALID_PAYLOAD);

    const where = (findFirstMock.mock.calls[0]?.[0] as { where: Record<string, string> }).where;
    expect(where.id).toBe(VALID_PAYLOAD.transactionId);
    expect(where.profileId).toBe(VALID_PAYLOAD.profileId);
  });
});
