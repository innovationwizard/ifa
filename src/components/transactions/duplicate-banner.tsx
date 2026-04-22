'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Copy, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dismissDuplicateAction } from '@/app/(app)/transacciones/[id]/actions';

interface DuplicateBannerProps {
  transactionId: string;
  possibleDuplicateOf: string;
}

/**
 * Banner shown on `/transacciones/[id]` when the row carries an
 * active `metadata.possibleDuplicateOf` link (S-3.11). Two
 * actions: jump to the other side, or dismiss the flag.
 *
 * Dismiss uses a server action that writes
 * `metadata.duplicateDismissed = true` and revalidates both the
 * detail page + the feed so the badge disappears on the user's
 * next view without a manual refresh.
 */
export function DuplicateBanner({ transactionId, possibleDuplicateOf }: DuplicateBannerProps) {
  const t = useTranslations('transactionDetail.duplicate');
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function onDismiss(): void {
    setFailed(false);
    startTransition(async () => {
      const result = await dismissDuplicateAction({ id: transactionId });
      if (!result.ok) setFailed(true);
    });
  }

  return (
    <Alert className="bg-ifa-gold-100 border-ifa-gold-400">
      <AlertTitle className="flex items-center gap-2">
        <Copy className="size-4" aria-hidden />
        {t('title')}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span className="text-ifa-gray-700 text-xs leading-relaxed">{t('body')}</span>
        {failed && (
          <span className="text-destructive flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3" aria-hidden />
            {t('dismissFailed')}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/transacciones/${possibleDuplicateOf}`}>{t('viewOther')}</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={isPending}>
            {isPending ? t('dismissing') : t('dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
