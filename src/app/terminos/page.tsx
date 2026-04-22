import { getTranslations } from 'next-intl/server';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export async function generateMetadata() {
  const t = await getTranslations('legal.terms');
  return { title: t('title') };
}

/**
 * Terms of use — placeholder.
 *
 * Real content lives behind the pre-launch legal review (plan §S-11.8).
 * This page is tracked as a real route now so (a) the register form's
 * link target exists and E2E tests don't 404, and (b) search engines
 * and browsers never see a broken link from the auth flow.
 */
export default async function TerminosPage() {
  const t = await getTranslations('legal.terms');
  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="text-ifa-navy-700 size-5" aria-hidden />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('placeholder')}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('priceChangeTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('priceChangeBody')}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
