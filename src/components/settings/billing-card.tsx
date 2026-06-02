import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GateState } from '@/lib/billing/gate';

/**
 * `<BillingCard>` — Phase L5 billing summary on /configuracion.
 *
 * Server-renderable (no `'use client'`) — it just reads the gate
 * state from the page-level fetch and formats it. All interactive
 * actions (subscribe, manage card) live on the dedicated
 * `/configuracion/facturacion` sub-page; this card is a teaser +
 * link.
 *
 * Status copy is keyed off `gateState.reason` so every distinct
 * billing posture (trial countdown, active, canceled-in-grace,
 * past-due, expired) gets accurate wording. The day count, when
 * present, is formatted inline.
 */

export interface BillingCardProps {
  gateState: GateState;
}

export function BillingCard({ gateState }: BillingCardProps) {
  const t = useTranslations('settings.sections.billing');

  /*
   * Reason → translation key + optional day-count flag. The
   * `daysRemaining` value comes from the GateState; we pass it as a
   * named placeholder so the i18n strings stay grammatical for
   * 0/1/many days.
   */
  const statusKey = `status.${gateState.reason}` as const;
  const days = 'daysRemaining' in gateState ? gateState.daysRemaining : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-ifa-gray-200 bg-ifa-gray-50 flex items-start gap-3 rounded-lg border p-4">
        <CreditCard className="text-ifa-navy-700 mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-ifa-navy-900 text-sm font-medium">
            {/*
             * next-intl's `t()` only fills in named placeholders that
             * the string actually references; passing `days` when the
             * string doesn't use it is a no-op. Some reasons (active,
             * early_supporter) have no countdown — those strings just
             * ignore `days`.
             */}
            {days !== null ? t(statusKey, { days }) : t(statusKey, { days: 0 })}
          </p>
        </div>
      </div>

      <div className="flex sm:justify-end">
        <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
          <Link href="/configuracion/facturacion">
            <span>{t('manageCta')}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
