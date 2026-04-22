'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

const paramsSchema = z.object({ id: z.uuid() });

export type DismissDuplicateResult =
  | { ok: true }
  | { ok: false; error: 'unauthenticated' | 'invalid_id' | 'no_profile' | 'server' };

/**
 * Flip `metadata.duplicateDismissed = true` on the given transaction
 * (S-3.11). Preserves the rest of the metadata shape via the
 * repo's fetch-merge-update dance. Revalidates the detail page and
 * the feed so the badge disappears on next render.
 */
export async function dismissDuplicateAction(input: {
  id: string;
}): Promise<DismissDuplicateResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const parsed = paramsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_id' };

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) return { ok: false, error: 'no_profile' };

  try {
    await withTenant({ profileId: profile.id, userId: user.id }, () =>
      transactionRepo.markDuplicateDismissed(parsed.data.id),
    );
  } catch (error) {
    console.error('[transactions/[id]/dismissDuplicate]', error);
    return { ok: false, error: 'server' };
  }

  revalidatePath(`/transacciones/${parsed.data.id}`);
  revalidatePath('/transacciones');
  return { ok: true };
}
