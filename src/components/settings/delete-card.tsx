'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestAccountDeletion } from '@/app/(app)/configuracion/actions';

/**
 * `<DeleteCard>` — Phase L3.7 "Eliminar mi cuenta" kick-off.
 *
 * Step 1 of the bank-grade deletion flow. The user clicks "Empezar"
 * to receive a magic link on their current email. Clicking that link
 * lands them on the confirm page where they type the verification
 * phrase to actually trigger the deletion.
 *
 * Visual treatment: red iconography + destructive button variant +
 * up-front warning copy. The page-level section header already says
 * "Eliminar mi cuenta" so this card focuses on the warning + action.
 */

type Status = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };

export function DeleteCard() {
  const t = useTranslations('settings.sections.delete');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  function handleStart(): void {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      const result = await requestAccountDeletion();
      if (result.ok) {
        setStatus({ kind: 'link-sent' });
        return;
      }
      setStatus({ kind: 'error', errorKey: result.errorKey ?? 'unknown' });
    });
  }

  if (status.kind === 'link-sent') {
    return (
      <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
        <Mail className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-ifa-navy-900 text-sm font-medium">{t('linkSentTitle')}</p>
          <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('linkSentBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-ifa-navy-900 text-sm font-medium">{t('warningTitle')}</p>
          <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('warningBody')}</p>
        </div>
      </div>

      {status.kind === 'error' && (
        <p className="text-xs text-red-700">{t(`error.${status.errorKey}`)}</p>
      )}

      <div className="flex sm:justify-end">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleStart}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{t('sending')}</span>
            </>
          ) : (
            t('cta')
          )}
        </Button>
      </div>
    </div>
  );
}
