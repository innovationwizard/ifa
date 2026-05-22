import 'server-only';
import type { JobType, PendingJob, Prisma } from '@prisma/client';
import { prismaUnscoped } from '@/lib/db/prisma';

/**
 * Postgres-backed job queue (Phase 6/7 Batch 4).
 *
 * Wraps the `PendingJob` table (added in Batch 1) with the four
 * primitives a worker loop needs:
 *
 *   enqueue            — insert a PENDING row
 *   claim              — atomically mark N PENDING rows RUNNING with
 *                        `SELECT ... FOR UPDATE SKIP LOCKED`, so two
 *                        cron firings running in parallel cannot
 *                        double-process the same row
 *   markDone           — terminal-success transition
 *   markFailed         — retry-with-backoff or dead-letter, depending
 *                        on attempt count
 *
 * Why bare SQL for `claim`: Prisma's typed delegates don't expose
 * `FOR UPDATE SKIP LOCKED`. We use `$queryRaw` against the same
 * connection pool. Tagged-template parameterization keeps the path
 * injection-safe.
 *
 * Why `prismaUnscoped`: the queue is process-shared across all
 * tenants — the tenant scope of any individual job lives in its
 * `payload`, not on the row. The tenancy extension would refuse
 * these queries because `PendingJob` is NOT in
 * `TENANT_SCOPED_MODELS`, so we'd see TenantContextMissingError
 * anyway. Bypassing it is the only correct path.
 *
 * Lifecycle: PENDING → RUNNING → DONE | FAILED. A FAILED row with
 * `attempts < MAX_ATTEMPTS` is requeued (status flips back to
 * PENDING with a back-off delay on `scheduledAt`). At
 * `attempts >= MAX_ATTEMPTS` it stays FAILED — the queue depth no
 * longer counts it (`claim` only picks PENDING rows) but the row
 * lingers as a dead-letter record for inspection.
 */

/** Max retries before a job is dead-lettered. Per Batch 4 spec. */
export const MAX_ATTEMPTS = 3;

/**
 * Backoff schedule applied to `scheduledAt` on each retry. Index =
 * attempts-so-far at time of failure. The first failure waits 30s
 * before re-eligibility; the second waits 2 minutes. After the third
 * (index 2) the job is dead-lettered before any delay is applied.
 */
const RETRY_DELAYS_SECONDS = [30, 120] as const;

/**
 * Truncate `lastError` so a flood of similar-but-long error messages
 * doesn't bloat the `pending_jobs` row size. The full stack lives in
 * structured logs; the column is for "at a glance, what failed".
 */
const MAX_LAST_ERROR_LENGTH = 500;

function clampError(message: string): string {
  if (message.length <= MAX_LAST_ERROR_LENGTH) return message;
  return `${message.slice(0, MAX_LAST_ERROR_LENGTH - 1)}…`;
}

export interface EnqueueArgs {
  type: JobType;
  payload: Prisma.InputJsonValue;
  /** Optional delay before the job becomes claimable. Defaults to now. */
  scheduledAt?: Date;
}

export const jobQueue = {
  async enqueue(args: EnqueueArgs): Promise<PendingJob> {
    return prismaUnscoped.pendingJob.create({
      data: {
        type: args.type,
        payload: args.payload,
        ...(args.scheduledAt ? { scheduledAt: args.scheduledAt } : {}),
      },
    });
  },

  /**
   * Bulk-insert variant of `enqueue`. Single round-trip via
   * `createMany` so a 500-row CSV import doesn't pay N enqueue
   * latencies. Returns the count actually inserted.
   *
   * No idempotency at this layer — callers that need
   * "don't enqueue twice for the same transaction" should track
   * that themselves (the categorize-transaction handler is
   * idempotent anyway, so duplicates are safe but wasteful).
   */
  async enqueueMany(rows: EnqueueArgs[]): Promise<{ inserted: number }> {
    if (rows.length === 0) return { inserted: 0 };
    const result = await prismaUnscoped.pendingJob.createMany({
      data: rows.map((args) => ({
        type: args.type,
        payload: args.payload,
        ...(args.scheduledAt ? { scheduledAt: args.scheduledAt } : {}),
      })),
    });
    return { inserted: result.count };
  },

  /**
   * Atomically claim up to `limit` PENDING jobs whose `scheduledAt`
   * has passed. Each claimed row is flipped to RUNNING with
   * `lockedBy = workerId` and `lockedAt = NOW()`. Returns the rows
   * the caller should now process.
   *
   * Uses `FOR UPDATE SKIP LOCKED` so a parallel claim from a
   * different worker walks past rows we've already locked rather
   * than blocking on them.
   */
  async claim(workerId: string, limit: number): Promise<PendingJob[]> {
    if (limit <= 0) return [];
    return prismaUnscoped.$queryRaw<PendingJob[]>`
      WITH claimed AS (
        SELECT id FROM pending_jobs
        WHERE status = 'PENDING'::"JobStatus"
          AND "scheduledAt" <= NOW()
        ORDER BY "scheduledAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE pending_jobs
      SET status = 'RUNNING'::"JobStatus",
          "lockedAt" = NOW(),
          "lockedBy" = ${workerId},
          "updatedAt" = NOW()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING *
    `;
  },

  /** Terminal success. Idempotent — markDone on an already-DONE row no-ops. */
  async markDone(jobId: string): Promise<void> {
    await prismaUnscoped.pendingJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  },

  /**
   * Retry-with-backoff or dead-letter, depending on how many times
   * this job has already failed. Increments `attempts` regardless.
   *
   *   attempts after increment <  MAX_ATTEMPTS → status=PENDING,
   *     scheduledAt = NOW() + RETRY_DELAYS_SECONDS[attempts-1]
   *   attempts after increment >= MAX_ATTEMPTS → status=FAILED
   *     (dead-letter; never re-picked by `claim`)
   *
   * Single UPDATE so the attempt-count read and write are atomic
   * (no read-modify-write race between two cron firings).
   */
  async markFailed(jobId: string, error: string): Promise<void> {
    const trimmedError = clampError(error);
    /*
     * INTERVAL literals can't be parameterized as strings, so we
     * multiply a 1-second interval by an integer parameter. The
     * `+ 1`s below mirror the `attempts + 1` increment so the
     * CASE arms reason about post-increment attempt count.
     */
    const firstRetrySeconds = RETRY_DELAYS_SECONDS[0];
    const secondRetrySeconds = RETRY_DELAYS_SECONDS[1];
    await prismaUnscoped.$executeRaw`
      UPDATE pending_jobs
      SET attempts = attempts + 1,
          "lastError" = ${trimmedError},
          status = CASE
            WHEN attempts + 1 >= ${MAX_ATTEMPTS}
              THEN 'FAILED'::"JobStatus"
              ELSE 'PENDING'::"JobStatus"
          END,
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "scheduledAt" = CASE
            WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN "scheduledAt"
            WHEN attempts + 1 = 1 THEN NOW() + (${firstRetrySeconds}::int * INTERVAL '1 second')
            ELSE NOW() + (${secondRetrySeconds}::int * INTERVAL '1 second')
          END,
          "updatedAt" = NOW()
      WHERE id = ${jobId}::uuid
    `;
  },

  /**
   * Read-only diagnostics. Used by the cron route's summary and by
   * health-check endpoints. Counts each status separately so the
   * caller can render queue depth + dead-letter count at a glance.
   */
  async countByStatus(): Promise<{
    pending: number;
    running: number;
    done: number;
    failed: number;
  }> {
    const rows = await prismaUnscoped.pendingJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const row of rows) {
      if (row.status === 'PENDING') out.pending = row._count._all;
      else if (row.status === 'RUNNING') out.running = row._count._all;
      else if (row.status === 'DONE') out.done = row._count._all;
      else if (row.status === 'FAILED') out.failed = row._count._all;
    }
    return out;
  },
};

export type JobQueue = typeof jobQueue;
