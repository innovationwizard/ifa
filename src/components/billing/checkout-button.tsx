'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ProfileType } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface CheckoutButtonProps {
  profileType: ProfileType;
  /** When false, Stripe isn't wired up and the button shows a "Pronto" state. */
  stripeConfigured: boolean;
}

/**
 * Plan CTA. POSTs to /api/stripe/checkout and navigates the browser to
 * the returned session URL. Handles three non-happy responses:
 *   - 401 unauthenticated → bounce to /ingresar?next=/precios
 *   - 503 billing_not_configured → inline "not ready" message (shown as
 *     a disabled, softened button label)
 *   - anything else → inline generic error
 */
export function CheckoutButton({ profileType, stripeConfigured }: CheckoutButtonProps) {
  const t = useTranslations('billing.pricing');
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'not_ready' | 'error'>(
    stripeConfigured ? 'idle' : 'not_ready',
  );

  async function onClick(): Promise<void> {
    setState('loading');
    try {
      const planKey = profileType === 'BUSINESS' ? 'business' : 'individual';
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });

      if (response.status === 401) {
        router.push('/ingresar?next=/precios');
        return;
      }
      if (response.status === 503) {
        setState('not_ready');
        return;
      }
      if (!response.ok) {
        setState('error');
        return;
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        setState('error');
        return;
      }
      window.location.href = payload.url;
    } catch {
      setState('error');
    }
  }

  if (state === 'not_ready') {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled variant="outline" className="w-full">
          {t('ctaNotReady')}
        </Button>
        <p className="text-ifa-gray-500 text-xs">{t('notReadyMessage')}</p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      className="w-full"
      disabled={state === 'loading'}
      onClick={() => {
        void onClick();
      }}
    >
      {state === 'loading' ? t('ctaBusy') : t('ctaUpgrade')}
    </Button>
  );
}
