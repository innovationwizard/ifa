import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/branding/logo';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/server';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';

export async function generateMetadata() {
  const t = await getTranslations('onboarding.welcome');
  return { title: t('title') };
}

/**
 * /bienvenida — first-sign-in landing.
 *
 * Stub for S-2.7. Ensures the User + Profile rows exist (defense-in-
 * depth: /auth/callback is the primary bootstrap point, but this
 * page catches any user that somehow slipped past without a Profile)
 * and shows a brief welcome.
 *
 * S-2.8 will replace the body with a single-step onboarding form
 * (DPI photo OR typed name + DPI number), plus marks
 * `onboardingCompleted = true` before routing to /dashboard. For
 * now, the "Empezar" button links directly to /dashboard.
 *
 * Returning users who already finished onboarding are redirected
 * straight to /dashboard so they don't see the welcome again.
 */
export default async function BienvenidaPage() {
  const authUser = await getCurrentUser();
  if (!authUser) redirect('/ingresar');

  const { profile } = await ensureUserAndProfile(authUser);
  if (profile.onboardingCompleted) redirect('/dashboard');

  const t = await getTranslations('onboarding.welcome');

  return (
    <main className="bg-ifa-navy-50 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card w-full max-w-md p-8 text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo variant="icon" iconSize={48} className="text-ifa-navy-800" />
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
            {t('title', { name: profile.displayName })}
          </h1>
          <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('body')}</p>
        </div>
        <Button asChild className="w-full">
          <Link href="/dashboard">{t('cta')}</Link>
        </Button>
      </div>
    </main>
  );
}
