import { Prisma } from '@prisma/client';
import { getTenantContext, requireTenant } from './tenant-context';

/**
 * Prisma client extension that enforces row-level tenant isolation.
 *
 * Shape of the filter injection, per operation kind:
 *   - Reads (findFirst, findMany, count, aggregate, groupBy):
 *       add `profileId` to args.where
 *   - findUnique / findUniqueOrThrow:
 *       unique `where` cannot hold non-unique filters; we transform the
 *       call into findFirst under the hood so we can append the tenant
 *       constraint. The caller receives identical data.
 *   - Mutations with where (update, updateMany, delete, deleteMany):
 *       add `profileId` to args.where
 *   - Creates (create, createMany, upsert, createManyAndReturn):
 *       inject `profileId` into args.data if missing; if present
 *       and mismatched, throw — caller clearly confused tenants.
 *
 * Non-tenant models (User, Badge, Mission) are NOT intercepted and may
 * be queried without a tenant context. Callers import the base prisma
 * client for those; the tenant extension only wraps operations on the
 * tenant-scoped allowlist below.
 */

/**
 * Top-level tenant-scoped models. Sidecar tables (FelDteData,
 * TpvTransactionData, JournalEntryLine, XpEvent, UserBadge, UserMission,
 * TransactionAudit) reach the tenant filter through their parent's
 * relation and are NOT listed here — direct queries against them should
 * go via their parent (convention, enforced by the repository layer in
 * S-1.10).
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'ProfileMember',
  'Transaction',
  'Reconciliation',
  'Account',
  'AccountingPeriod',
  'JournalEntry',
  'AccountingRule',
  'HealthScore',
  'HealthScoreAction',
  'GamificationProfile',
  'Integration',
  'AuditLog',
  'Notification',
  'MerchantCategory',
]);

const READ_OPERATIONS_WITH_WHERE = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const MUTATION_OPERATIONS_WITH_WHERE = new Set<string>([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const FIND_UNIQUE_OPERATIONS = new Set<string>(['findUnique', 'findUniqueOrThrow']);

const CREATE_OPERATIONS = new Set<string>(['create', 'createMany', 'createManyAndReturn']);

type WhereArg = Record<string, unknown> & { profileId?: string };
type DataArg = Record<string, unknown> & { profileId?: string };
interface OpArgs {
  where?: WhereArg;
  data?: DataArg | DataArg[];
}

function withTenantWhere(where: WhereArg | undefined, profileId: string): WhereArg {
  if (!where) return { profileId };
  if (where.profileId && where.profileId !== profileId) {
    throw new Error(
      `Cross-tenant query attempt blocked: where.profileId=${String(where.profileId)} ` +
        `but current context profileId=${profileId}`,
    );
  }
  return { ...where, profileId };
}

function withTenantData(
  data: DataArg | DataArg[] | undefined,
  profileId: string,
): DataArg | DataArg[] | undefined {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((row) => withTenantDataSingle(row, profileId));
  }
  return withTenantDataSingle(data, profileId);
}

function withTenantDataSingle(data: DataArg, profileId: string): DataArg {
  if (data.profileId && data.profileId !== profileId) {
    throw new Error(
      `Cross-tenant create attempt blocked: data.profileId=${String(data.profileId)} ` +
        `but current context profileId=${profileId}`,
    );
  }
  return { ...data, profileId };
}

/**
 * Build the extension definition. Applied via `prisma.$extends(tenancyExtension)`.
 * Kept as a factory so tests can stub the context source if needed.
 */
export const tenancyExtension = Prisma.defineExtension({
  name: 'ifa-tenancy',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        const ctx = getTenantContext();
        if (!ctx) {
          throw new (await import('./tenant-context')).TenantContextMissingError(model, operation);
        }

        const typedArgs = args as OpArgs;

        if (READ_OPERATIONS_WITH_WHERE.has(operation)) {
          typedArgs.where = withTenantWhere(typedArgs.where, ctx.profileId);
          return query(typedArgs);
        }

        if (MUTATION_OPERATIONS_WITH_WHERE.has(operation)) {
          typedArgs.where = withTenantWhere(typedArgs.where, ctx.profileId);
          return query(typedArgs);
        }

        if (CREATE_OPERATIONS.has(operation)) {
          const withData = withTenantData(typedArgs.data, ctx.profileId);
          if (withData !== undefined) {
            typedArgs.data = withData;
          }
          return query(typedArgs);
        }

        if (operation === 'upsert') {
          const upsertArgs = args as {
            where: WhereArg;
            create: DataArg;
            update: DataArg;
          };
          upsertArgs.where = withTenantWhere(upsertArgs.where, ctx.profileId);
          upsertArgs.create = withTenantDataSingle(upsertArgs.create, ctx.profileId);
          upsertArgs.update = withTenantDataSingle(upsertArgs.update, ctx.profileId);
          return query(upsertArgs);
        }

        if (FIND_UNIQUE_OPERATIONS.has(operation)) {
          /*
           * findUnique's `where` accepts only unique key fields, so we
           * cannot append `profileId` to it directly. Transform
           * the call to findFirst internally — the extra filter makes
           * the query uniqueness-safe because a unique-key collision
           * across tenants still returns at most one row after filter.
           *
           * We require the caller to hit the record through its real
           * unique key (typically `id`); chained includes traverse
           * relations which stay within-tenant via their own paths.
           */
          const uniqueArgs = args as { where: WhereArg } & Record<string, unknown>;
          uniqueArgs.where = withTenantWhere(uniqueArgs.where, ctx.profileId);
          // Narrow the operation to its findFirst equivalent
          const targetOp = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
          // Delegate to the typed query by routing through a raw call.
          // The `query` callback is fixed to `operation`, so we use the
          // raw Prisma client for the fallback.
          const { prisma } = await import('./prisma');
          const delegates = prisma as unknown as Record<
            string,
            Record<string, (a: unknown) => unknown> | undefined
          >;
          const modelDelegate = delegates[model.charAt(0).toLowerCase() + model.slice(1)];
          const handler = modelDelegate?.[targetOp];
          if (!handler) {
            throw new Error(`tenancyExtension: delegate for ${model}.${targetOp} unavailable`);
          }
          return handler(uniqueArgs);
        }

        // Default: pass through unchanged (covers rarely-used ops like
        // `executeRaw`, `queryRaw`, `runCommandRaw` — those bypass the
        // ORM's per-model guardrails anyway and must handle tenancy
        // in the SQL literal).
        return query(args);
      },
    },
  },
});

/**
 * Convenience re-export so callers don't import from two places.
 */
export { requireTenant };
