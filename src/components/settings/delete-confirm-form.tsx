'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmAccountDeletion } from '@/app/(app)/configuracion/actions';

/**
 * Type-to-confirm form for the Phase L3.7 account deletion confirm page.
 *
 * Why client-side: the submit button should disable until the user
 * types "ELIMINAR MI CUENTA" exactly. That live UX requires React state.
 * The actual security check is server-side in `confirmAccountDeletion` —
 * the disabled attribute is purely UX, not a security boundary.
 *
 * On success the action returns ok and we redirect to /ingresar?deleted=1
 * for the goodbye page. On failure we surface the error key and let the
 * user retry without leaving the page.
 */

const REQUIRED_PHRASE = 'ELIMINAR MI CUENTA';

type Status = { kind: 'idle' } | { kind: 'error'; errorKey: string };

export function DeleteConfirmForm() {
  const t = useTranslations('settings.sections.delete.confirmPage');
  const router = useRouter();
  const [phrase, setPhrase] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isSubmitting, startSubmitting] = useTransition();

  const phraseMatches = phrase.trim() === REQUIRED_PHRASE;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!phraseMatches) return; // client-side guard mirrors server validation
    const formData = new FormData(e.currentTarget);
    startSubmitting(async () => {
      const result = await confirmAccountDeletion(formData);
      if (result.ok) {
        /*
         * Hard navigation rather than router.push — the auth cookies
         * have been cleared server-side, and we want a full page load
         * to reset any client-cached app state. /ingresar?deleted=1
         * is the goodbye screen.
         */
        window.location.assign('/ingresar?deleted=1');
        return;
      }
      setStatus({ kind: 'error', errorKey: result.errorKey ?? 'unknown' });
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmationPhrase" className="text-ifa-navy-900 text-sm font-medium">
          {t('inputLabel', { phrase: REQUIRED_PHRASE })}
        </label>
        <input
          id="confirmationPhrase"
          name="confirmationPhrase"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value);
            if (status.kind !== 'idle') setStatus({ kind: 'idle' });
          }}
          className="border-ifa-gray-300 rounded-md border bg-white px-3 py-2 font-mono text-sm focus:border-red-700 focus:ring-2 focus:ring-red-100 focus:outline-none"
        />
        <p className="text-ifa-gray-500 text-xs">{t('inputHint')}</p>
      </div>

      {status.kind === 'error' && (
        <p className="text-xs text-red-700">{t(`error.${status.errorKey}`)}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push('/configuracion')}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {t('cancelCta')}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={!phraseMatches || isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{t('confirmingCta')}</span>
            </>
          ) : (
            t('confirmCta')
          )}
        </Button>
      </div>
    </form>
  );
}
