import { PrismaClient } from '@prisma/client';
import { tenancyExtension } from './tenancy';
import { auditExtension } from './audit';

/**
 * Prisma singleton.
 *
 * Two exports:
 *   - `prisma`         → tenant-aware + audit-emitting client. Every
 *                        tenant-scoped query requires a surrounding
 *                        `withTenant(...)` context. Use this for ALL
 *                        request-path and job code.
 *   - `prismaUnscoped` → raw client without extensions. Only for global
 *                        tables (User, Badge, Mission seed operations),
 *                        migrations, and health checks. Consumers are
 *                        audited in code review.
 *
 * Why the global cache: Next.js hot reload in dev re-imports modules and
 * would otherwise spawn a new PrismaClient on every change, exhausting
 * the Supabase pooler's per-IP connection budget within a few edits.
 * In production the module is imported once per cold start, so the
 * global fallback is a no-op there.
 *
 * Why a factory for `prisma`: `$extends` returns a generic type whose
 * model delegates appear as `unknown` to callers if we annotate the
 * export manually. Letting TypeScript infer through a factory function
 * propagates the composed extension type end-to-end so repositories
 * get proper model delegate types (`prisma.auditLog.create(...)`).
 *
 * Extension order (outer → inner): audit → tenancy → base.
 * Audit runs first, fetches the pre-image through the tenancy-filtered
 * client, then delegates the mutation which passes through tenancy and
 * finally the DB. If the order were inverted the tenancy filter would
 * not guard the pre-image fetch.
 *
 * Logging: query-level logs in development only; production logs just
 * errors and warnings to avoid leaking query shapes into request logs.
 */

function createPrismaUnscoped(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });
}

function createPrisma(base: PrismaClient) {
  return base.$extends(tenancyExtension).$extends(auditExtension);
}

type Prisma = ReturnType<typeof createPrisma>;

const globalForPrisma = globalThis as unknown as {
  prismaUnscoped?: PrismaClient;
  prisma?: Prisma;
};

export const prismaUnscoped = globalForPrisma.prismaUnscoped ?? createPrismaUnscoped();

export const prisma: Prisma = globalForPrisma.prisma ?? createPrisma(prismaUnscoped);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaUnscoped = prismaUnscoped;
  globalForPrisma.prisma = prisma;
}
