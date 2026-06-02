import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * `/privacidad` — Phase L6 privacy notice.
 *
 * Honest description of every data flow IFA operates as of the
 * friends-and-family beta. NOT lawyer-reviewed; that pass is
 * deferred to post-launch per the PLAN's risk note. The page must
 * accurately reflect what the app actually does — adding processors
 * later requires updating this page.
 *
 * Register: USTED throughout (founder decision 2026-06-02 — legal
 * pages adopt USTED while the rest of the app uses tú).
 *
 * Processors enumerated:
 *   - Supabase (auth + database hosting)
 *   - Vercel (application hosting + serverless functions)
 *   - Stripe (payment processing — card data never touches our servers)
 *   - Resend / AWS SES (transactional email — when configured)
 *   - Anthropic / Claude (AI extraction of bank statements + transaction
 *     categorization)
 *   - Google (OAuth sign-in when the user chooses it)
 */

export async function generateMetadata() {
  const t = await getTranslations('legal.privacy');
  return { title: t('title') };
}

export default async function PrivacidadPage() {
  const t = await getTranslations('legal.privacy');
  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-ifa-navy-700 size-5" aria-hidden />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="text-ifa-gray-800 flex flex-col gap-6 text-sm leading-relaxed">
            <p className="text-ifa-gray-500 text-xs">{t('lastUpdated')}</p>

            <Section title={t('sections.summary.title')}>
              <p>{t('sections.summary.body')}</p>
            </Section>

            <Section title={t('sections.dataWeCollect.title')}>
              <ul className="ml-5 list-disc space-y-2">
                <li>{t('sections.dataWeCollect.account')}</li>
                <li>{t('sections.dataWeCollect.profile')}</li>
                <li>{t('sections.dataWeCollect.transactions')}</li>
                <li>{t('sections.dataWeCollect.statements')}</li>
                <li>{t('sections.dataWeCollect.usage')}</li>
              </ul>
            </Section>

            <Section title={t('sections.processors.title')}>
              <p>{t('sections.processors.intro')}</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Supabase</strong> — {t('sections.processors.supabase')}
                </li>
                <li>
                  <strong>Vercel</strong> — {t('sections.processors.vercel')}
                </li>
                <li>
                  <strong>Stripe</strong> — {t('sections.processors.stripe')}
                </li>
                <li>
                  <strong>Resend / AWS SES</strong> — {t('sections.processors.email')}
                </li>
                <li>
                  <strong>Anthropic</strong> — {t('sections.processors.anthropic')}
                </li>
                <li>
                  <strong>Google</strong> — {t('sections.processors.google')}
                </li>
              </ul>
            </Section>

            <Section title={t('sections.rights.title')}>
              <p>{t('sections.rights.intro')}</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>{t('sections.rights.export')}</li>
                <li>{t('sections.rights.delete')}</li>
                <li>{t('sections.rights.correct')}</li>
                <li>{t('sections.rights.unlink')}</li>
              </ul>
            </Section>

            <Section title={t('sections.retention.title')}>
              <p>{t('sections.retention.body')}</p>
            </Section>

            <Section title={t('sections.security.title')}>
              <p>{t('sections.security.body')}</p>
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
              <Link href="/terminos" className="text-ifa-teal-700 hover:underline">
                {t('relatedTerms')}
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
