import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Sparkles } from 'lucide-react';
import type { GateState } from '@/lib/billing/gate';

interface PaywallBannerProps {
  state: GateState;
}

/**
 * Top-of-page banner shown on every authenticated route when the user
 * is in a non-access billing state OR close to trial expiry. Nothing
 * renders when the state is pure `access` with more than 5 trial days
 * left, or when the user is an EARLY_SUPPORTER.
 *
 * The banner never blocks interaction — it's a nag strip with a link
 * to /precios. The hard-gate redirect happens at the layout level;
 * if a user somehow lands here in a hard_gate state the banner will
 * still render defensively.
 */
export async function PaywallBanner({ state }: PaywallBannerProps) {
  const t = await getTranslations('billing.gate');

  if (state.reason === 'early_supporter') {
    return (
      <div className="bg-ifa-teal-100 text-ifa-teal-600 flex items-center justify-center gap-2 px-4 py-2 text-xs">
        <Sparkles className="size-3.5" aria-hidden />
        <span>{t('earlySupporterBadge')}</span>
      </div>
    );
  }

  if (state.kind === 'access') {
    if (state.reason !== 'trial_active') return null;
    /*
     * Only surface the trial countdown in the final stretch — earlier
     * than that, the banner is noise. Threshold: last 5 days.
     */
    if (state.daysRemaining === null || state.daysRemaining > 5) return null;
    const message =
      state.daysRemaining === 0
        ? t('trialLastDay')
        : t('trialEndsIn', { days: state.daysRemaining });
    return (
      <div className="bg-ifa-gold-100 text-ifa-navy-900 flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs">
        <span>{message}</span>
        <Link href="/precios" className="underline underline-offset-2">
          {t('softGateCta')}
        </Link>
      </div>
    );
  }

  if (state.kind === 'soft_gate') {
    return (
      <div className="bg-ifa-gold-100 text-ifa-navy-900 flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs">
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="font-medium">{t('softGateTitle')}</span>
        <span>{t('softGateBody', { days: state.daysRemaining ?? 0 })}</span>
        <Link href="/precios" className="underline underline-offset-2">
          {t('softGateCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-destructive text-destructive-foreground flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs">
      <AlertTriangle className="size-3.5" aria-hidden />
      <span className="font-medium">{t('hardGateTitle')}</span>
      <Link href="/precios" className="underline underline-offset-2">
        {t('hardGateCta')}
      </Link>
    </div>
  );
}
