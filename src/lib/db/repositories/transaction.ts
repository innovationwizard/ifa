import type {
  ReconciliationStatus,
  Transaction,
  TransactionSource,
  TransactionType,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireTenant } from '../tenant-context';

/**
 * Transaction repository.
 *
 * Tenant-scoped: callers MUST be inside a `withTenant(...)` context.
 * The Prisma tenancy extension auto-injects `where: { profileId }` on
 * reads and `data.profileId` on creates; it throws
 * `TenantContextMissingError` if a caller forgets the wrapper.
 *
 * Surface grows as feature stories need new methods. S-2.9 added
 * `count`; S-3.1 adds `list` (cursor-paginated, filter-capable). The
 * upload-and-parse and detail stories add `createMany` / `findUnique`.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CreateManualInput {
  amount: Prisma.Decimal | number | string;
  date: Date;
  type: TransactionType;
  description: string;
  currency?: string;
  merchantName?: string;
  merchantNit?: string;
  category?: string;
  /** Optional idempotency key — stashed in `externalId` as `idem:<key>`. */
  idempotencyKey?: string;
  /** User id performing the creation (goes into the TransactionAudit row). */
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateManualResult {
  /** `true` on fresh insert, `false` when an idempotency-key replay found an existing row. */
  created: boolean;
  transaction: Transaction;
}

/** Row shape consumed by `transactionRepo.createManyFromImport`. */
export interface ImportRow {
  externalId: string;
  type: TransactionType;
  amount: Prisma.Decimal | number | string;
  currency: string;
  date: Date;
  description: string;
  merchantNit?: string;
  /**
   * Optional JSONB payload written as-is to `Transaction.metadata`.
   * Populated by the runner with `{ possibleDuplicateOf: ... }` when
   * duplicate detection flags the row (S-3.11).
   */
  metadata?: Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export interface TransactionListCursor {
  /** Last row's id (UUIDv7). */
  id: string;
  /** Last row's date — `@db.Date` column, so time-of-day is zeroed. */
  date: Date;
}

export interface TransactionListFilters {
  source?: TransactionSource;
  reconciliationStatus?: ReconciliationStatus;
  dateFrom?: Date;
  dateTo?: Date;
  /** Accepts any Prisma-Decimal-compatible value (number, string, Decimal). */
  amountMin?: Prisma.Decimal | number | string;
  amountMax?: Prisma.Decimal | number | string;
  merchantNit?: string;
  /** Free-text search against `description`. Case-insensitive ILIKE. */
  q?: string;
}

export interface TransactionListArgs {
  cursor?: TransactionListCursor | null;
  limit?: number;
  filters?: TransactionListFilters;
}

export interface TransactionListResult {
  data: Transaction[];
  nextCursor: TransactionListCursor | null;
  hasMore: boolean;
}

/**
 * Include shape used by `transactionRepo.findDetailById`. Exported so
 * callers (route handlers, UI components) can spell the return type.
 */
export const TRANSACTION_DETAIL_INCLUDE = {
  felData: true,
  tpvData: true,
  felReconciliation: {
    include: {
      tpvTransaction: { include: { tpvData: true } },
    },
  },
  tpvReconciliation: {
    include: {
      felTransaction: { include: { felData: true } },
    },
  },
} as const satisfies Prisma.TransactionInclude;

export type TransactionDetail = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_DETAIL_INCLUDE;
}>;

export const transactionRepo = {
  count(args: Prisma.TransactionCountArgs = {}): Promise<number> {
    return prisma.transaction.count(args);
  },

  findFirst(args: Prisma.TransactionFindFirstArgs): Promise<Transaction | null> {
    return prisma.transaction.findFirst(args);
  },

  /**
   * Fetch a single transaction by id, with FEL/TPV sidecars and both
   * reconciliation sides (including the matched counterparty's own
   * sidecar) eagerly loaded.
   *
   * Returns `null` when either the row does not exist OR it belongs to
   * a different tenant — the tenancy extension injects
   * `where: { profileId }` automatically, so a foreign-tenant id and
   * a non-existent id produce the same null result. Routes should map
   * both cases to 404 without attempting to distinguish (no
   * enumeration).
   */
  findDetailById(id: string): Promise<TransactionDetail | null> {
    return prisma.transaction.findFirst({
      where: { id },
      include: TRANSACTION_DETAIL_INCLUDE,
    });
  },

  /**
   * Journal entries whose lines reference the given transaction. Goes
   * through `JournalEntry` (tenant-scoped) — the tenancy extension
   * applies the `profileId` filter automatically, so cross-tenant
   * leakage isn't possible even if `transactionId` collided across
   * tenants (which it can't under UUIDv7 anyway).
   */
  listRelatedJournalEntries(transactionId: string) {
    return prisma.journalEntry.findMany({
      where: { lines: { some: { transactionId } } },
      include: {
        lines: {
          where: { transactionId },
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  },

  /**
   * Audit trail for a single transaction. `TransactionAudit` has no
   * `profileId` column and is therefore NOT in TENANT_SCOPED_MODELS —
   * it relies on the upstream Transaction fetch being tenant-verified
   * before this method is called. Callers MUST call `findDetailById`
   * first and only proceed to this method on a non-null result.
   */
  listAuditById(transactionId: string) {
    return prisma.transactionAudit.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Single-row duplicate lookup (S-3.11). Returns the id of a
   * candidate transaction with the same (date, amount, description)
   * within the ±90d window, or null if none.
   *
   * Excludes the incoming row's own id so a re-run after insert
   * doesn't flag the just-created row against itself.
   */
  async findDuplicateCandidate(args: {
    date: Date;
    amount: Prisma.Decimal | number | string;
    description: string;
    excludeId?: string;
    windowDays?: number;
  }): Promise<{ id: string } | null> {
    const days = args.windowDays ?? 90;
    const gte = new Date(
      Date.UTC(args.date.getUTCFullYear(), args.date.getUTCMonth(), args.date.getUTCDate() - days),
    );
    const lte = new Date(
      Date.UTC(args.date.getUTCFullYear(), args.date.getUTCMonth(), args.date.getUTCDate() + days),
    );
    return prisma.transaction.findFirst({
      where: {
        date: { gte, lte },
        amount: args.amount,
        description: args.description,
        ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
      },
      select: { id: true },
      orderBy: { date: 'asc' },
    });
  },

  /**
   * Batch-lookup variant used by the CSV import path (S-3.6). Pulls
   * all candidate rows in the widest date window spanning the batch
   * and returns their minimal (id, date, amount, description) so the
   * caller can build an in-memory triplet index. One query instead of
   * N — keeps the <50ms / per row acceptance criterion intact even
   * at 500-row batches.
   */
  findDuplicateCandidatesInRange(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{ id: string; date: Date; amount: Prisma.Decimal; description: string }[]> {
    return prisma.transaction.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
      select: { id: true, date: true, amount: true, description: true },
    });
  },

  /**
   * Flip `metadata.duplicateDismissed = true` on a row the user has
   * acknowledged. Preserves any other metadata keys the row already
   * carries (FEL raw payload echoes, import key, etc.).
   */
  async markDuplicateDismissed(transactionId: string): Promise<void> {
    const row = await prisma.transaction.findFirst({
      where: { id: transactionId },
      select: { metadata: true },
    });
    if (!row) return;
    const current =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { metadata: { ...current, duplicateDismissed: true } },
    });
  },

  /**
   * Bulk insert for CSV / statement imports (S-3.6). Uses
   * `createMany({ skipDuplicates: true })` so re-running the same
   * import no-ops on already-seen rows (dedup via the
   * `(profileId, source, externalId)` unique constraint). Returns
   * the actual inserted count, which the caller uses to compute
   * `duplicatesSkipped = batch.length - inserted`.
   *
   * Caller MUST be inside a `withTenant(...)` context. `profileId`
   * is pulled from that context and passed explicitly in the data
   * payload — same reason as `createManualWithAudit`: Prisma's
   * unchecked-create shape requires it and TS can't see the
   * tenancy-extension injection.
   */
  async createManyFromImport(rows: ImportRow[]): Promise<{ inserted: number }> {
    const { profileId } = requireTenant('Transaction', 'createManyFromImport');
    const result = await prisma.transaction.createMany({
      data: rows.map((row) => ({
        profileId,
        source: 'BANK_CSV',
        externalId: row.externalId,
        type: row.type,
        amount: row.amount,
        currency: row.currency,
        date: row.date,
        description: row.description,
        reconciliationStatus: 'UNMATCHED',
        ...(row.merchantNit ? { merchantNit: row.merchantNit } : {}),
        ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
      })),
      skipDuplicates: true,
    });
    return { inserted: result.count };
  },

  /**
   * Create a MANUAL transaction and its initial TransactionAudit row
   * atomically.
   *
   * Idempotency: when `idempotencyKey` is provided, we stash it in
   * `Transaction.externalId` (prefixed `idem:`) so the existing unique
   * constraint on `(profileId, source, externalId)` does the dedup
   * work. Re-submission with the same key returns the original row
   * with `created: false`. Keys are scoped per-tenant because the
   * tenancy extension auto-scopes the lookup.
   *
   * The returned `created` flag lets the route map HTTP status
   * appropriately: `true` → 201, `false` → 200.
   */
  async createManualWithAudit(input: CreateManualInput): Promise<CreateManualResult> {
    const externalId = input.idempotencyKey ? `idem:${input.idempotencyKey}` : null;

    if (externalId) {
      const existing = await prisma.transaction.findFirst({
        where: { source: 'MANUAL', externalId },
      });
      if (existing) return { created: false, transaction: existing };
    }

    /*
     * Extract tenant context explicitly and pass `profileId` in the
     * create payload. TypeScript can't see the tenancy extension's
     * runtime injection, so the unchecked create variant requires
     * `profileId` in the shape. The extension verifies that the
     * supplied value matches the context (identical here by
     * construction) — harmless redundancy.
     */
    const { profileId } = requireTenant('Transaction', 'createManualWithAudit');

    /*
     * S-3.11 duplicate detection: pre-insert lookup, stashes the
     * candidate id into `metadata.possibleDuplicateOf` on the new
     * row. One indexed query per manual create; negligible added
     * latency vs the <50ms acceptance budget.
     */
    const candidate = await this.findDuplicateCandidate({
      date: input.date,
      amount: input.amount,
      description: input.description,
    });
    const metadata = candidate ? { possibleDuplicateOf: candidate.id } : undefined;

    try {
      const transaction = await prisma.$transaction(async (db) => {
        const created = await db.transaction.create({
          data: {
            profileId,
            source: 'MANUAL',
            ...(externalId ? { externalId } : {}),
            type: input.type,
            amount: input.amount,
            ...(input.currency ? { currency: input.currency } : {}),
            date: input.date,
            description: input.description,
            ...(input.merchantName ? { merchantName: input.merchantName } : {}),
            ...(input.merchantNit ? { merchantNit: input.merchantNit } : {}),
            ...(input.category ? { category: input.category } : {}),
            reconciliationStatus: 'UNMATCHED',
            ...(metadata ? { metadata } : {}),
          },
        });
        await db.transactionAudit.create({
          data: {
            transactionId: created.id,
            action: 'CREATED',
            performedBy: 'USER',
            userId: input.actorUserId,
            details: {
              ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
              ...(input.userAgent ? { userAgent: input.userAgent } : {}),
              ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
            },
          },
        });
        return created;
      });
      return { created: true, transaction };
    } catch (error) {
      /*
       * Race condition path: two concurrent POSTs with the same
       * idempotency key — the first wins, the second trips the unique
       * constraint. Look up the winner and treat as a replay.
       */
      if (isUniqueViolation(error) && externalId) {
        const existing = await prisma.transaction.findFirst({
          where: { source: 'MANUAL', externalId },
        });
        if (existing) return { created: false, transaction: existing };
      }
      throw error;
    }
  },

  /**
   * Cursor-paginated list with optional filters.
   *
   * Ordering: `date DESC, id DESC`. UUIDv7 ids are time-ordered so the
   * secondary sort lines up with "newest first" without surprises.
   *
   * Pagination is keyset, not offset — the `cursor` is the last row's
   * `(id, date)` and the next page fetches strictly-older rows. This
   * sidesteps offset's "rows shift under you between pages" problem.
   *
   * `limit` clamps to [1, 200] with a default of 50. The `take: limit + 1`
   * trick lets us detect `hasMore` without a separate COUNT query.
   *
   * Full-text `q` uses Prisma's case-insensitive `contains`, which
   * generates `ILIKE`. At larger tables this wants the pg_trgm GIN
   * index documented in scaffolding §S-1.7 and deferred to the formal
   * migration transition (runbook §2.2) — correctness is identical now;
   * performance degrades gracefully until that lands.
   */
  async list(args: TransactionListArgs = {}): Promise<TransactionListResult> {
    const limit = clampLimit(args.limit);
    const cursor = args.cursor ?? null;
    const where = buildTransactionListWhere(args.filters ?? {}, cursor);

    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor: TransactionListCursor | null =
      hasMore && last ? { id: last.id, date: last.date } : null;

    return { data, nextCursor, hasMore };
  },
};

export type TransactionRepo = typeof transactionRepo;

/**
 * Build the Prisma `where` input for `transactionRepo.list`.
 *
 * Extracted so unit tests can verify the filter → Prisma mapping and
 * the cursor composition rules without touching a real database.
 */
export function buildTransactionListWhere(
  filters: TransactionListFilters,
  cursor: TransactionListCursor | null,
): Prisma.TransactionWhereInput {
  const base: Prisma.TransactionWhereInput = {};

  if (filters.source) base.source = filters.source;
  if (filters.reconciliationStatus) base.reconciliationStatus = filters.reconciliationStatus;

  if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
    base.date = {
      ...(filters.dateFrom !== undefined ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo !== undefined ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.amountMin !== undefined || filters.amountMax !== undefined) {
    base.amount = {
      ...(filters.amountMin !== undefined ? { gte: filters.amountMin } : {}),
      ...(filters.amountMax !== undefined ? { lte: filters.amountMax } : {}),
    };
  }

  if (filters.merchantNit) base.merchantNit = filters.merchantNit;
  if (filters.q) base.description = { contains: filters.q, mode: 'insensitive' };

  if (!cursor) return base;

  /*
   * Cursor composition: wrap both the base filters AND the cursor's
   * strict-inequality OR in a top-level AND. This avoids ambiguity
   * when the base filters already constrain `date` (e.g. dateFrom)
   * and the cursor's OR branches also reference `date`.
   */
  return {
    AND: [
      base,
      {
        OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
      },
    ],
  };
}

export function clampLimit(raw: number | undefined): number {
  const value = raw ?? DEFAULT_LIMIT;
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT);
}
