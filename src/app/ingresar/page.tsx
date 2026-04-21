import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/branding/logo';
import { LoginForm } from '@/components/auth/login-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

/**
 * /ingresar — sign-in page.
 *
 * The page is a server component that reads `?next=` from searchParams and
 * hands it to a client-only `<LoginForm />`. The proxy already bounces
 * already-authenticated users away from this route (S-2.2), so nothing here
 * needs to check auth state.
 */
export default async function IngresarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.next;
  const nextParam = typeof raw === 'string' ? raw : null;

  const t = await getTranslations('auth.login');

  return (
    <main className="bg-ifa-navy-50 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card w-full max-w-md p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo variant="icon" iconSize={40} className="text-ifa-navy-800" />
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
        </div>
        <LoginForm nextParam={nextParam} />
      </div>
    </main>
  );
}
