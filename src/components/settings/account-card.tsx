'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  requestEmailChange,
  requestGoogleLink,
  requestGoogleUnlink,
} from '@/app/(app)/configuracion/actions';

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
   * L3.5.5 adds the connect-Google flow when this is false; L3.5.6 will
   * add disconnect when this is true.
   */
  googleLinked: boolean;
  /**
   * L3.5.5: optional error code surfaced from `/configuracion` after the
   * confirmGoogleLink action failed and redirected back with
   * `?linkError=<key>`. Renders an inline alert near the Google row.
   */
  linkError?: string | null;
  /**
   * L3.5.5: when `/configuracion?linked=google` came back from the
   * OAuth callback, surface a success banner near the Google row.
   * The MethodRow status already shows "Conectado" — this is the
   * "just happened" affordance.
   */
  linkedJustNow?: boolean;
  /**
   * L3.5.6: total identity count (e.g. `user.identities.length`). When
   * Google is the user's ONLY identity, disconnect must be hidden — the
   * Supabase API refuses to unlink the last identity anyway, but the
   * UI should not even surface the action.
   */
  identityCount: number;
  /**
   * L3.5.6: optional error code surfaced from `/configuracion?unlinkError=`.
   */
  unlinkError?: string | null;
  /**
   * L3.5.6: surface "Desconectado" banner after `/configuracion?unlinked=google`.
   */
  unlinkedJustNow?: boolean;
}

type EmailStatus = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };
type LinkStatus = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };
type UnlinkStatus = { kind: 'idle' } | { kind: 'link-sent' } | { kind: 'error'; errorKey: string };

export function AccountCard({
  currentEmail,
  googleLinked,
  linkError = null,
  linkedJustNow = false,
  identityCount,
  unlinkError = null,
  unlinkedJustNow = false,
}: AccountCardProps) {
  const t = useTranslations('settings.account.email');
  const tMethods = useTranslations('settings.account.signInMethods');
  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<EmailStatus>({ kind: 'idle' });
  const [isSending, startSending] = useTransition();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>({ kind: 'idle' });
  const [isLinking, startLinking] = useTransition();
  const [unlinkStatus, setUnlinkStatus] = useState<UnlinkStatus>({ kind: 'idle' });
  const [isUnlinking, startUnlinking] = useTransition();

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

  function handleLinkGoogle(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    startLinking(async () => {
      const result = await requestGoogleLink();
      if (result.ok) {
        setLinkStatus({ kind: 'link-sent' });
      } else {
        setLinkStatus({
          kind: 'error',
          errorKey: result.errorKey ?? 'unknown',
        });
      }
    });
  }

  function handleUnlinkGoogle(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    startUnlinking(async () => {
      const result = await requestGoogleUnlink();
      if (result.ok) {
        setUnlinkStatus({ kind: 'link-sent' });
      } else {
        setUnlinkStatus({
          kind: 'error',
          errorKey: result.errorKey ?? 'unknown',
        });
      }
    });
  }

  /*
   * L3.5.6 gate: disconnect is offered ONLY when Google is linked AND
   * the user has at least one other identity. Without another identity
   * they would be locked out — Supabase refuses to unlink the last,
   * but our UI must not even offer the option.
   */
  const canDisconnectGoogle = googleLinked && identityCount >= 2;

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

        {!googleLinked && linkStatus.kind === 'link-sent' ? (
          /*
           * L3.5.5 step-1 success: magic link is on its way to the
           * user's CURRENT email. They click it → land on
           * /configuracion/confirmar-conectar-google → confirm →
           * server-redirected to Google → /auth/callback →
           * /configuracion?linked=google.
           */
          <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
            <Mail className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-ifa-navy-900 text-sm font-medium">
                {tMethods('google.connect.linkSentTitle')}
              </p>
              <p className="text-ifa-gray-700 text-xs leading-relaxed">
                {tMethods('google.connect.linkSentBody', { email: currentEmail })}
              </p>
            </div>
          </div>
        ) : !googleLinked ? (
          <form className="flex flex-col gap-2" onSubmit={handleLinkGoogle}>
            <p className="text-ifa-gray-500 text-xs">{tMethods('google.connect.intro')}</p>
            {linkStatus.kind === 'error' && (
              <p className="text-xs text-red-700">
                {tMethods(`google.connect.error.${linkStatus.errorKey}`)}
              </p>
            )}
            {linkError && (
              <p className="text-xs text-red-700">
                {tMethods(`google.connect.error.${linkError}`)}
              </p>
            )}
            <div className="flex sm:justify-end">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isLinking}
                className="w-full sm:w-auto"
              >
                {isLinking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>{tMethods('google.connect.sending')}</span>
                  </>
                ) : (
                  tMethods('google.connect.cta')
                )}
              </Button>
            </div>
          </form>
        ) : (
          /*
           * googleLinked === true. Three sub-paths:
           *
           *   - linkedJustNow:    success banner after OAuth round trip.
           *   - unlinkedJustNow:  shouldn't fire here (googleLinked is
           *                       now false), kept defensively.
           *   - last identity:    show explainer instead of button.
           *   - normal state:     "Desconectar Google" form.
           */
          <>
            {linkedJustNow && (
              <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
                <CheckCircle2 className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
                <p className="text-ifa-navy-900 text-sm font-medium">
                  {tMethods('google.linkedJustNow')}
                </p>
              </div>
            )}
            {unlinkStatus.kind === 'link-sent' ? (
              <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
                <Mail className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="text-ifa-navy-900 text-sm font-medium">
                    {tMethods('google.disconnect.linkSentTitle')}
                  </p>
                  <p className="text-ifa-gray-700 text-xs leading-relaxed">
                    {tMethods('google.disconnect.linkSentBody', { email: currentEmail })}
                  </p>
                </div>
              </div>
            ) : !canDisconnectGoogle ? (
              <p className="text-ifa-gray-500 text-xs">
                {tMethods('google.disconnect.lastIdentityHint')}
              </p>
            ) : (
              <form className="flex flex-col gap-2" onSubmit={handleUnlinkGoogle}>
                <p className="text-ifa-gray-500 text-xs">{tMethods('google.disconnect.intro')}</p>
                {unlinkStatus.kind === 'error' && (
                  <p className="text-xs text-red-700">
                    {tMethods(`google.disconnect.error.${unlinkStatus.errorKey}`)}
                  </p>
                )}
                {unlinkError && (
                  <p className="text-xs text-red-700">
                    {tMethods(`google.disconnect.error.${unlinkError}`)}
                  </p>
                )}
                <div className="flex sm:justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={isUnlinking}
                    className="w-full sm:w-auto"
                  >
                    {isUnlinking ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        <span>{tMethods('google.disconnect.sending')}</span>
                      </>
                    ) : (
                      tMethods('google.disconnect.cta')
                    )}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
        {unlinkedJustNow && !googleLinked && (
          /*
           * After /configuracion?unlinked=google: googleLinked is now
           * false (the MethodRow shows "No conectado"). Surface the
           * "just disconnected" affordance above the Connect button.
           */
          <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-start gap-3 rounded-lg border p-4">
            <CheckCircle2 className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="text-ifa-navy-900 text-sm font-medium">
              {tMethods('google.unlinkedJustNow')}
            </p>
          </div>
        )}
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
