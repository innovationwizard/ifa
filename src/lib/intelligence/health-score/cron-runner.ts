import 'server-only';
import { profileRepo } from '@/lib/db/repositories';
import { recomputeHealthScore } from './persist';

/**
 * Nightly Health Score cron orchestrator (Phase 6/7 Batch 15).
 *
 * Iterates every active profile (subscriptionStatus !== EXPIRED) and
 * recomputes a fresh Health Score snapshot. Per-profile failures are
 * isolated — one throwing recompute does not crash the batch.
 *
 * Bypasses the per-profile 1×/hour throttle on purpose: the cron IS
 * the canonical fresh recompute. After a successful run we stamp
 * `Profile.lastHealthScoreRecomputeAt` so any subsequent ON_DEMAND
 * request (user pressing "Recalcular" from the dashboard) inside the
 * next hour falls through to the 429 path — there's no point burning
 * AI tokens to recompute a score the cron just refreshed.
 *
 * --- Railway migration path ---
 * Vercel's serverless function ceiling is 60s on Pro (10s on free).
 * At ~100ms per recompute this works for ≲500 profiles. Past that,
 * the migration is purely operational — no code changes:
 *
 *   1. Provision a Railway worker that runs `curl
 *      https://app.ifa.gt/api/cron/health-score
 *      -H "Authorization: Bearer $CRON_SECRET"` on a 02:00 GT cron.
 *   2. Drop the `crons` entry for this path from `vercel.json`.
 *   3. (Optional) Move the route handler off the Vercel edge by
 *      bumping its function memory/duration limits — it stays the
 *      same code, just hosted on Railway compute.
 *
 * The per-profile loop, isolation, and summary stay identical. The
 * endpoint shape (Bearer-token auth, JSON summary response) is
 * already what an external scheduler expects to call.
 */

export interface CronFailure {
  profileId: string;
  error: string;
}

export interface CronSummary {
  totalProfiles: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  /** Per-profile failures. Bounded by `totalProfiles`. */
  failures: CronFailure[];
}

export interface RunHealthScoreCronArgs {
  /** Optional clock for tests. Defaults to current time. */
  now?: Date;
}

export async function runHealthScoreCron(args: RunHealthScoreCronArgs = {}): Promise<CronSummary> {
  const now = args.now ?? new Date();
  const startedAt = Date.now();

  const profileIds = await profileRepo.listActiveProfileIds();

  let succeeded = 0;
  let failed = 0;
  const failures: CronFailure[] = [];

  for (const profileId of profileIds) {
    try {
      await recomputeHealthScore({ profileId, now, period: 'DAILY' });
      /*
       * Stamp the throttle timestamp so a user pressing "Recalcular"
       * inside the next hour gets the 429 — their score is already
       * fresh from this cron run. Matches the API route's behavior
       * (Batch 11) of stamping after a successful recompute.
       */
      await profileRepo.update({
        where: { id: profileId },
        data: { lastHealthScoreRecomputeAt: now },
      });
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ profileId, error: message });
      failed += 1;
      /*
       * Log to stderr so operator dashboards / Vercel logs surface
       * the failure. Don't rethrow — per-profile isolation is the
       * whole point of this loop.
       */
      console.error(`[health-score-cron] profile=${profileId} failed:`, message);
    }
  }

  return {
    totalProfiles: profileIds.length,
    succeeded,
    failed,
    durationMs: Date.now() - startedAt,
    failures,
  };
}
