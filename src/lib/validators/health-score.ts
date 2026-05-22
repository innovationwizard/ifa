import { z } from 'zod';

/**
 * Validators for the Health Score API (Phase 6/7 Batch 11).
 *
 * Shared by `GET /api/v1/intelligence/health-score` (history-length
 * query param) and the recompute throttle test.
 */

/**
 * Recompute throttle window. A `POST` within this window of the
 * profile's `lastHealthScoreRecomputeAt` returns 429.
 *
 * One hour matches the user expectation that a "Recalcular" button
 * isn't a spam vector while still giving enough room for a manual
 * recompute after a CSV import / categorization completes.
 */
export const RECOMPUTE_THROTTLE_MS = 60 * 60 * 1000;

/** Maximum history rows returned by GET. Keeps the response bounded. */
export const HISTORY_LIMIT_MAX = 90;
/** Default history rows when the caller doesn't specify. */
export const HISTORY_LIMIT_DEFAULT = 30;

export const historyQuerySchema = z.object({
  historyLimit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((raw) => {
      if (raw === undefined) return HISTORY_LIMIT_DEFAULT;
      const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return HISTORY_LIMIT_DEFAULT;
      return Math.min(Math.max(Math.floor(n), 1), HISTORY_LIMIT_MAX);
    }),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/**
 * Pure: compute the milliseconds remaining in the throttle window
 * given the last recompute timestamp + the current clock. Returns
 * `0` when the user is outside the window (free to recompute).
 *
 * Caller turns a positive return value into a 429 + `Retry-After`
 * header (seconds, rounded up).
 */
export function throttleRemainingMs(lastRecomputeAt: Date | null, now: Date): number {
  if (!lastRecomputeAt) return 0;
  const elapsed = now.getTime() - lastRecomputeAt.getTime();
  if (elapsed >= RECOMPUTE_THROTTLE_MS) return 0;
  return RECOMPUTE_THROTTLE_MS - elapsed;
}

/**
 * Seconds remaining, rounded UP — the value that goes into the
 * `Retry-After` HTTP header. Returns 0 when the caller is out of
 * the window.
 */
export function throttleRetryAfterSeconds(lastRecomputeAt: Date | null, now: Date): number {
  return Math.ceil(throttleRemainingMs(lastRecomputeAt, now) / 1000);
}
