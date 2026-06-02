import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ManageBillingButtons } from '@/components/settings/manage-billing-buttons';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { computeGateState } from '@/lib/billing/gate';
import { isStripeConfigured } from '@/lib/billing/stripe';

/**
 * `/configuracion/facturacion` — Phase L5 billing detail page.
 *
 * Shows the user's full billing posture and the actions they can
 * take. Three big states drive what's displayed:
 *
 *   - TRIAL (with days remaining)  → "Suscribirme" CTA
 *   - ACTIVE / CANCELED / PAST_DUE → "Gestionar pago" → Stripe portal
 *   - EARLY_SUPPORTER              → status message, no action
 *
 * All money + date formatting goes through next-intl's locale-aware
 * `format()` so it stays consistent with the rest of the app.
 */

export async function generateMetadata() {
  const t = await getTranslations('settings.sections.billing');
  return { title: t('pageTitle') };
}

export default async function FacturacionPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const t = await getTranslations('settings.sections.billing');
  const format = await getFormatter();
  const gateState = computeGateState(profile);
  const stripeConfigured = isStripeConfigured();

  /*
   * The "manage" actions show the portal button when the user has any
   * subscription state Stripe knows about (ACTIVE / PAST_DUE / CANCELED).
   * For TRIAL / EXPIRED with no past subscription, they see the
   * subscribe button instead.
   */
  const hasSubscription =
    profile.subscriptionStatus === 'ACTIVE' ||
    profile.subscriptionStatus === 'PAST_DUE' ||
    profile.subscriptionStatus === 'CANCELED';

  /*
   * Pick the single most-relevant date to surface in the headline.
   * Precedence: currentPeriodEnd (when set) → trialEndsAt → none.
   */
  const headlineDate = profile.currentPeriodEnd ?? profile.trialEndsAt;
  const headlineDateFormatted = headlineDate
    ? format.dateTime(headlineDate, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const statusKey = `pageStatus.${gateState.reason}` as const;
  const days = 'daysRemaining' in gateState ? gateState.daysRemaining : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-ifa-gray-700 -ml-3 w-fit">
          <Link href="/configuracion">
            <ArrowLeft className="size-4" aria-hidden />
            <span>{t('backToSettings')}</span>
          </Link>
        </Button>
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
          {t('pageTitle')}
        </h1>
        <p className="text-ifa-gray-700 text-sm">{t('pageSubtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('currentPlanTitle')}</CardTitle>
          <CardDescription>
            {/*
             * `days` defaults to 0 when null so the i18n string can
             * reference it without throwing; strings that don't use
             * the placeholder simply ignore it. `headlineDate` only
             * substitutes into status keys that mention `{date}`.
             */}
            {t(statusKey, {
              days: days ?? 0,
              date: headlineDateFormatted ?? '',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ManageBillingButtons
            hasSubscription={hasSubscription}
            stripeConfigured={stripeConfigured}
          />
        </CardContent>
      </Card>

      <p className="text-ifa-gray-500 text-xs leading-relaxed">{t('legalFootnote')}</p>
    </div>
  );
}
