import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Async-local tenant context.
 *
 * Every tenant-scoped DB query runs inside `withTenant(orgId, userId, fn)`.
 * The Prisma extension in `tenancy.ts` reads the current context and:
 *   - injects `where: { profileId }` on reads/mutations
 *   - injects `profileId` into `data` on creates
 *   - throws TenantContextMissingError if a tenant-scoped query runs
 *     without a context (fail-closed; never leaks across tenants)
 *
 * Non-tenant tables (User, Badge, Mission) bypass the middleware entirely.
 */

export interface TenantContext {
  profileId: string;
  /** User performing the action; null for cron/system paths. */
  userId: string | null;
  /** Request IP for audit logging. Optional — absent on cron paths. */
  ipAddress?: string;
  /** Request user-agent for audit logging. Optional — absent on cron paths. */
  userAgent?: string;
}

/*
 * Cache the AsyncLocalStorage instance on globalThis so the Prisma
 * extension's `getTenantContext` closure (built from the FIRST
 * evaluation of this module) and `withTenant`'s `storage.run` (called
 * from later evaluations after HMR, or from a different webpack
 * layer) all read and write the SAME store. Without this, every
 * module re-evaluation creates a fresh ALS, the extension's captured
 * closure keeps pointing at the original, and every tenant-scoped
 * query throws TenantContextMissingError despite being inside a
 * `withTenant` call. In production the module evaluates once, so
 * this branch is a one-time globalThis read.
 */
const globalForStorage = globalThis as unknown as {
  __ifaTenantStorage?: AsyncLocalStorage<TenantContext>;
};
const storage = (globalForStorage.__ifaTenantStorage ??= new AsyncLocalStorage<TenantContext>());

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
 * tasks awaited inside) will see this profileId and userId.
 *
 * Callback can be sync or async; the wrapper always returns a Promise so
 * callers have a uniform await point.
 */
export async function withTenant<T>(context: TenantContext, fn: () => T | Promise<T>): Promise<T> {
  /*
   * Dev-only safety net: publish the most recent context on globalThis
   * as a fallback the tenancy extension can consult when AsyncLocalStorage
   * propagation breaks across Next.js dev's module re-evaluation /
   * webpack layer boundaries. Production paths never hit the fallback
   * because the extension only consults it when `NODE_ENV !== 'production'`.
   *
   * NOT safe under concurrent requests in production — see notes in
   * tenancy.ts. Dev workaround only until the underlying Next.js +
   * Prisma ALS interaction is properly understood.
   */
  if (process.env.NODE_ENV !== 'production') {
    (globalThis as unknown as { __ifaTenantCtx?: TenantContext }).__ifaTenantCtx = context;
  }
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
