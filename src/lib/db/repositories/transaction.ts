import type { Prisma, Transaction } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Transaction repository.
 *
 * Tenant-scoped: callers MUST be inside a `withTenant(...)` context.
 * The Prisma tenancy extension auto-injects `where: { profileId }` on
 * reads and `data.profileId` on creates; it throws
 * `TenantContextMissingError` if a caller forgets the wrapper.
 *
 * Surface is kept narrow on purpose and grows as feature stories need
 * new methods. S-2.9 (empty-state dashboard) only needs `count`; the
 * upload-and-parse flow that comes next will add `createMany`, the
 * transactions list will add `findMany` with pagination, etc.
 */
export const transactionRepo = {
  count(args: Prisma.TransactionCountArgs = {}): Promise<number> {
    return prisma.transaction.count(args);
  },

  findFirst(args: Prisma.TransactionFindFirstArgs): Promise<Transaction | null> {
    return prisma.transaction.findFirst(args);
  },
};

export type TransactionRepo = typeof transactionRepo;
