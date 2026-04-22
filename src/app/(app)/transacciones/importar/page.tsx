import { getTranslations } from 'next-intl/server';
import { Upload } from 'lucide-react';
import { CsvImportWizard } from '@/components/imports/csv-import-wizard';

export async function generateMetadata() {
  const t = await getTranslations('imports');
  return { title: t('title') };
}

/**
 * /transacciones/importar — statement upload wizard (S-3.5 + S-3.6).
 *
 * Currently CSV-only. Multi-format parsing (PDF, XLS, OFX, QIF) is
 * the next story per scaffolding §10.4.1 and the Holy Grail memory.
 * User-facing copy must NOT promise "direct bank connection soon"
 * (§10.4.3).
 *
 * Auth is enforced by the proxy — `/transacciones` is under
 * PROTECTED_PREFIXES so anonymous users get bounced to /ingresar
 * before they reach this page.
 */
export default async function ImportarPage() {
  const t = await getTranslations('imports');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-2">
      <header className="flex flex-col gap-2">
        <div className="text-ifa-gray-500 flex items-center gap-2 text-xs tracking-wide uppercase">
          <Upload className="size-3.5" aria-hidden />
          <span>{t('breadcrumb')}</span>
        </div>
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('subtitle')}</p>
      </header>

      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card p-6">
        <CsvImportWizard />
      </div>
    </div>
  );
}
