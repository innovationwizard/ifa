import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * AuditLog repository — intentionally narrow.
 *
 * why: scaffolding §14 mandates an "immutable log of all user actions."
 * The DB has no schema-level mutation lock on the table (Postgres would
 * let a superuser UPDATE/DELETE), so immutability is enforced at the
 * repository boundary: this module exposes only `create`, `findFirst`,
 * and `findMany`. No `update`, `updateMany`, `delete`, `deleteMany`.
 *
 * The ESLint `no-restricted-imports` rule in eslint.config.mjs prevents
 * app code from reaching `@/lib/db/prisma` directly to bypass this
 * constraint. Any future need to edit audit rows (e.g., redaction for
 * compliance response) requires a new explicit method here that
 * documents its reason and is reviewed on merge.
 */

export const auditLogRepo = {
  create(data: Prisma.AuditLogUncheckedCreateInput): Promise<AuditLog> {
    return prisma.auditLog.create({ data });
  },

  findFirst(args: Prisma.AuditLogFindFirstArgs): Promise<AuditLog | null> {
    return prisma.auditLog.findFirst(args);
  },

  findMany(args: Prisma.AuditLogFindManyArgs = {}): Promise<AuditLog[]> {
    return prisma.auditLog.findMany(args);
  },

  count(args: Prisma.AuditLogCountArgs = {}): Promise<number> {
    return prisma.auditLog.count(args);
  },
};

export type AuditLogRepo = typeof auditLogRepo;
