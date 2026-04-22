'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';
import { profileRepo } from '@/lib/db/repositories';
import { normalizeOnboarding, onboardingSchema, type OnboardingInput } from './schema';

export type OnboardingActionResult =
  | { ok: true }
  | { ok: false; error: 'unauthenticated' | 'validation' | 'server' };

export async function completeOnboardingAction(
  input: OnboardingInput,
): Promise<OnboardingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const normalized = normalizeOnboarding(parsed.data);
  try {
    const { profile } = await ensureUserAndProfile(user);
    await profileRepo.update({
      where: { id: profile.id },
      data: {
        displayName: normalized.displayName,
        dpiNumber: normalized.dpiNumber,
        onboardingCompleted: true,
      },
    });
  } catch (error) {
    console.error('[bienvenida/actions] completeOnboarding failed', error);
    return { ok: false, error: 'server' };
  }

  /*
   * redirect() throws NEXT_REDIRECT — this line never returns normally;
   * the browser navigates to /dashboard via Next's server-action
   * response protocol. The declared return type is kept so TypeScript
   * can reason about the non-redirect branches.
   */
  redirect('/dashboard');
}
