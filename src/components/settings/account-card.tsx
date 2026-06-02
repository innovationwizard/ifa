'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
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
  /**
   * L3.5 read-only display: whether the user has Google OAuth linked.
   * Page derives this from `user.identities.some(i => i.provider === 'google')`.
   * Connect/disconnect actions land in L3.5.5/L3.5.6.
   */
  googleLinked: boolean;
}

type EmailStatus = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };

export function AccountCard({ currentEmail, googleLinked }: AccountCardProps) {
  const t = useTranslations('settings.account.email');
  const tMethods = useTranslations('settings.account.signInMethods');
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
       * Sign-in methods (Phase L3.5 read-only display). IFA's auth
       * is passwordless — magic-link is always present; Google OAuth
       * is opt-in via Sign-In With Google. L3.5.5/L3.5.6 add the
       * connect/disconnect mutations behind ADR-003 re-auth gates.
       */}
      <section className="border-ifa-gray-200 flex flex-col gap-3 border-t pt-4">
        <header className="flex flex-col gap-1">
          <h3 className="text-ifa-navy-900 text-sm font-medium">{tMethods('sectionTitle')}</h3>
          <p className="text-ifa-gray-700 text-xs">{tMethods('description')}</p>
        </header>

        <ul className="divide-ifa-gray-200 divide-y" aria-label={tMethods('listLabel')}>
          {/*
           * Magic-link via the user's current email — always
           * available because Supabase passwordless auth uses
           * the email-OTP provider for every account.
           */}
          <MethodRow
            label={tMethods('magicLink.label')}
            detail={tMethods('magicLink.detail', { email: currentEmail })}
            statusLabel={tMethods('alwaysOn')}
            statusKind="on"
          />
          <MethodRow
            label={tMethods('google.label')}
            detail={tMethods('google.detail')}
            statusLabel={
              googleLinked ? tMethods('google.statusConnected') : tMethods('google.statusOff')
            }
            statusKind={googleLinked ? 'on' : 'off'}
          />
        </ul>

        <p className="text-ifa-gray-500 text-xs">{tMethods('soonAction')}</p>
      </section>
    </div>
  );
}

function MethodRow({
  label,
  detail,
  statusLabel,
  statusKind,
}: {
  label: string;
  detail: string;
  statusLabel: string;
  statusKind: 'on' | 'off';
}) {
  const Icon = statusKind === 'on' ? CheckCircle2 : XCircle;
  const iconColor = statusKind === 'on' ? 'text-ifa-teal-700' : 'text-ifa-gray-500';
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={`${iconColor} mt-0.5 size-4 shrink-0`} aria-hidden />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-ifa-navy-900 text-sm font-medium">{label}</span>
        <span className="text-ifa-gray-700 text-xs">{detail}</span>
      </div>
      <span
        className={`shrink-0 text-xs font-medium tracking-wide uppercase ${
          statusKind === 'on' ? 'text-ifa-teal-700' : 'text-ifa-gray-500'
        }`}
      >
        {statusLabel}
      </span>
    </li>
  );
}
