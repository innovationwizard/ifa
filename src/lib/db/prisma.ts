import { PrismaClient } from '@prisma/client';
import { tenancyExtension } from './tenancy';

/**
 * Prisma singleton.
 *
 * Two exports:
 *   - `prisma`         → tenant-aware client. Every tenant-scoped query
 *                        requires a surrounding `withTenant(...)` context.
 *                        Use this for ALL request-path and job code.
 *   - `prismaUnscoped` → raw client without the tenancy extension. Only
 *                        for global tables (User, Badge, Mission seed
 *                        operations), migrations, and health checks.
 *                        Consumers should be audited in code review.
 *
 * Why the global cache: Next.js hot reload in dev re-imports modules and
 * would otherwise spawn a new PrismaClient on every change, exhausting
 * the Supabase pooler's per-IP connection budget within a few edits.
 * In production the module is imported once per cold start, so the
 * global fallback is a no-op there.
 *
 * Logging: query-level logs in development only; production logs just
 * errors and warnings to avoid leaking query shapes into request-path logs.
 */

type ExtendedPrisma = ReturnType<PrismaClient['$extends']>;

const globalForPrisma = globalThis as unknown as {
  prismaUnscoped?: PrismaClient;
  prisma?: ExtendedPrisma;
};

export const prismaUnscoped =
  globalForPrisma.prismaUnscoped ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

export const prisma: ExtendedPrisma =
  globalForPrisma.prisma ?? prismaUnscoped.$extends(tenancyExtension);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaUnscoped = prismaUnscoped;
  globalForPrisma.prisma = prisma;
}
