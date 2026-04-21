'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/observability/log';

interface ErrorViewProps {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * When true, the "Volver al inicio" action points at `/dashboard` (the
   * authenticated home) instead of `/`. Used by the (app)/error.tsx.
   */
  homeHref?: string;
}

/**
 * Spanish-language error card with retry + go-home actions.
 * Logs a structured JSON line on mount (timestamp, route, message, digest;
 * stack attached only in development per AC).
 */
export function ErrorView({ error, reset, homeHref = '/' }: ErrorViewProps) {
  const t = useTranslations();
  const pathname = usePathname();

  useEffect(() => {
    logError({
      route: pathname,
      message: error.message,
      ...(error.digest ? { digest: error.digest } : {}),
      ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {}),
    });
  }, [error, pathname]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="bg-ifa-error/10 text-ifa-error rounded-ifa-pill flex size-16 items-center justify-center">
        <AlertTriangle className="size-8" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
          {t('errors.generic.title')}
        </h1>
        <p className="text-ifa-gray-700 text-sm">{t('errors.generic.description')}</p>
        {error.digest ? (
          <p className="text-ifa-gray-500 font-mono text-xs">
            {t('errors.generic.idLabel')}: {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          {t('common.buttons.retry')}
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>{t('common.buttons.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
