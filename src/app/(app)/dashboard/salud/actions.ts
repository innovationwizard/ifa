'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { healthScoreRepo, profileRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { recomputeHealthScore } from '@/lib/intelligence/health-score/persist';
import { throttleRetryAfterSeconds } from '@/lib/validators/health-score';

/**
 * Server actions for `/dashboard/salud` — Phase 6/7 Batch 13.
 *
 * Two actions: `completeAction` ("Marcar como hecho") and
 * `dismissAction` ("Descartar"). Both:
 *
 *   - Require an authenticated user with a Profile (redirect to
 *     /ingresar otherwise, mirroring the server-component guard).
 *   - Validate the action id via Zod.
 *   - Run under `withTenant` so the tenancy extension's
 *     `where: { profileId }` injection prevents a user from
 *     mutating another tenant's action.
 *   - `revalidatePath('/dashboard/salud')` so the list refreshes
 *     with the new status.
 */

const ActionIdSchema = z.object({
  actionId: z.string().uuid(),
});

async function authedContext(): Promise<{ profileId: string; userId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');
  return { profileId: profile.id, userId: user.id };
}

export async function completeAction(formData: FormData): Promise<void> {
  const parsed = ActionIdSchema.parse({ actionId: formData.get('actionId') });
  const ctx = await authedContext();
  await withTenant({ profileId: ctx.profileId, userId: ctx.userId }, () =>
    healthScoreRepo.markActionCompleted(parsed.actionId),
  );
  revalidatePath('/dashboard/salud');
}

export async function dismissAction(formData: FormData): Promise<void> {
  const parsed = ActionIdSchema.parse({ actionId: formData.get('actionId') });
  const ctx = await authedContext();
  await withTenant({ profileId: ctx.profileId, userId: ctx.userId }, () =>
    healthScoreRepo.markActionDismissed(parsed.actionId),
  );
  revalidatePath('/dashboard/salud');
}

/**
 * "Calcular ahora" / "Recalcular" — server action wrapping the
 * `recomputeHealthScore` engine from Batch 10. Respects the
 * `RECOMPUTE_THROTTLE_MS` window (1h per profile) via
 * `Profile.lastHealthScoreRecomputeAt` from Batch 11. Silently
 * no-ops when throttled — the UI button is disabled during the
 * window so users shouldn't reach this path; the throttle check
 * here is defense-in-depth.
 *
 * Calls revalidatePath on success so the page re-renders with the
 * fresh snapshot + improvement actions.
 */
export async function recomputeNow(): Promise<void> {
  const ctx = await authedContext();
  const now = new Date();

  const profile = await profileRepo.findFirst({ where: { id: ctx.profileId } });
  const retryAfter = throttleRetryAfterSeconds(profile?.lastHealthScoreRecomputeAt ?? null, now);
  if (retryAfter > 0) {
    /*
     * Throttled — defensive no-op. The UI button is disabled
     * during the window so this shouldn't be reachable in normal
     * flows. We don't surface an error because there's no toast
     * channel from a server action; the user clicking a disabled
     * button is already aware.
     */
    return;
  }

  await recomputeHealthScore({
    profileId: ctx.profileId,
    now,
    period: 'ON_DEMAND',
  });
  await profileRepo.update({
    where: { id: ctx.profileId },
    data: { lastHealthScoreRecomputeAt: now },
  });
  revalidatePath('/dashboard/salud');
}
