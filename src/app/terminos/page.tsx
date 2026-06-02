import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * `/terminos` — Phase L6 terms of use.
 *
 * Covers: account creation, subscription pricing + auto-renewal,
 * cancellation, refunds, acceptable use, IP, account deletion +
 * data export rights (link to /privacidad for the privacy specifics),
 * limitation of liability, governing law.
 *
 * Register: USTED throughout. NOT lawyer-reviewed; legal pass is
 * deferred to post-launch.
 *
 * Locked decisions baked in:
 *   - 30-day trial → $1/mo (Individual) or $20/mo (Business). USD.
 *     Card pays in USD via Stripe; user's bank handles FX.
 *   - 30-day soft-gate after trial/payment failure before hard cutoff.
 *   - Account deletion: soft-delete + 30-day grace (founder may
 *     extend via support before hard-delete cleanup job runs).
 *   - Data export available anytime from /configuracion.
 *   - Pricing may change with notice on next billing cycle.
 */

export async function generateMetadata() {
  const t = await getTranslations('legal.terms');
  return { title: t('title') };
}

export default async function TerminosPage() {
  const t = await getTranslations('legal.terms');
  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="text-ifa-navy-700 size-5" aria-hidden />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="text-ifa-gray-800 flex flex-col gap-6 text-sm leading-relaxed">
            <p className="text-ifa-gray-500 text-xs">{t('lastUpdated')}</p>

            <Section title={t('sections.acceptance.title')}>
              <p>{t('sections.acceptance.body')}</p>
            </Section>

            <Section title={t('sections.service.title')}>
              <p>{t('sections.service.body')}</p>
            </Section>

            <Section title={t('sections.account.title')}>
              <p>{t('sections.account.body')}</p>
            </Section>

            <Section title={t('sections.pricing.title')}>
              <p>{t('sections.pricing.intro')}</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>{t('sections.pricing.trial')}</li>
                <li>{t('sections.pricing.individual')}</li>
                <li>{t('sections.pricing.business')}</li>
                <li>{t('sections.pricing.currency')}</li>
                <li>{t('sections.pricing.changes')}</li>
              </ul>
            </Section>

            <Section title={t('sections.payment.title')}>
              <p>{t('sections.payment.body')}</p>
            </Section>

            <Section title={t('sections.cancellation.title')}>
              <p>{t('sections.cancellation.body')}</p>
            </Section>

            <Section title={t('sections.refunds.title')}>
              <p>{t('sections.refunds.body')}</p>
            </Section>

            <Section title={t('sections.deletion.title')}>
              <p>{t('sections.deletion.body')}</p>
            </Section>

            <Section title={t('sections.export.title')}>
              <p>{t('sections.export.body')}</p>
            </Section>

            <Section title={t('sections.acceptableUse.title')}>
              <p>{t('sections.acceptableUse.body')}</p>
            </Section>

            <Section title={t('sections.ip.title')}>
              <p>{t('sections.ip.body')}</p>
            </Section>

            <Section title={t('sections.liability.title')}>
              <p>{t('sections.liability.body')}</p>
            </Section>

            <Section title={t('sections.law.title')}>
              <p>{t('sections.law.body')}</p>
            </Section>

            <Section title={t('sections.changes.title')}>
              <p>{t('sections.changes.body')}</p>
            </Section>

            <Section title={t('sections.contact.title')}>
              <p>
                {t('sections.contact.body')}{' '}
                <Link href="/contacto" className="text-ifa-teal-700 hover:underline">
                  {t('sections.contact.cta')}
                </Link>
                .
              </p>
            </Section>

            <p className="text-ifa-gray-500 border-ifa-gray-200 border-t pt-4 text-xs leading-relaxed">
              <Link href="/privacidad" className="text-ifa-teal-700 hover:underline">
                {t('relatedPrivacy')}
              </Link>{' '}
              ·{' '}
              <Link href="/contacto" className="text-ifa-teal-700 hover:underline">
                {t('relatedContact')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ifa-navy-900 text-base font-semibold">{title}</h2>
      <div className="text-ifa-gray-800 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
