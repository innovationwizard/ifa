import { useTranslations } from 'next-intl';
import { Construction } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ModulePlaceholderProps {
  /** Translation key for the page title (e.g., `nav.dashboard`). */
  titleKey: string;
  /** Translation key for the module one-liner (e.g., `modulePlaceholders.dashboard`). */
  descriptionKey: string;
}

/**
 * Generic "Próximamente" placeholder for routes whose real implementation
 * belongs to a later phase. Renders the module's eventual purpose honestly
 * so a user who navigates here knows what to expect (Rule 1 — no fake UI).
 */
export function ModulePlaceholder({ titleKey, descriptionKey }: ModulePlaceholderProps) {
  const t = useTranslations();
  const shell = useTranslations('shell.placeholders');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t(titleKey)}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="text-ifa-warning size-5" aria-hidden />
            {shell('pageComingSoon')}
          </CardTitle>
          <CardDescription>{shell('phaseStatus')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-ifa-gray-700 text-sm">{t(descriptionKey)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
