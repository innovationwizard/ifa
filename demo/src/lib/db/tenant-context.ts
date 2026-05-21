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
 * Resolve the AsyncLocalStorage instance from globalThis on every
 * call (not once at module load). Next.js + Turbopack dev mode can
 * evaluate the same source file under multiple module IDs — one for
 * the Prisma extension closure built in `tenancy.ts`, a different one
 * for `withTenant`'s call site reached via the `@/lib/db/...` alias.
 * Capturing `storage` in a top-level `const` lets the two modules
 * end up with different ALS instances; reading globalThis every time
 * guarantees they share one. In production all imports resolve to
 * the same module, so this is a single property read.
 */
function getStorage(): AsyncLocalStorage<TenantContext> {
  const g = globalThis as unknown as {
    __ifaTenantStorage?: AsyncLocalStorage<TenantContext>;
  };
  if (!g.__ifaTenantStorage) {
    g.__ifaTenantStorage = new AsyncLocalStorage<TenantContext>();
  }
  return g.__ifaTenantStorage;
}

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
   * Dev-only side-effect: publish the profileId on globalThis as a
   * synchronous fall-open hook for the tenancy extension. The
   * Turbopack module-dual-load bug intermittently empties the
   * AsyncLocalStorage store between this `run()` and the
   * extension's `getStore()` read; the global lets the extension
   * recover instead of throwing. Production is fail-closed
   * regardless — the extension only consults the global in non-prod.
   */
  if (process.env.NODE_ENV !== 'production') {
    (globalThis as unknown as { __ifaDemoProfileId?: string }).__ifaDemoProfileId =
      context.profileId;
  }
  return getStorage().run(context, fn);
}

/**
 * Read the current tenant context. Returns `undefined` when not inside
 * a `withTenant` scope. Prefer `requireTenant()` in tenant-scoped code
 * so a missing context fails loudly instead of silently skipping the
 * filter.
 */
export function getTenantContext(): TenantContext | undefined {
  return getStorage().getStore();
}

export function requireTenant(modelName: string, operation: string): TenantContext {
  const ctx = getStorage().getStore();
  if (!ctx) throw new TenantContextMissingError(modelName, operation);
  return ctx;
}
