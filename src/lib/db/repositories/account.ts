import type { Account, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Account repository — chart of accounts CRUD.
 *
 * The wider surface (vs. auditLogRepo) reflects normal CRUD needs:
 * accounts are created, renamed, reparented, and deactivated. `delete`
 * is intentionally NOT exposed — scaffolding §7.3 and S-5.1 require
 * that system accounts stay protected and user accounts be deactivated
 * (`isActive = false`) rather than hard-deleted to preserve the
 * historical journal trail.
 */
export const accountRepo = {
  create(data: Prisma.AccountUncheckedCreateInput): Promise<Account> {
    return prisma.account.create({ data });
  },

  createMany(args: Prisma.AccountCreateManyArgs): Promise<Prisma.BatchPayload> {
    return prisma.account.createMany(args);
  },

  findFirst(args: Prisma.AccountFindFirstArgs): Promise<Account | null> {
    return prisma.account.findFirst(args);
  },

  findMany(args: Prisma.AccountFindManyArgs = {}): Promise<Account[]> {
    return prisma.account.findMany(args);
  },

  update(args: Prisma.AccountUpdateArgs): Promise<Account> {
    return prisma.account.update(args);
  },

  count(args: Prisma.AccountCountArgs = {}): Promise<number> {
    return prisma.account.count(args);
  },
};

export type AccountRepo = typeof accountRepo;
