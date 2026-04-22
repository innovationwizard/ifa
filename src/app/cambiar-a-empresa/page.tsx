import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Briefcase, Check } from 'lucide-react';
import { Logo } from '@/components/branding/logo';
import { UpgradeForm } from '@/components/upgrade/upgrade-form';
import { getCurrentUser } from '@/lib/auth/server';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';
import { PRICE_BUSINESS_USD } from '@/lib/billing/pricing';

export async function generateMetadata() {
  const t = await getTranslations('upgrade');
  return { title: t('title') };
}

/**
 * /cambiar-a-empresa — proactive INDIVIDUAL → BUSINESS upgrade flow.
 *
 * Anyone who lands here already has a Profile (proxy redirects
 * anonymous, (app) tree redirects missing-profile). We still call
 * ensureUserAndProfile as defense-in-depth.
 *
 * If the profile is already BUSINESS, we route to /dashboard — no
 * downgrade flow here (users looking to move back are rare, and
 * "undo" lives in /configuracion later).
 *
 * The form collects the minimum viable business info: name +
 * optional NIT. Industry / fiscal regime are NOT collected here —
 * locked decision: "taxes carry high emotional and friction load;
 * don't block adoption on them."
 */
export default async function CambiarAEmpresaPage() {
  const authUser = await getCurrentUser();
  if (!authUser) redirect('/ingresar');

  const { profile } = await ensureUserAndProfile(authUser);
  if (profile.type === 'BUSINESS') redirect('/dashboard');

  const t = await getTranslations('upgrade');

  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <Logo variant="icon" iconSize={44} className="text-ifa-navy-800" />
          <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-14 items-center justify-center rounded-full">
            <Briefcase className="size-6" aria-hidden />
          </div>
          <h1 className="text-ifa-navy-900 text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('subtitle')}</p>
        </header>

        <section className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col gap-5 p-8">
          <div className="flex items-baseline gap-2">
            <span className="text-ifa-navy-900 text-4xl font-semibold tabular-nums">
              {t('priceFormat', { amount: PRICE_BUSINESS_USD })}
            </span>
            <span className="text-ifa-gray-500 text-sm">
              {t('usd')} · {t('perMonth')}
            </span>
          </div>
          <p className="text-ifa-gray-500 text-xs">{t('priceChangeNotice')}</p>

          <ul className="flex flex-col gap-3 text-sm">
            <Feature>{t('features.one')}</Feature>
            <Feature>{t('features.two')}</Feature>
            <Feature>{t('features.three')}</Feature>
            <Feature>{t('features.four')}</Feature>
          </ul>
        </section>

        <section className="bg-ifa-white rounded-ifa-card shadow-ifa-card p-8">
          <UpgradeForm initialDisplayName={profile.displayName} initialNit={profile.nit} />
        </section>

        <footer className="flex flex-col items-center gap-2 text-center">
          <Link
            href="/dashboard"
            className="text-ifa-gray-500 text-sm underline-offset-2 hover:underline"
          >
            {t('back')}
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="text-ifa-teal-600 mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-ifa-gray-700">{children}</span>
    </li>
  );
}
