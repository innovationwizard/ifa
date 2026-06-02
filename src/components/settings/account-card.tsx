'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestEmailChange } from '@/app/(app)/configuracion/actions';

/**
 * `<AccountCard>` — Phase L3.4 email-change form (and L3.5 password
 * section to follow).
 *
 * Email change is the bank-grade two-step flow locked by
 * [ADR-003](../../../docs_operations/_DECISIONS.md#adr-003). This
 * component owns ONLY step 1: the user types the new email and
 * submits; the server sends a magic link to their CURRENT email.
 * Step 2 (clicking the magic link + confirmation page) lives at
 * `/configuracion/confirmar-cambio-correo` (separate route).
 *
 * UI states:
 *   - idle      — form ready
 *   - sending   — server action in flight
 *   - link-sent — success message tells the user to check their
 *                 current email for the link
 *   - error     — destructive copy under the form
 */

export interface AccountCardProps {
  currentEmail: string;
}

type EmailStatus = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };

export function AccountCard({ currentEmail }: AccountCardProps) {
  const t = useTranslations('settings.account.email');
  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<EmailStatus>({ kind: 'idle' });
  const [isSending, startSending] = useTransition();

  function handleEdit(v: string): void {
    setNewEmail(v);
    if (status.kind !== 'idle') setStatus({ kind: 'idle' });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSending(async () => {
      const result = await requestEmailChange(formData);
      if (result.ok) {
        setStatus({ kind: 'link-sent' });
      } else {
        setStatus({
          kind: 'error',
          errorKey: result.errorKey ?? 'unknown',
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h3 className="text-ifa-navy-900 text-sm font-medium">{t('sectionTitle')}</h3>
          <p className="text-ifa-gray-700 text-xs">{t('currentEmail', { email: currentEmail })}</p>
        </header>

        {status.kind === 'link-sent' ? (
          /*
           * Success state: the magic link is on its way to the
           * CURRENT email. The user clicks that link → lands on the
           * confirmation page → confirms there → Supabase emails the
           * NEW address for final confirmation.
           */
          <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
            <Mail className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-ifa-navy-900 text-sm font-medium">{t('linkSentTitle')}</p>
              <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('linkSentBody')}</p>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="newEmail" className="text-ifa-navy-900 text-sm font-medium">
                {t('newEmailLabel')}
              </label>
              <input
                id="newEmail"
                name="newEmail"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={newEmail}
                onChange={(e) => handleEdit(e.target.value)}
                className="border-ifa-gray-300 focus:border-ifa-teal-600 focus:ring-ifa-teal-100 rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <p className="text-ifa-gray-500 text-xs">{t('flowHint')}</p>
            </div>

            {status.kind === 'error' && (
              <p className="text-xs text-red-700">{t(`error.${status.errorKey}`)}</p>
            )}

            <div className="flex sm:justify-end">
              <Button type="submit" size="sm" disabled={isSending} className="w-full sm:w-auto">
                {isSending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>{t('sending')}</span>
                  </>
                ) : (
                  t('sendLink')
                )}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/*
       * Password section — Phase L3.5 will replace this placeholder
       * with the branded password-reset trigger. Kept inline so the
       * Cuenta section card layout stays whole.
       */}
      <section className="border-ifa-gray-200 flex flex-col gap-2 border-t pt-4">
        <h3 className="text-ifa-navy-900 text-sm font-medium">{t('passwordSectionTitle')}</h3>
        <p className="text-ifa-gray-700 text-xs">{t('passwordPlaceholder')}</p>
      </section>
    </div>
  );
}
