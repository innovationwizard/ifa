'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Phase L5 — interactive billing actions on /configuracion/facturacion.
 *
 * Two flows:
 *   - "Suscribirme" → POST /api/stripe/checkout → redirect to Stripe.
 *   - "Gestionar pago" → POST /api/stripe/portal → redirect to portal.
 *
 * Mirrors `<CheckoutButton>`'s pattern (handles 401 / 503 / generic
 * error). Lives in `src/components/settings/` because it's specific
 * to the facturacion page — `<CheckoutButton>` on /precios is the
 * marketing-page CTA with different copy and disabled state.
 */

interface ManageBillingButtonsProps {
  /** True when the user has an active subscription (subscriptionStatus = ACTIVE/PAST_DUE/CANCELED). */
  hasSubscription: boolean;
  /** True when Stripe is configured in env — false means /api/stripe/* returns 503. */
  stripeConfigured: boolean;
}

type ActionState = 'idle' | 'loading' | 'not_ready' | 'error';

export function ManageBillingButtons({
  hasSubscription,
  stripeConfigured,
}: ManageBillingButtonsProps) {
  const t = useTranslations('settings.sections.billing.manage');
  const router = useRouter();
  const [checkoutState, setCheckoutState] = useState<ActionState>(
    stripeConfigured ? 'idle' : 'not_ready',
  );
  const [portalState, setPortalState] = useState<ActionState>(
    stripeConfigured ? 'idle' : 'not_ready',
  );
  const [isCheckoutPending, startCheckout] = useTransition();
  const [isPortalPending, startPortal] = useTransition();

  function handleCheckout(): void {
    setCheckoutState('idle');
    startCheckout(async () => {
      try {
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan: 'individual' }),
        });
        if (response.status === 401) {
          router.push('/ingresar?next=/configuracion/facturacion');
          return;
        }
        if (response.status === 503) {
          setCheckoutState('not_ready');
          return;
        }
        if (!response.ok) {
          setCheckoutState('error');
          return;
        }
        const data = (await response.json()) as { url?: string };
        if (!data.url) {
          setCheckoutState('error');
          return;
        }
        window.location.assign(data.url);
      } catch {
        setCheckoutState('error');
      }
    });
  }

  function handlePortal(): void {
    setPortalState('idle');
    startPortal(async () => {
      try {
        const response = await fetch('/api/stripe/portal', { method: 'POST' });
        if (response.status === 401) {
          router.push('/ingresar?next=/configuracion/facturacion');
          return;
        }
        if (response.status === 503) {
          setPortalState('not_ready');
          return;
        }
        if (!response.ok) {
          setPortalState('error');
          return;
        }
        const data = (await response.json()) as { url?: string };
        if (!data.url) {
          setPortalState('error');
          return;
        }
        window.location.assign(data.url);
      } catch {
        setPortalState('error');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {hasSubscription ? (
        <>
          <p className="text-ifa-gray-700 text-sm">{t('portalIntro')}</p>
          {portalState === 'error' && <p className="text-xs text-red-700">{t('error.generic')}</p>}
          {portalState === 'not_ready' && (
            <p className="text-xs text-amber-700">{t('error.notReady')}</p>
          )}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handlePortal}
              disabled={isPortalPending || portalState === 'not_ready'}
              className="w-full sm:w-auto"
            >
              {isPortalPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>{t('opening')}</span>
                </>
              ) : (
                <>
                  <ExternalLink className="size-4" aria-hidden />
                  <span>{t('portalCta')}</span>
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-ifa-gray-700 text-sm">{t('subscribeIntro')}</p>
          {checkoutState === 'error' && (
            <p className="text-xs text-red-700">{t('error.generic')}</p>
          )}
          {checkoutState === 'not_ready' && (
            <p className="text-xs text-amber-700">{t('error.notReady')}</p>
          )}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleCheckout}
              disabled={isCheckoutPending || checkoutState === 'not_ready'}
              className="w-full sm:w-auto"
            >
              {isCheckoutPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>{t('opening')}</span>
                </>
              ) : (
                <>
                  <CreditCard className="size-4" aria-hidden />
                  <span>{t('subscribeCta')}</span>
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
