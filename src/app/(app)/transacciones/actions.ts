'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { getHandler } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/queue';

/**
 * Server actions for `/transacciones` — user-triggered job-queue drain
 * (ADR-001, 2026-05-22).
 *
 * Replaces the every-minute `/api/cron/jobs` cron with a click-to-drain
 * button surfaced (a) in the post-import success state of the CSV
 * wizard and (b) as a contextual banner on `/transacciones` when this
 * profile has PENDING jobs.
 *
 * Scoping: claims via `jobQueue.claimForProfile(profileId)` so user A's
 * click cannot drain user B's queue. The per-job handlers themselves
 * restore tenant context via `withTenant` inside the handler
 * (B5 / B8 pattern), so the action only needs to claim + dispatch.
 *
 * Failure isolation mirrors `/api/cron/jobs/route.ts`: per-job
 * try/catch so one throwing handler does not poison the drain.
 *
 * Cap of `MAX_JOBS_PER_INVOCATION = 25` matches the cron path — keeps
 * the action well inside Vercel's 60s (Pro) / 10s (free) function
 * ceiling even when several jobs do multi-second Claude calls.
 */

const MAX_JOBS_PER_INVOCATION = 25;

export interface ProcessPendingResult {
  /** Pending count BEFORE this drain. UI uses it for the toast message. */
  pendingBefore: number;
  /** Rows the claim actually returned (≤ MAX_JOBS_PER_INVOCATION). */
  claimed: number;
  /** Jobs that completed without throwing. */
  completed: number;
  /** Jobs that threw or whose markDone/markFailed failed. */
  failed: number;
}

async function authedContext(): Promise<{ profileId: string; userId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');
  return { profileId: profile.id, userId: user.id };
}

export async function processPendingJobs(): Promise<ProcessPendingResult> {
  const ctx = await authedContext();
  const workerId = `user:${ctx.userId}:${randomUUID()}`;

  const pendingBefore = await jobQueue.countPendingForProfile(ctx.profileId);
  if (pendingBefore === 0) {
    return { pendingBefore: 0, claimed: 0, completed: 0, failed: 0 };
  }

  const jobs = await jobQueue.claimForProfile(workerId, MAX_JOBS_PER_INVOCATION, ctx.profileId);

  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const handler = getHandler(job.type);
      await handler(job.payload);
      await jobQueue.markDone(job.id);
      completed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await jobQueue.markFailed(job.id, message);
      } catch (markErr) {
        /*
         * Mirror /api/cron/jobs behavior: if markFailed itself throws
         * we log + count as failed but do not bubble out of the loop.
         * The row stays RUNNING; the curl-able ops endpoint can
         * recover it manually.
         */
        console.error(
          `[process-pending] markFailed for job ${job.id} (type=${job.type}) failed`,
          markErr,
        );
      }
      failed += 1;
    }
  }

  /*
   * Revalidate /transacciones so the feed re-fetches and rows show
   * their newly-written `category` / anomaly metadata. Also
   * revalidates the dashboard recent-activity, which reads the same
   * Transaction rows.
   */
  revalidatePath('/transacciones');
  revalidatePath('/dashboard');

  return { pendingBefore, claimed: jobs.length, completed, failed };
}
