import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Money } from '@/components/primitives/money';
import { Badge } from '@/components/ui/badge';
import { DetailTabsShell, type TabDef } from '@/components/transactions/detail-tabs-shell';
import { DuplicateBanner } from '@/components/transactions/duplicate-banner';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { readDuplicateMetadata } from '@/lib/transactions/duplicate-detection';

/**
 * /transacciones/[id] — transaction detail (S-3.8).
 *
 * Server-renders the detail payload (transaction + sidecars +
 * reconciliation + journal entries + audit) then passes per-tab
 * content as pre-rendered ReactNode children into the client Tabs
 * shell. That keeps formatMoney / formatDate / getTranslations on
 * the server where they belong.
 *
 * Tab composition:
 *   - Resumen           always
 *   - Datos FEL         only when felData is present
 *   - Datos TPV         only when tpvData is present
 *   - Conciliación      always (empty state when unmatched)
 *   - Asientos          always (empty state when no journal entries)
 *   - Auditoría         always (at minimum has the CREATED row)
 *
 * Edit affordances: none in MVP. The "postingStatus" badge surfaces
 * whether the transaction is still editable (PENDING) or posted —
 * the edit UI itself lands with the S-5 accounting stories.
 */

const paramsSchema = z.object({ id: z.uuid() });

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({ params }: PageProps) {
  const awaited = await params;
  const parsed = paramsSchema.safeParse(awaited);
  if (!parsed.success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const detail = await withTenant({ profileId: profile.id, userId: user.id }, async () => {
    const transaction = await transactionRepo.findDetailById(parsed.data.id);
    if (!transaction) return null;
    const [journalEntries, audits] = await Promise.all([
      transactionRepo.listRelatedJournalEntries(parsed.data.id),
      transactionRepo.listAuditById(parsed.data.id),
    ]);
    return { transaction, journalEntries, audits };
  });

  if (!detail) notFound();

  const t = await getTranslations('transactionDetail');
  const { transaction, journalEntries, audits } = detail;

  const tabs: TabDef[] = [];
  tabs.push({
    value: 'resumen',
    label: t('tabs.resumen'),
    content: <ResumenTab transaction={transaction} />,
  });
  if (transaction.felData) {
    tabs.push({
      value: 'fel',
      label: t('tabs.fel'),
      content: <FelTab data={transaction.felData} />,
    });
  }
  if (transaction.tpvData) {
    tabs.push({
      value: 'tpv',
      label: t('tabs.tpv'),
      content: <TpvTab data={transaction.tpvData} />,
    });
  }
  tabs.push({
    value: 'conciliacion',
    label: t('tabs.conciliacion'),
    content: <ConciliacionTab transaction={transaction} />,
  });
  tabs.push({
    value: 'asientos',
    label: t('tabs.asientos'),
    content: <AsientosTab entries={journalEntries} />,
  });
  tabs.push({
    value: 'auditoria',
    label: t('tabs.auditoria'),
    content: <AuditoriaTab audits={audits} />,
  });

  const duplicateMeta = readDuplicateMetadata(transaction.metadata);
  const showDuplicateBanner =
    Boolean(duplicateMeta.possibleDuplicateOf) && !duplicateMeta.duplicateDismissed;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/transacciones"
        className="text-ifa-gray-500 hover:text-ifa-navy-700 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>

      {showDuplicateBanner && duplicateMeta.possibleDuplicateOf && (
        <DuplicateBanner
          transactionId={transaction.id}
          possibleDuplicateOf={duplicateMeta.possibleDuplicateOf}
        />
      )}

      <DetailHero transaction={transaction} />

      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card p-4 sm:p-6">
        <DetailTabsShell tabs={tabs} defaultValue="resumen" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero + tabs — all server-rendered
// ---------------------------------------------------------------------------

type DetailTx = NonNullable<Awaited<ReturnType<typeof transactionRepo.findDetailById>>>;

async function DetailHero({ transaction }: { transaction: DetailTx }) {
  const t = await getTranslations('transactionDetail');
  const amount = Number(transaction.amount);
  return (
    <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col gap-3 p-6">
      <span className="text-ifa-gray-500 text-xs tracking-wide uppercase">
        {t(`type.${transaction.type}`)}
      </span>
      <Money
        amount={amount}
        currency={transaction.currency}
        className={`text-3xl font-semibold ${amount < 0 ? 'text-ifa-navy-900' : 'text-ifa-teal-600'}`}
      />
      <p className="text-ifa-gray-700 text-sm">{transaction.description}</p>
      <p className="text-ifa-gray-500 text-xs">{formatDate(transaction.date)}</p>
    </div>
  );
}

async function ResumenTab({ transaction }: { transaction: DetailTx }) {
  const t = await getTranslations('transactionDetail.resumen');
  const tSources = await getTranslations('transactions.sources');
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <Field label={t('source')}>{tSources(transaction.source)}</Field>
      <Field label={t('status')}>
        <Badge variant="outline">
          {t(`reconciliationStatus.${transaction.reconciliationStatus}`)}
        </Badge>
      </Field>
      <Field label={t('postingStatus')}>
        <Badge variant="outline">{t(`postingStatus.${transaction.postingStatus}`)}</Badge>
      </Field>
      <Field label={t('currency')}>{transaction.currency}</Field>
      {transaction.merchantName && (
        <Field label={t('merchantName')}>{transaction.merchantName}</Field>
      )}
      {transaction.merchantNit && (
        <Field label={t('merchantNit')}>
          <span className="font-mono text-xs">{transaction.merchantNit}</span>
        </Field>
      )}
      {transaction.category && <Field label={t('category')}>{transaction.category}</Field>}
      <Field label={t('createdAt')}>{formatDateTime(transaction.createdAt)}</Field>
      <Field label={t('updatedAt')}>{formatDateTime(transaction.updatedAt)}</Field>
    </dl>
  );
}

async function FelTab({ data }: { data: DetailTx['felData'] }) {
  if (!data) return null;
  const t = await getTranslations('transactionDetail.fel');
  const tCommon = await getTranslations('transactionDetail.common');
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Field label={t('dteUuid')}>
          <span className="font-mono text-xs break-all">{data.dteUuid}</span>
        </Field>
        <Field label={t('dteType')}>{data.dteType}</Field>
        <Field label={t('seriesNumber')}>
          {tCommon('seriesNumber', { series: data.series, number: data.number })}
        </Field>
        <Field label={t('certifier')}>{data.certifierName}</Field>
        <Field label={t('nitEmisor')}>
          <span className="font-mono text-xs">{data.nitEmisor}</span>
        </Field>
        <Field label={t('nitReceptor')}>
          <span className="font-mono text-xs">{data.nitReceptor}</span>
        </Field>
        <Field label={t('certificationDate')}>{formatDateTime(data.certificationDate)}</Field>
        {data.xmlStoragePath && (
          <Field label={t('xmlStoragePath')}>
            <span className="font-mono text-xs break-all">{data.xmlStoragePath}</span>
          </Field>
        )}
      </dl>
    </div>
  );
}

async function TpvTab({ data }: { data: DetailTx['tpvData'] }) {
  if (!data) return null;
  const t = await getTranslations('transactionDetail.tpv');
  const tCommon = await getTranslations('transactionDetail.common');
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <Field label={t('acquirer')}>{data.acquirer}</Field>
      {data.authorizationCode && (
        <Field label={t('authorizationCode')}>
          <span className="font-mono text-xs">{data.authorizationCode}</span>
        </Field>
      )}
      {data.cardLastFour && (
        <Field label={t('card')}>
          {data.cardBrand ? `${data.cardBrand} ` : ''}
          {tCommon('cardMask', { last4: data.cardLastFour })}
        </Field>
      )}
      {data.terminalId && <Field label={t('terminalId')}>{data.terminalId}</Field>}
      {data.batchNumber && <Field label={t('batchNumber')}>{data.batchNumber}</Field>}
      {data.settlementDate && (
        <Field label={t('settlementDate')}>{formatDate(data.settlementDate)}</Field>
      )}
    </dl>
  );
}

async function ConciliacionTab({ transaction }: { transaction: DetailTx }) {
  const t = await getTranslations('transactionDetail.conciliacion');
  const tCommon = await getTranslations('transactionDetail.common');
  const reconciliation = transaction.felReconciliation ?? transaction.tpvReconciliation;
  if (!reconciliation) {
    return <EmptyState>{t('empty')}</EmptyState>;
  }

  const counterpartyId =
    'tpvTransaction' in reconciliation
      ? reconciliation.tpvTransaction.id
      : reconciliation.felTransaction.id;
  const counterpartyDate =
    'tpvTransaction' in reconciliation
      ? reconciliation.tpvTransaction.date
      : reconciliation.felTransaction.date;
  const counterpartyDescription =
    'tpvTransaction' in reconciliation
      ? reconciliation.tpvTransaction.description
      : reconciliation.felTransaction.description;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Field label={t('matchType')}>{t(`matchTypeValues.${reconciliation.matchType}`)}</Field>
        <Field label={t('confidence')}>
          {tCommon('percent', { value: Math.round(reconciliation.confidenceScore * 100) })}
        </Field>
        <Field label={t('reconciledAt')}>{formatDateTime(reconciliation.reconciledAt)}</Field>
      </dl>

      <Link
        href={`/transacciones/${counterpartyId}`}
        className="border-ifa-gray-300 hover:bg-ifa-navy-50 rounded-ifa-card flex flex-col gap-1 border p-4 transition-colors"
      >
        <span className="text-ifa-gray-500 text-xs tracking-wide uppercase">
          {t('counterparty')}
        </span>
        <span className="text-ifa-navy-900 text-sm">{counterpartyDescription}</span>
        <span className="text-ifa-gray-500 text-xs">{formatDate(counterpartyDate)}</span>
      </Link>
    </div>
  );
}

async function AsientosTab({
  entries,
}: {
  entries: Awaited<ReturnType<typeof transactionRepo.listRelatedJournalEntries>>;
}) {
  const t = await getTranslations('transactionDetail.asientos');
  if (entries.length === 0) {
    return <EmptyState>{t('empty')}</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="border-ifa-gray-300 rounded-ifa-card flex flex-col gap-3 border p-4"
        >
          <div className="text-ifa-gray-500 flex items-center justify-between text-xs">
            <span>
              {t('entryNumber')} {entry.entryNumber}
            </span>
            <span>{formatDate(entry.date)}</span>
          </div>
          <p className="text-ifa-navy-900 text-sm">{entry.description}</p>
          <div className="flex flex-col gap-1 text-xs">
            {entry.lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_auto_auto] gap-3">
                <span className="text-ifa-gray-700">
                  {line.account.code} · {line.account.name}
                </span>
                <Money amount={Number(line.debitAmount)} className="text-ifa-gray-700" />
                <Money amount={Number(line.creditAmount)} className="text-ifa-teal-600" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function AuditoriaTab({
  audits,
}: {
  audits: Awaited<ReturnType<typeof transactionRepo.listAuditById>>;
}) {
  const t = await getTranslations('transactionDetail.auditoria');
  if (audits.length === 0) {
    return <EmptyState>{t('empty')}</EmptyState>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {audits.map((audit) => (
        <li
          key={audit.id}
          className="border-ifa-gray-300 rounded-ifa-card flex items-start gap-3 border p-3"
        >
          <div className="bg-ifa-navy-100 text-ifa-navy-700 flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase">
            {audit.performedBy.charAt(0)}
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-ifa-navy-900 text-sm font-medium">
              {t(`actions.${audit.action}`)}
            </span>
            <span className="text-ifa-gray-500 text-xs">
              {t(`actors.${audit.performedBy}`)} · {formatDateTime(audit.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Small server-only helpers
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-ifa-gray-500 text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-ifa-navy-900">{children}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-ifa-gray-300 rounded-ifa-card flex flex-col items-center justify-center border border-dashed p-8 text-center">
      <p className="text-ifa-gray-500 text-sm">{children}</p>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Guatemala',
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guatemala',
  }).format(date);
}
