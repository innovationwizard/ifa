import 'server-only';
import { profileRepo } from '@/lib/db/repositories';
import { throttleRemainingMs } from '@/lib/validators/health-score';
import { recomputeHealthScore } from './persist';

/**
 * Health Score staleness + auto-recompute (ADR-002, 2026-05-22).
 *
 * Replaces the B15 nightly Vercel Cron with a lazy "recompute on
 * dashboard visit if stale" pattern. Both `/dashboard` (B14) and
 * `/dashboard/salud` (B13) call `maybeRecomputeStale` before
 * reading the score for render.
 *
 * Three primitives, two pure + one orchestrator:
 *
 *   isStale(score, now)            — pure: latest.computedAt older
 *                                    than STALENESS_THRESHOLD_MS?
 *   canAutoRecompute(lastAt, now)  — pure: throttle window passed?
 *   maybeRecomputeStale(...)       — combines them + does the work
 *                                    when both say yes
 *
 * Idempotent: calling `maybeRecomputeStale` repeatedly within the
 * throttle window is a cheap no-op (the second call sees
 * `canAutoRecompute === false` and returns immediately). Safe to
 * call from every dashboard render.
 */

/**
 * A score this old or older is considered stale enough to auto-
 * recompute on dashboard visit. 24h matches the cadence the B15 cron
 * was originally going to enforce (`0 8 * * *` daily). Pinned as
 * a constant so the unit test for `isStale` has a single source of
 * truth.
 */
export const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isStale(score: { computedAt: Date } | null, now: Date = new Date()): boolean {
  if (!score) return false; // No prior score → empty state, not auto-recompute
  return now.getTime() - score.computedAt.getTime() >= STALENESS_THRESHOLD_MS;
}

/**
 * Reuses B11's 1×/hour throttle window. Returns true when a fresh
 * auto-recompute is allowed. Equivalent to "throttle has cleared".
 */
export function canAutoRecompute(lastRecomputeAt: Date | null, now: Date = new Date()): boolean {
  return throttleRemainingMs(lastRecomputeAt, now) === 0;
}

export interface MaybeRecomputeArgs {
  profileId: string;
  latestScore: { computedAt: Date } | null;
  lastRecomputeAt: Date | null;
  now?: Date;
}

/**
 * Auto-recompute if (and only if) the latest score is stale AND the
 * throttle window has cleared. Returns `true` when a recompute
 * actually ran, `false` otherwise. Failures are caught + logged: a
 * broken recompute MUST NOT prevent the dashboard from rendering
 * the cached (stale) score.
 *
 * The throttle stamp goes out only on success, mirroring B11's
 * API-route behavior. A failed recompute leaves the profile free
 * to retry on the next dashboard visit.
 */
export async function maybeRecomputeStale(args: MaybeRecomputeArgs): Promise<boolean> {
  const now = args.now ?? new Date();

  if (!isStale(args.latestScore, now)) return false;
  if (!canAutoRecompute(args.lastRecomputeAt, now)) return false;

  try {
    await recomputeHealthScore({ profileId: args.profileId, now, period: 'DAILY' });
    await profileRepo.update({
      where: { id: args.profileId },
      data: { lastHealthScoreRecomputeAt: now },
    });
    return true;
  } catch (err) {
    /*
     * Production-first: a recompute failure on render path must
     * not bubble out. Log + return false so the caller renders
     * the cached score. The user sees a stale-but-honest result
     * instead of a 500.
     */
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[health-score-staleness] auto-recompute failed for profile=${args.profileId}:`,
      message,
    );
    return false;
  }
}
