import 'server-only';
import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { jobQueue } from '@/lib/jobs/queue';
import { getHandler } from '@/lib/jobs/handlers';

/**
 * Background job drain (Phase 6/7 Batch 4).
 *
 * GET /api/cron/jobs — claims up to MAX_JOBS_PER_INVOCATION PENDING
 * rows from the `pending_jobs` table, dispatches each to its
 * registered handler, and marks the row DONE or FAILED.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`. Vercel Cron
 * attaches this header automatically when invoking a scheduled job
 * (it pulls the secret from the same `CRON_SECRET` env var). Manual
 * triggering (curl, monitoring) uses the same shape.
 *
 * Per-job isolation: each job's success/failure is contained — one
 * throwing handler doesn't crash the batch, and a markFailed call
 * itself won't bubble out of the loop.
 *
 * Returns: { workerId, claimed, completed, failed, durationMs }.
 */

/**
 * Vercel cron invokes serverless functions which on the free tier
 * cap at 10s. 25 jobs per minute is well above the throughput the
 * MVP needs (one job per imported transaction; typical CSV is
 * <500 rows) and stays comfortably inside the 10s budget even
 * with multi-second Claude calls. Raise this cautiously once we
 * have observability on per-job latency.
 */
const MAX_JOBS_PER_INVOCATION = 25;

interface JobSummary {
  workerId: string;
  claimed: number;
  completed: number;
  failed: number;
  durationMs: number;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    /*
     * Fail-closed in production-shaped environments: a missing
     * CRON_SECRET means the operator hasn't configured the
     * endpoint, so refuse to drain. The /api/admin/* routes in
     * later batches follow the same fail-closed default.
     */
    return false;
  }
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${expected}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const startedAt = Date.now();
  const workerId = randomUUID();

  const jobs = await jobQueue.claim(workerId, MAX_JOBS_PER_INVOCATION);

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
         * Marking the failure itself failed. We log + continue so
         * a transient DB blip on one job doesn't poison the rest
         * of the batch. The row stays RUNNING until the next
         * cron firing or a periodic reaper (later story) recovers
         * it.
         */
        console.error(`[jobs] markFailed for job ${job.id} (type=${job.type}) failed`, markErr);
      }
      failed += 1;
    }
  }

  const summary: JobSummary = {
    workerId,
    claimed: jobs.length,
    completed,
    failed,
    durationMs: Date.now() - startedAt,
  };

  return NextResponse.json(summary);
}
