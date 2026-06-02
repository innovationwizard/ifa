import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/branding/logo';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Separator } from '@/components/ui/separator';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('auth.signIn');
  return { title: t('title') };
}

/**
 * /ingresar — unified sign-in / sign-up page.
 *
 * One page for both returning users and first-time users. No separate
 * `/crear-cuenta` route: the first successful magic-link submission
 * auto-creates the Supabase Auth user (default `shouldCreateUser: true`
 * behavior on `signInWithOtp`). Google OAuth likewise creates the
 * account on first sign-in.
 *
 * The proxy (S-2.2) bounces already-authenticated users away to
 * `/dashboard`, so this page assumes an anonymous session.
 */
export default async function IngresarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.next;
  const nextParam = typeof raw === 'string' ? raw : null;
  /*
   * `?deleted=1` arrives from the Phase L3.7 confirm-eliminar-cuenta
   * flow after a successful account deletion. Surface a one-time
   * goodbye banner above the sign-in card.
   */
  const justDeleted = params.deleted === '1';

  const t = await getTranslations('auth.signIn');

  return (
    <main className="bg-ifa-navy-50 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card w-full max-w-md p-8">
        {justDeleted && (
          <div className="border-ifa-teal-200 bg-ifa-teal-50 mb-6 flex items-start gap-3 rounded-lg border p-4">
            <CheckCircle2 className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-ifa-navy-900 text-sm font-medium">{t('deletedTitle')}</p>
              <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('deletedBody')}</p>
            </div>
          </div>
        )}

        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo variant="icon" iconSize={40} className="text-ifa-navy-800" />
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
        </div>

        <div className="flex flex-col gap-5">
          <GoogleSignInButton nextParam={nextParam} />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-ifa-gray-500 text-xs tracking-wider uppercase">{t('or')}</span>
            <Separator className="flex-1" />
          </div>

          <MagicLinkForm nextParam={nextParam} />
        </div>

        <p className="text-ifa-gray-500 mt-6 text-center text-xs leading-relaxed">
          {t('termsPrefix')}{' '}
          <Link
            href="/terminos"
            className="text-ifa-teal-600 underline-offset-2 hover:underline"
            target="_blank"
          >
            {t('termsLink')}
          </Link>{' '}
          {t('termsJoiner')}{' '}
          <Link
            href="/privacidad"
            className="text-ifa-teal-600 underline-offset-2 hover:underline"
            target="_blank"
          >
            {t('privacyLink')}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
