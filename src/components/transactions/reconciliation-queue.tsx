'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Money } from '@/components/primitives/money';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FEED_SOURCE_VALUES } from '@/lib/transactions/filters';

/**
 * Reconciliation queue (S-3.9, placeholder).
 *
 * Lists UNMATCHED transactions — the precursor to the Phase-4
 * matching engine. No manual-match action here per the story's
 * acceptance criterion ("no fake match button that does nothing");
 * rows link to the standard detail page where users can at least
 * see the full record.
 *
 * Kept intentionally simple: no virtualization, no cursor
 * pagination, no URL-synced filters. The real reconciliation UI
 * lands with S-4.6 (manual match) and will replace this scaffold.
 */

const ANY_SOURCE_SENTINEL = '__any__';

interface Row {
  id: string;
  date: string;
  description: string;
  merchantName: string | null;
  amount: string;
  currency: string;
  source: string;
}

interface Response {
  data: Record<string, unknown>[];
}

export function ReconciliationQueue() {
  const t = useTranslations('reconciliationQueue');
  const [source, setSource] = useState<string>(ANY_SOURCE_SENTINEL);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setStatus('loading');
      try {
        const params = new URLSearchParams({
          reconciliationStatus: 'UNMATCHED',
          limit: '100',
        });
        if (source !== ANY_SOURCE_SENTINEL) params.set('source', source);
        const response = await fetch(`/api/v1/transactions?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setStatus('error');
          return;
        }
        const body = (await response.json()) as Response;
        setRows(body.data.map(toRow));
        setStatus('idle');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [source]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-ifa-gray-700 font-medium">{t('filterBySource')}</span>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SOURCE_SENTINEL}>{t('anySource')}</SelectItem>
              {FEED_SOURCE_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sourceValues.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <span className="text-ifa-gray-500 text-xs tabular-nums">
          {t('rowCount', { count: rows.length })}
        </span>
      </div>

      {status === 'error' && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex items-center gap-2">
            <AlertTriangle className="size-3.5" aria-hidden />
            {t('loadError')}
          </AlertDescription>
        </Alert>
      )}

      {status === 'loading' && rows.length === 0 && (
        <div className="text-ifa-gray-500 flex items-center justify-center gap-2 py-10 text-xs">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      )}

      {status === 'idle' && rows.length === 0 && (
        <div className="border-ifa-gray-300 rounded-ifa-card flex flex-col items-center justify-center border border-dashed p-10 text-center">
          <p className="text-ifa-gray-700 text-sm font-medium">{t('empty.title')}</p>
          <p className="text-ifa-gray-500 text-xs">{t('empty.body')}</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/transacciones/${row.id}`}
                className="hover:bg-ifa-navy-50 grid grid-cols-[90px_minmax(0,1fr)_110px_80px] items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              >
                <span className="text-ifa-gray-700 text-xs tabular-nums">{row.date}</span>
                <span className="text-ifa-navy-900 truncate">
                  {row.description}
                  {row.merchantName ? (
                    <span className="text-ifa-gray-500 text-xs"> · {row.merchantName}</span>
                  ) : null}
                </span>
                <Money
                  amount={Number(row.amount)}
                  currency={row.currency}
                  className={Number(row.amount) < 0 ? 'text-ifa-gray-700' : 'text-ifa-teal-600'}
                />
                <span className="text-ifa-gray-500 truncate text-right text-xs tracking-wide uppercase">
                  {t(`sourceValues.${row.source}`, { default: row.source })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toRow(raw: Record<string, unknown>): Row {
  return {
    id: pickString(raw.id),
    date: typeof raw.date === 'string' ? raw.date.slice(0, 10) : '',
    description: pickString(raw.description),
    merchantName: typeof raw.merchantName === 'string' ? raw.merchantName : null,
    amount: pickString(raw.amount, '0'),
    currency: pickString(raw.currency, 'GTQ'),
    source: pickString(raw.source),
  };
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
