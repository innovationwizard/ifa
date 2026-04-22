import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/branding/logo';
import { WelcomeForm } from '@/components/onboarding/welcome-form';
import { getCurrentUser } from '@/lib/auth/server';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';

export async function generateMetadata() {
  const t = await getTranslations('onboarding.welcome');
  return { title: t('title') };
}

/**
 * /bienvenida — single-step onboarding (S-2.8).
 *
 * Shows a welcome header plus one short form: confirm-or-edit display
 * name (required, pre-filled from Supabase user metadata or email
 * prefix) and an optional DPI number (stored as free-form text per
 * `project_core_thesis.md` — never validated).
 *
 * Submission flips `Profile.onboardingCompleted = true` and redirects
 * to `/dashboard`. Users who already completed onboarding bounce
 * straight to `/dashboard` without seeing the form again.
 *
 * `ensureUserAndProfile()` runs here as defense-in-depth — the primary
 * bootstrap happens in `/auth/callback` (S-2.7), but if any user
 * arrived here without Profile rows the helper catches it.
 */
export default async function BienvenidaPage() {
  const authUser = await getCurrentUser();
  if (!authUser) redirect('/ingresar');

  const { profile } = await ensureUserAndProfile(authUser);
  if (profile.onboardingCompleted) redirect('/dashboard');

  const t = await getTranslations('onboarding.welcome');

  return (
    <main className="bg-ifa-navy-50 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="icon" iconSize={44} className="text-ifa-navy-800" />
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
            {t('title', { name: profile.displayName })}
          </h1>
          <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('body')}</p>
        </div>
        <WelcomeForm initialDisplayName={profile.displayName} />
      </div>
    </main>
  );
}
