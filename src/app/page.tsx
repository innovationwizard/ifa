import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm">
        {t('status')}{' '}
        {t.rich('seeDocs', {
          path: (chunks) => (
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs">{chunks}</code>
          ),
        })}
      </p>
    </main>
  );
}
