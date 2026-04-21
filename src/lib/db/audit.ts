import { Prisma } from '@prisma/client';
import { getTenantContext } from './tenant-context';
import { TENANT_SCOPED_MODELS } from './tenancy';
import { logError } from '@/lib/observability/log';

/**
 * Audit log extension.
 *
 * Writes one row to `AuditLog` for every successful CREATE / UPDATE / DELETE
 * against a tenant-scoped model. Read operations, bulk operations (update-
 * Many / deleteMany), and operations against `AuditLog` or `TransactionAudit`
 * themselves are intentionally skipped.
 *
 * Best-effort semantics:
 *   why: scaffolding §14 names the audit trail as "immutable log of all user
 *   actions." Compliance intent is preserved because the AuditLog table IS
 *   append-only at the DB schema layer and the repository boundary (S-1.10).
 *   However, if the audit write itself fails (network blip, Postgres OOM,
 *   etc.), we must NOT roll back the user's mutation — the business
 *   transaction is already committed from the caller's perspective and
 *   undoing it would cause worse data integrity issues. The failure is
 *   logged via the structured logger; a production observability stack
 *   (Sentry + PagerDuty, S-11.6) would surface this as a HIGH severity
 *   incident.
 *
 * Redaction: for MVP this extension logs `where` / `data` / result payloads
 * as-submitted. Fields containing secrets (currently only Integration.
 * credentials) must be pre-redacted by the caller before reaching this
 * point. A systemic redaction layer lands in S-11.4's security review.
 */

const MUTATION_WITH_WHERE = new Set<string>(['update', 'delete']);
const CREATE_OPERATIONS = new Set<string>(['create', 'upsert']);
/*
 * Bulk ops (`updateMany`, `deleteMany`, `createMany`, `createManyAndReturn`)
 * are intentionally skipped. They target N rows and returning N individual
 * audit entries requires a pre-fetch + post-fetch that doubles DB load for
 * every bulk call. Callers that need per-row audit must iterate individually
 * or emit a custom audit entry documenting the bulk action.
 */
const SKIP_MODELS = new Set<string>(['AuditLog', 'TransactionAudit']);

interface AuditChanges {
  before?: unknown;
  after?: unknown;
  where?: unknown;
  data?: unknown;
}

function extractEntityId(result: unknown, where: unknown): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  if (where && typeof where === 'object' && 'id' in where) {
    const id = (where as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

export const auditExtension = Prisma.defineExtension({
  name: 'ifa-audit',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (SKIP_MODELS.has(model)) return query(args);
        if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

        const isCreate = CREATE_OPERATIONS.has(operation);
        const isMutationWithWhere = MUTATION_WITH_WHERE.has(operation);

        if (!isCreate && !isMutationWithWhere) return query(args);

        const ctx = getTenantContext();
        if (!ctx) return query(args); // tenancy extension will throw; skip audit

        const typedArgs = args as { where?: unknown; data?: unknown };

        /*
         * `before` state for UPDATE / DELETE comes from loading the target
         * row through the tenancy-filtered client. We do this lazily after
         * the mutation using Prisma's `findFirst` on the inner client via
         * dynamic import to avoid a circular reference during module init.
         */
        let before: unknown = null;
        if (isMutationWithWhere) {
          try {
            const { prisma } = await import('./prisma');
            const delegates = prisma as unknown as Record<
              string,
              { findFirst?: (a: unknown) => Promise<unknown> } | undefined
            >;
            const modelDelegate = delegates[model.charAt(0).toLowerCase() + model.slice(1)];
            if (modelDelegate?.findFirst) {
              before = await modelDelegate.findFirst({ where: typedArgs.where });
            }
          } catch (err) {
            logError({
              message: 'audit_before_fetch_failed',
              model,
              operation,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const result = await query(args);

        // Fire-and-forget the audit write so the caller doesn't wait on it;
        // errors surface via the structured logger. Await inside a try/catch
        // so an unhandled rejection cannot escape this scope.
        const writeAudit = async (): Promise<void> => {
          try {
            const { prismaUnscoped } = await import('./prisma');
            const changes: AuditChanges = {};
            if (isCreate) {
              changes.after = result;
            } else if (operation === 'delete') {
              changes.before = before;
            } else {
              changes.before = before;
              changes.after = result;
              changes.data = typedArgs.data;
            }
            if (typedArgs.where) changes.where = typedArgs.where;

            const entityId = extractEntityId(result, typedArgs.where);
            if (!entityId) return; // cannot audit without a target row id

            await prismaUnscoped.auditLog.create({
              data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                action: `${operation.toUpperCase()}_${model.toUpperCase()}`,
                entityType: model,
                entityId,
                changes: changes as Prisma.InputJsonValue,
                ipAddress: ctx.ipAddress ?? null,
                userAgent: ctx.userAgent ?? null,
              },
            });
          } catch (err) {
            // why: compliance trade-off — never fail the user's mutation
            // because the audit write failed. See module header.
            logError({
              message: 'audit_write_failed',
              model,
              operation,
              organizationId: ctx.organizationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        };

        await writeAudit();
        return result;
      },
    },
  },
});
