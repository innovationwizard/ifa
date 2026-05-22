import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { runHealthScoreCron } from '@/lib/intelligence/health-score/cron-runner';

/**
 * Nightly Health Score cron endpoint (Phase 6/7 Batch 15).
 *
 * `GET /api/cron/health-score` — recomputes a fresh score for every
 * active profile. Triggered by Vercel Cron at 02:00 GT (08:00 UTC)
 * per the `crons` entry in `vercel.json`. The Railway migration path
 * (when this hits the Vercel 60s ceiling) is documented in the
 * cron-runner header.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`. Matches the
 * shape of `/api/cron/jobs` (Batch 4) so a single rotated secret
 * unlocks every cron in the system. Fail-closed when `CRON_SECRET`
 * is unset — refuse to run rather than recompute for free.
 *
 * Response shape:
 *   `{ totalProfiles, succeeded, failed, durationMs, failures: [] }`
 */

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${expected}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const summary = await runHealthScoreCron();
  return NextResponse.json(summary);
}
