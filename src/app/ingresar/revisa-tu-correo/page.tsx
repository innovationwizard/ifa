import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Mail } from 'lucide-react';
import { Logo } from '@/components/branding/logo';
import { Button } from '@/components/ui/button';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('auth.checkInbox');
  return { title: t('title') };
}

/**
 * Post-magic-link-send landing page.
 *
 * Shown to the user immediately after `signInWithOtp` accepts their
 * email. We don't poll for confirmation — the user's click on the
 * email link lands them on `/auth/callback` which completes the
 * session and redirects onward.
 *
 * Resend UI currently routes the user back to `/ingresar` rather than
 * re-triggering `signInWithOtp` in place, because the cooldown state
 * lives in the form component. Good enough for MVP; a dedicated
 * resend button with its own cooldown lands when we have a concrete
 * user complaint about the flow.
 */
export default async function RevisaTuCorreoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const emailRaw = params.email;
  const email = typeof emailRaw === 'string' ? emailRaw : '';

  const t = await getTranslations('auth.checkInbox');

  return (
    <main className="bg-ifa-navy-50 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card w-full max-w-md p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo variant="icon" iconSize={40} className="text-ifa-navy-800" />
          <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-16 items-center justify-center rounded-full">
            <Mail className="size-7" aria-hidden />
          </div>
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">
            {t('bodyLead')}{' '}
            {email ? <span className="text-ifa-navy-900 font-medium">{email}</span> : null}
            {t('bodyTail')}
          </p>
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 text-sm">
          <p className="text-ifa-gray-500">{t('didntGet')}</p>
          <Button asChild variant="outline">
            <Link href="/ingresar">{t('resend')}</Link>
          </Button>
          <p className="text-ifa-gray-500 mt-3">{t('wrongEmail')}</p>
          <Link
            href="/ingresar"
            className="text-ifa-teal-600 text-sm underline-offset-2 hover:underline"
          >
            {t('useAnotherEmail')}
          </Link>
        </div>
      </div>
    </main>
  );
}
