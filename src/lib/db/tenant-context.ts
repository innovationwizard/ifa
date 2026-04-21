import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Async-local tenant context.
 *
 * Every tenant-scoped DB query runs inside `withTenant(orgId, userId, fn)`.
 * The Prisma extension in `tenancy.ts` reads the current context and:
 *   - injects `where: { organizationId }` on reads/mutations
 *   - injects `organizationId` into `data` on creates
 *   - throws TenantContextMissingError if a tenant-scoped query runs
 *     without a context (fail-closed; never leaks across tenants)
 *
 * Non-tenant tables (User, Badge, Mission) bypass the middleware entirely.
 */

export interface TenantContext {
  organizationId: string;
  /** User performing the action; null for cron/system paths. */
  userId: string | null;
  /** Request IP for audit logging. Optional — absent on cron paths. */
  ipAddress?: string;
  /** Request user-agent for audit logging. Optional — absent on cron paths. */
  userAgent?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export class TenantContextMissingError extends Error {
  constructor(modelName: string, operation: string) {
    super(
      `Tenant context missing for ${modelName}.${operation}. ` +
        `Wrap the call with withTenant(orgId, userId, ...) or use an explicit ` +
        `unscoped client for global tables.`,
    );
    this.name = 'TenantContextMissingError';
  }
}

/**
 * Run `fn` inside a tenant context. All queries inside (or in async
 * tasks awaited inside) will see this organizationId and userId.
 *
 * Callback can be sync or async; the wrapper always returns a Promise so
 * callers have a uniform await point.
 */
export async function withTenant<T>(context: TenantContext, fn: () => T | Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/**
 * Read the current tenant context. Returns `undefined` when not inside
 * a `withTenant` scope. Prefer `requireTenant()` in tenant-scoped code
 * so a missing context fails loudly instead of silently skipping the
 * filter.
 */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenant(modelName: string, operation: string): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw new TenantContextMissingError(modelName, operation);
  return ctx;
}
