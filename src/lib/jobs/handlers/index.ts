import 'server-only';
import type { JobType, Prisma } from '@prisma/client';

/**
 * Job-type → handler dispatch table (Phase 6/7 Batch 4).
 *
 * Each `JobType` has exactly one handler. The cron route claims
 * jobs from the queue and routes them here. Handlers are responsible
 * for:
 *   - validating their own payload shape (Zod)
 *   - executing the unit of work (DB writes, external calls, etc.)
 *   - throwing on failure so the caller can `markFailed` and the
 *     queue's retry/dead-letter logic kicks in
 *
 * Real implementations land in their owning batches:
 *   - CATEGORIZE_TRANSACTION → Batch 5 (categorization auto-trigger)
 *   - DETECT_ANOMALY        → Batch 8 (anomaly detection)
 *
 * Until then the stubs below log and resolve — exercising the queue
 * end-to-end without doing real work. Stubs deliberately succeed so
 * dead-letter behavior isn't masked during development of the queue
 * itself.
 */

export type JobHandler = (payload: Prisma.JsonValue) => Promise<void>;

const handlers: Record<JobType, JobHandler> = {
  CATEGORIZE_TRANSACTION: (payload: Prisma.JsonValue) => {
    /*
     * Stub — Batch 5 replaces this with a handler that reads
     * `transactionId` from payload, calls `categorizeMerchant`, and
     * writes the result to Transaction.category +
     * aiCategoryConfidence.
     */
    console.warn('[jobs] CATEGORIZE_TRANSACTION stub — Batch 5 will implement', { payload });
    return Promise.resolve();
  },

  DETECT_ANOMALY: (payload: Prisma.JsonValue) => {
    /*
     * Stub — Batch 8 replaces this with the anomaly-detection
     * handler that scores a transaction against the user's
     * historical pattern and writes a flag if it qualifies.
     */
    console.warn('[jobs] DETECT_ANOMALY stub — Batch 8 will implement', { payload });
    return Promise.resolve();
  },
};

/**
 * Resolve a `JobType` to its handler. Used by the cron route to
 * dispatch each claimed job. Throws if no handler is registered
 * (which would be a programming error — every JobType in the enum
 * must have a row above).
 */
export function getHandler(type: JobType): JobHandler {
  const handler = handlers[type];
  if (!handler) {
    throw new Error(`No handler registered for job type: ${type}`);
  }
  return handler;
}

/**
 * Test-only seam. Lets unit tests register a fake handler for a
 * given JobType so the cron-route logic (claim → dispatch → mark)
 * can be exercised without touching the real stubs.
 */
export function _registerHandlerForTesting(type: JobType, handler: JobHandler): () => void {
  const previous = handlers[type];
  handlers[type] = handler;
  return () => {
    handlers[type] = previous;
  };
}
