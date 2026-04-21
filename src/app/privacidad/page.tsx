import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export async function generateMetadata() {
  const t = await getTranslations('legal.privacy');
  return { title: t('title') };
}

/**
 * Privacy notice — placeholder.
 *
 * Real content lives behind the pre-launch legal review (plan §S-11.8).
 * Tracked as a real route so the register form's link target exists.
 */
export default async function PrivacidadPage() {
  const t = await getTranslations('legal.privacy');
  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-ifa-navy-700 size-5" aria-hidden />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('placeholder')}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </main>
  );
}
