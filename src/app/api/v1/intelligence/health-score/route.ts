import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import {
  HISTORY_LIMIT_DEFAULT,
  historyQuerySchema,
  throttleRetryAfterSeconds,
} from '@/lib/validators/health-score';
import { recomputeHealthScore } from '@/lib/intelligence/health-score/persist';
import { getCurrentUser } from '@/lib/auth/server';
import { healthScoreRepo, profileRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * Health Score API — `/api/v1/intelligence/health-score`
 * (Phase 6/7 Batch 11).
 *
 *   POST → trigger an on-demand recompute. Rate-limited to
 *          1× per hour per profile via
 *          `Profile.lastHealthScoreRecomputeAt`. Returns
 *          `{ data: HealthScore }`. 429 + `Retry-After` when
 *          throttled.
 *
 *   GET  → return the latest `HealthScore` row + N history rows.
 *          Response: `{ data: HealthScore | null, history: HealthScore[] }`.
 *          Query param `?historyLimit=N` (default 30, max 90).
 *
 * Auth: both methods require an authenticated user with a Profile.
 * 401 anonymous. 400 when the user exists but has no Profile
 * (still in the /bienvenida onboarding flow).
 *
 * Both methods use `withTenant({ profileId, userId })` so the
 * tenancy extension auto-injects `profileId` on every read/write.
 */

interface AuthedContext {
  profileId: string;
  userId: string;
  lastRecomputeAt: Date | null;
}

async function resolveContext(): Promise<AuthedContext | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }
  return {
    profileId: profile.id,
    userId: user.id,
    lastRecomputeAt: profile.lastHealthScoreRecomputeAt,
  };
}

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const ctx = await resolveContext();
  if (ctx instanceof NextResponse) return ctx;

  const now = new Date();
  const retryAfter = throttleRetryAfterSeconds(ctx.lastRecomputeAt, now);
  if (retryAfter > 0) {
    /*
     * 429 Too Many Requests + `Retry-After` (seconds) so the client
     * (or the dashboard's "Recalcular" button) can disable until the
     * window clears.
     */
    return NextResponse.json(
      { error: 'throttled', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'Retry-After': retryAfter.toString() } },
    );
  }

  const { healthScoreId } = await recomputeHealthScore({
    profileId: ctx.profileId,
    now,
    period: 'ON_DEMAND',
  });

  /*
   * Stamp the throttle timestamp AFTER the recompute succeeds. If
   * the recompute throws, the user keeps their pre-throttle state
   * and can retry without waiting an hour. Update goes via the
   * unscoped repo because Profile isn't tenant-scoped (the tenancy
   * extension would refuse).
   */
  await profileRepo.update({
    where: { id: ctx.profileId },
    data: { lastHealthScoreRecomputeAt: now },
  });

  const data = await withTenant({ profileId: ctx.profileId, userId: ctx.userId }, () =>
    healthScoreRepo.findLatestForProfile(),
  );

  return NextResponse.json({ data, healthScoreId });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await resolveContext();
  if (ctx instanceof NextResponse) return ctx;

  const rawLimit = request.nextUrl.searchParams.get('historyLimit');
  const parsed = historyQuerySchema.safeParse(rawLimit === null ? {} : { historyLimit: rawLimit });
  const historyLimit = parsed.success ? parsed.data.historyLimit : HISTORY_LIMIT_DEFAULT;

  return withTenant({ profileId: ctx.profileId, userId: ctx.userId }, async () => {
    const [latest, history] = await Promise.all([
      healthScoreRepo.findLatestForProfile(),
      healthScoreRepo.findHistoryForProfile({ limit: historyLimit }),
    ]);
    return NextResponse.json({ data: latest, history });
  });
}
