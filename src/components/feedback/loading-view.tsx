import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

/**
 * Default loading UI rendered by App Router loading.tsx boundaries.
 * Minimal on purpose — actual page content should typically ship a
 * more specific skeleton rather than falling back to this generic view.
 */
export function LoadingView() {
  const t = useTranslations('common.states');
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-ifa-gray-700 flex min-h-dvh items-center justify-center gap-3 text-sm"
    >
      <Loader2 className="text-ifa-teal-600 size-5 animate-spin" aria-hidden />
      <span>{t('loading')}</span>
    </div>
  );
}
