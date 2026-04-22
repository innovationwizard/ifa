import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';
import { Logo } from '@/components/branding/logo';
import { CheckoutButton } from '@/components/billing/checkout-button';
import { isStripeConfigured } from '@/lib/billing/stripe';
import { PLAN_BUSINESS, PLAN_INDIVIDUAL, type PlanDescriptor } from '@/lib/billing/pricing';

export async function generateMetadata() {
  const t = await getTranslations('billing.pricing');
  return { title: t('title') };
}

/**
 * /precios — public pricing page.
 *
 * Anonymous-accessible so visitors can see pricing before signing up.
 * The CheckoutButton handles the auth jump: unauthenticated users POSTing
 * to /api/stripe/checkout get a 401 and are bounced to /ingresar.
 *
 * Stripe-optional: when Stripe isn't configured, the CTA renders as a
 * "Pronto" state with an inline explanation. The rest of the page is
 * identical so the pricing story doesn't leak implementation state.
 */
export default async function PreciosPage() {
  const t = await getTranslations('billing.pricing');
  const stripeReady = isStripeConfigured();

  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <Logo variant="icon" iconSize={40} className="text-ifa-navy-800" />
          <h1 className="text-ifa-navy-900 text-3xl font-semibold tracking-tight md:text-4xl">
            {t('title')}
          </h1>
          <p className="text-ifa-gray-700 max-w-xl text-base">{t('subtitle')}</p>
          <span className="bg-ifa-teal-100 text-ifa-teal-700 rounded-full px-3 py-1 text-xs font-medium">
            {t('trialBadge')}
          </span>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <PlanCard plan={PLAN_INDIVIDUAL} stripeConfigured={stripeReady} />
          <PlanCard plan={PLAN_BUSINESS} stripeConfigured={stripeReady} />
        </div>

        <footer className="flex flex-col items-center gap-2 text-center">
          <p className="text-ifa-gray-500 text-sm">{t('priceChangeNotice')}</p>
          <Link
            href="/terminos"
            className="text-ifa-teal-600 text-sm underline-offset-2 hover:underline"
          >
            {t('termsLinkLabel')}
          </Link>
        </footer>
      </div>
    </main>
  );
}

interface PlanCardProps {
  plan: PlanDescriptor;
  stripeConfigured: boolean;
}

async function PlanCard({ plan, stripeConfigured }: PlanCardProps) {
  const t = await getTranslations('billing');
  const planKey = plan.profileType === 'BUSINESS' ? 'business' : 'individual';
  return (
    <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-ifa-navy-900 text-xl font-semibold">{t(`plans.${planKey}.name`)}</h2>
        <p className="text-ifa-gray-600 text-sm">{t(`plans.${planKey}.tagline`)}</p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-ifa-navy-900 text-4xl font-semibold tabular-nums">
          {t('pricing.priceFormat', { amount: plan.priceUsd })}
        </span>
        <span className="text-ifa-gray-500 text-sm">
          {t('pricing.usd')} · {t('pricing.perMonth')}
        </span>
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        <FeatureLine>{t(`plans.${planKey}.features.one`)}</FeatureLine>
        <FeatureLine>{t(`plans.${planKey}.features.two`)}</FeatureLine>
        <FeatureLine>{t(`plans.${planKey}.features.three`)}</FeatureLine>
        <FeatureLine>{t(`plans.${planKey}.features.four`)}</FeatureLine>
      </ul>

      <CheckoutButton profileType={plan.profileType} stripeConfigured={stripeConfigured} />
    </div>
  );
}

function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="text-ifa-teal-600 mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-ifa-gray-700">{children}</span>
    </li>
  );
}
