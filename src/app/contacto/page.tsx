import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Clock, Mail, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * `/contacto` — Phase L6 support page.
 *
 * Single contact channel: founder's email
 * (jorgeluiscontrerasherrera@gmail.com) for the friends-and-family
 * beta. Swap to a branded inbox before public launch (L7).
 *
 * Copy register: USTED (formal), consistent with /privacidad and
 * /terminos. The rest of the app uses tú, but legal + support pages
 * adopt USTED per founder decision 2026-06-02.
 *
 * Linked from: /privacidad, /terminos footer; /ingresar footer copy;
 * CSV-import wizard's failure alert ("¿no funcionó tu banco?").
 */

export async function generateMetadata() {
  const t = await getTranslations('legal.contact');
  return { title: t('title') };
}

const SUPPORT_EMAIL = 'jorgeluiscontrerasherrera@gmail.com';

export default async function ContactoPage() {
  const t = await getTranslations('legal.contact');
  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="text-ifa-navy-700 size-5" aria-hidden />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <section className="flex items-start gap-3">
              <Mail className="text-ifa-teal-700 mt-1 size-5 shrink-0" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="text-ifa-navy-900 text-sm font-medium">{t('emailLabel')}</p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-ifa-teal-700 text-sm hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('emailHelp')}</p>
              </div>
            </section>

            <section className="flex items-start gap-3">
              <Clock className="text-ifa-teal-700 mt-1 size-5 shrink-0" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="text-ifa-navy-900 text-sm font-medium">{t('responseLabel')}</p>
                <p className="text-ifa-gray-700 text-xs leading-relaxed">{t('responseBody')}</p>
              </div>
            </section>

            <p className="text-ifa-gray-500 border-ifa-gray-200 border-t pt-4 text-xs leading-relaxed">
              {t('legalFooter')}{' '}
              <Link href="/privacidad" className="text-ifa-teal-700 hover:underline">
                {t('privacyLink')}
              </Link>{' '}
              ·{' '}
              <Link href="/terminos" className="text-ifa-teal-700 hover:underline">
                {t('termsLink')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
