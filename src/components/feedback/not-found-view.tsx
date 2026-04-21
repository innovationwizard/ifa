import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotFoundViewProps {
  homeHref?: string;
}

/**
 * Default 404 view — Spanish copy from es-GT.json, "Volver al inicio"
 * action targets `/` by default; the (app) variant overrides to `/dashboard`.
 */
export function NotFoundView({ homeHref = '/' }: NotFoundViewProps) {
  const t = useTranslations('errors.notFound');
  const buttons = useTranslations('common.buttons');

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="bg-ifa-navy-100 text-ifa-navy-700 rounded-ifa-pill flex size-16 items-center justify-center">
        <Compass className="size-8" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm">{t('description')}</p>
      </div>
      <Button asChild>
        <Link href={homeHref}>{buttons('goHome')}</Link>
      </Button>
    </div>
  );
}
