import 'server-only';
import type { JobType, Prisma } from '@prisma/client';
import { categorizeTransactionHandler } from './categorize-transaction';
import { detectAnomalyHandler } from './detect-anomaly';

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
 * Currently wired:
 *   - CATEGORIZE_TRANSACTION → ./categorize-transaction (Batch 5)
 *   - DETECT_ANOMALY        → ./detect-anomaly         (Batch 8)
 */

export type JobHandler = (payload: Prisma.JsonValue) => Promise<void>;

const handlers: Record<JobType, JobHandler> = {
  CATEGORIZE_TRANSACTION: categorizeTransactionHandler,

  DETECT_ANOMALY: detectAnomalyHandler,
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
