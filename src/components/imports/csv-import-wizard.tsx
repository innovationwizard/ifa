'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Papa from 'papaparse';
import { CheckCircle2, FileUp, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import {
  validateMapping,
  type CanonicalField,
  type ColumnMapping,
  type DetectedBank,
} from '@/lib/imports/column-detect';
import type { ColumnConfidence, ExtractorResult, ExtractorSource } from '@/lib/ingestion/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { processPendingJobs } from '@/app/(app)/transacciones/actions';

/**
 * Client-side state machine for /transacciones/importar (S-3.5,
 * extended in Phase L1.9 — universal AI-assisted ingestion).
 *
 *   idle       → user hasn't picked a file
 *   detecting  → file parsed locally; headers + sample posted to
 *                `/api/v1/imports/parse`. Server runs the orchestrator
 *                (heuristic → AI fallback). User sees a spinner; may
 *                take ~1–3s when AI is invoked.
 *   previewing → orchestrator returned a mapping. First rows + per-
 *                column dropdowns rendered for user review.
 *   uploading  → file being PUT to Supabase Storage via signed URL
 *   importing  → server is parsing + inserting rows
 *   done       → server returned a summary
 *   error      → anything failed; message surfaced as a retry
 *
 * Local preview uses papaparse in the browser — same library as the
 * server, so detection/parsing behavior matches what will actually
 * happen on commit. The sample is capped at 50 rows for snappy UI;
 * the full file goes to the server regardless.
 *
 * On server-side parse error we surface a clear error — we do NOT
 * silently fall back to local heuristic. The locked decision §0.4
 * ("must accept whatever the user uploads") depends on the AI
 * fallback running; degrading silently to heuristic-only would
 * mis-map low-confidence CSVs without the user knowing.
 */

type Wizard =
  | { stage: 'idle' }
  | {
      stage: 'detecting';
      file: File;
      headers: string[];
      sampleRows: Record<string, string>[];
    }
  | {
      stage: 'previewing';
      file: File;
      headers: string[];
      mapping: ColumnMapping;
      detectedBank: DetectedBank;
      confidence: number;
      sampleRows: Record<string, string>[];
      /** Where the mapping came from — 'heuristic' or 'ai' (or 'mixed'/'manual'). */
      source: ExtractorSource;
      /**
       * Per-canonical-field confidence + optional Spanish reason
       * from the orchestrator. The AI emits a `reason` only for
       * fields with confidence < 0.7 — so any reason's presence
       * means "user should look at this column" and the wizard
       * surfaces it below the column's select.
       */
      perFieldConfidence: Partial<Record<CanonicalField, ColumnConfidence>>;
    }
  | { stage: 'uploading'; file: File }
  | { stage: 'importing' }
  | { stage: 'done'; summary: ImportSummaryResponse }
  | { stage: 'error'; message: string };

interface ImportSummaryResponse {
  totalRows: number;
  imported: number;
  duplicatesSkipped: number;
  failed: number;
  detectedBank: string;
}

interface PrepareResponse {
  data: { signedUrl: string; token: string; path: string };
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAMPLE_ROWS = 10;

export function CsvImportWizard() {
  const t = useTranslations('imports');
  const router = useRouter();
  const [state, setState] = useState<Wizard>({ stage: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset(): void {
    setState({ stage: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChosen(file: File): void {
    if (file.size > MAX_FILE_BYTES) {
      setState({ stage: 'error', message: t('errors.fileTooLarge') });
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      preview: SAMPLE_ROWS + 1,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        if (headers.length === 0) {
          setState({ stage: 'error', message: t('errors.noHeaders') });
          return;
        }
        const sampleRows = result.data.slice(0, SAMPLE_ROWS);
        setState({ stage: 'detecting', file, headers, sampleRows });
        void runExtractor(file, headers, sampleRows);
      },
      error: () => {
        setState({ stage: 'error', message: t('errors.parseFailed') });
      },
    });
  }

  async function runExtractor(
    file: File,
    headers: string[],
    sampleRows: Record<string, string>[],
  ): Promise<void> {
    /*
     * POST headers + sample to the L1.7 endpoint. The orchestrator
     * runs heuristic-first; if heuristic confidence is below
     * threshold, the server calls Claude Haiku. Wizard sees the
     * result either way as a uniform `ExtractorResult` shape.
     */
    try {
      const res = await fetch('/api/v1/imports/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      });
      if (!res.ok) {
        setState({ stage: 'error', message: t('errors.detectFailed') });
        return;
      }
      const result = (await res.json()) as ExtractorResult;
      /*
       * Fall back to GENERIC bank label when the orchestrator omits
       * one (AI path doesn't emit detectedBank). The wizard's
       * PreviewStep uses this only for the "Detectamos el formato de
       * {bank}" headline copy.
       */
      const detectedBank: DetectedBank = result.detectedBank ?? 'GENERIC';
      /*
       * Fall back to an empty mapping when the orchestrator returns
       * none (AI 'failed' path). The user starts with all-'ignore'
       * dropdowns and assigns columns manually — the L1.8 validation
       * gate prevents commit until a usable mapping is built.
       */
      const mapping: ColumnMapping = result.mapping ?? {};
      setState({
        stage: 'previewing',
        file,
        headers,
        sampleRows,
        mapping,
        detectedBank,
        confidence: result.overallConfidence,
        source: result.source,
        perFieldConfidence: result.confidence,
      });
    } catch {
      setState({ stage: 'error', message: t('errors.detectFailed') });
    }
  }

  async function handleImport(
    previewing: Extract<Wizard, { stage: 'previewing' }>,
    confirmedMapping: ColumnMapping,
  ): Promise<void> {
    setState({ stage: 'uploading', file: previewing.file });
    try {
      const prepareRes = await fetch('/api/v1/transactions/import/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: previewing.file.name }),
      });
      if (!prepareRes.ok) {
        throw new Error('prepare_failed');
      }
      const prepare = (await prepareRes.json()) as PrepareResponse;

      /*
       * Upload directly to Supabase via the signed URL — bypasses
       * Vercel's 4.5MB body limit. Supabase accepts PUT with the
       * raw file body; the signed URL already encodes auth + path.
       */
      const uploadRes = await fetch(prepare.data.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/csv' },
        body: previewing.file,
      });
      if (!uploadRes.ok) {
        throw new Error('upload_failed');
      }

      setState({ stage: 'importing' });

      const importRes = await fetch('/api/v1/transactions/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storagePath: prepare.data.path,
          mapping: confirmedMapping,
        }),
      });
      if (!importRes.ok) {
        const body = (await importRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'import_failed');
      }
      const summary = (await importRes.json()) as { data: ImportSummaryResponse };
      setState({ stage: 'done', summary: summary.data });
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'invalid_mapping'
          ? t('errors.invalidMapping')
          : t('errors.generic');
      setState({ stage: 'error', message });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {state.stage === 'idle' && <IdleStep onChoose={handleFileChosen} inputRef={fileInputRef} />}

      {state.stage === 'previewing' && (
        <PreviewStep
          state={state}
          onConfirm={(confirmedMapping) => {
            void handleImport(state, confirmedMapping);
          }}
          onCancel={reset}
        />
      )}

      {state.stage === 'detecting' && <ProgressStep label={t('progress.detecting')} />}

      {(state.stage === 'uploading' || state.stage === 'importing') && (
        <ProgressStep
          label={state.stage === 'uploading' ? t('progress.uploading') : t('progress.importing')}
        />
      )}

      {state.stage === 'done' && (
        <ResultStep
          summary={state.summary}
          onAnother={reset}
          onDashboard={() => router.push('/dashboard')}
        />
      )}

      {state.stage === 'error' && (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={reset}>
            {t('errors.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}

function IdleStep({
  onChoose,
  inputRef,
}: {
  onChoose: (file: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations('imports');
  return (
    <label
      className="border-ifa-gray-300 hover:border-ifa-teal-400 focus-within:border-ifa-teal-600 rounded-ifa-card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-10 text-center transition-colors"
      htmlFor="csv-file"
    >
      <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-16 items-center justify-center rounded-full">
        <FileUp className="size-7" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-ifa-navy-900 text-base font-medium">{t('upload.prompt')}</span>
        <span className="text-ifa-gray-500 text-xs">{t('upload.hint')}</span>
      </div>
      <input
        ref={inputRef}
        id="csv-file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(file);
        }}
      />
    </label>
  );
}

/**
 * Canonical-field options the user can pick per column. Order is
 * intentional — most-common-first for fewer dropdown scrolls.
 */
const FIELD_OPTIONS: readonly CanonicalField[] = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'merchantNit',
  'ignore',
];

function PreviewStep({
  state,
  onConfirm,
  onCancel,
}: {
  state: Extract<Wizard, { stage: 'previewing' }>;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('imports');
  const bankLabel =
    state.detectedBank === 'BAC'
      ? 'BAC'
      : state.detectedBank === 'BANCO_INDUSTRIAL'
        ? 'Banco Industrial'
        : t('preview.genericLayout');

  /*
   * Local mapping state — initialized from the heuristic-detected
   * mapping, mutated by the per-column dropdowns. The wizard parent
   * receives the final (possibly-corrected) mapping via onConfirm.
   *
   * NOT reset across re-mounts of PreviewStep — `state` is keyed on
   * the file in the parent wizard, so a fresh file picks a fresh
   * PreviewStep with fresh local state.
   */
  const [mapping, setMapping] = useState<ColumnMapping>(state.mapping);

  const validation = validateMapping(mapping);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-ifa-teal-600 size-4" aria-hidden />
          <span className="text-ifa-navy-900 text-sm font-medium">
            {t('preview.detected', { bank: bankLabel })}
          </span>
        </div>
        {(state.source === 'ai' || state.source === 'mixed') && (
          <Alert variant="default" role="alert">
            <AlertDescription className="flex items-start gap-2 text-xs">
              <Sparkles className="text-ifa-teal-600 mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{t('preview.aiSourceBanner')}</span>
            </AlertDescription>
          </Alert>
        )}
        {state.confidence < 0.6 && (
          <Alert variant="default" role="alert">
            <AlertDescription className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{t('preview.lowConfidence')}</span>
            </AlertDescription>
          </Alert>
        )}
        {!validation.ok && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {t('preview.missingFields', {
                  fields: validation.missing.map((f) => t(`preview.fields.${f}`)).join(', '),
                })}
              </span>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-ifa-card border-ifa-gray-300 overflow-x-auto border">
        <table className="w-full text-xs">
          <thead className="bg-ifa-navy-50 text-ifa-navy-900">
            <tr>
              {state.headers.map((h) => {
                const field = mapping[h] ?? 'ignore';
                /*
                 * The orchestrator's per-field reason is keyed by
                 * CANONICAL field, not header. If two headers map to
                 * the same canonical field, the reason renders under
                 * both — honest because the AI's concern is about
                 * the field's identification, not the header text.
                 */
                const reason =
                  field !== 'ignore' ? state.perFieldConfidence[field]?.reason : undefined;
                return (
                  <th key={h} className="px-3 py-2 text-left font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{h}</span>
                      <label className="sr-only" htmlFor={`map-${h}`}>
                        {t('preview.mapLabel', { header: h })}
                      </label>
                      <select
                        id={`map-${h}`}
                        value={field}
                        onChange={(e) => {
                          const next = e.target.value as CanonicalField;
                          setMapping((prev) => ({ ...prev, [h]: next }));
                        }}
                        className="border-ifa-gray-300 focus:border-ifa-teal-600 focus:ring-ifa-teal-100 rounded-md border bg-white px-2 py-1 text-xs font-normal tracking-normal normal-case focus:ring-2 focus:outline-none"
                      >
                        {FIELD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {t(`preview.fields.${opt}`)}
                          </option>
                        ))}
                      </select>
                      {reason && (
                        <p className="text-ifa-gold-700 max-w-[16rem] text-[10px] leading-snug font-normal tracking-normal normal-case">
                          {reason}
                        </p>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {state.sampleRows.map((row, idx) => (
              <tr key={idx} className="border-ifa-gray-300 border-t">
                {state.headers.map((h) => (
                  <td key={h} className="text-ifa-gray-700 px-3 py-2">
                    {row[h] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          {t('preview.cancel')}
        </Button>
        <Button
          onClick={() => {
            onConfirm(mapping);
          }}
          disabled={!validation.ok}
        >
          {t('preview.confirm')}
        </Button>
      </div>
    </div>
  );
}

function ProgressStep({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Loader2 className="text-ifa-teal-600 size-6 animate-spin" aria-hidden />
      <span className="text-ifa-gray-700 text-sm">{label}</span>
    </div>
  );
}

function ResultStep({
  summary,
  onAnother,
  onDashboard,
}: {
  summary: ImportSummaryResponse;
  onAnother: () => void;
  onDashboard: () => void;
}) {
  const t = useTranslations('imports');
  const [processState, setProcessState] = useState<'idle' | 'done'>('idle');
  const [isProcessing, startProcessing] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-16 items-center justify-center rounded-full">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h2 className="text-ifa-navy-900 text-xl font-semibold">{t('result.title')}</h2>
      </div>

      <dl className="bg-ifa-white rounded-ifa-card shadow-ifa-card grid grid-cols-2 gap-4 p-6">
        <Metric value={summary.imported} label={t('result.imported')} />
        <Metric value={summary.duplicatesSkipped} label={t('result.duplicates')} />
        <Metric value={summary.failed} label={t('result.failed')} />
        <Metric value={summary.totalRows} label={t('result.total')} />
      </dl>

      {summary.imported > 0 && (
        <ProcessCta
          state={processState}
          isProcessing={isProcessing}
          onProcess={() => {
            startProcessing(async () => {
              await processPendingJobs();
              setProcessState('done');
            });
          }}
        />
      )}

      {summary.failed > 0 && (
        <Alert variant="default" role="alert">
          <AlertDescription className="text-xs">
            {t('result.failureNote', { count: summary.failed })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href="#" onClick={onAnother}>
            {t('result.importAnother')}
          </Link>
        </Button>
        <Button onClick={onDashboard}>{t('result.goDashboard')}</Button>
      </div>
    </div>
  );
}

function ProcessCta({
  state,
  isProcessing,
  onProcess,
}: {
  state: 'idle' | 'done';
  isProcessing: boolean;
  onProcess: () => void;
}) {
  const t = useTranslations('imports.result.process');

  if (state === 'done') {
    return (
      <div className="border-ifa-teal-200 bg-ifa-teal-50 flex items-center gap-3 rounded-lg border p-4">
        <CheckCircle2 className="text-ifa-teal-700 size-5 shrink-0" aria-hidden />
        <p className="text-ifa-navy-900 text-sm">{t('doneBody')}</p>
      </div>
    );
  }

  return (
    <div className="border-ifa-teal-200 bg-ifa-teal-50 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Sparkles className="text-ifa-teal-700 mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-ifa-navy-900 text-sm font-medium">{t('headline')}</p>
          <p className="text-ifa-gray-700 text-xs">{t('description')}</p>
        </div>
      </div>
      <Button size="sm" onClick={onProcess} disabled={isProcessing} className="w-full sm:w-auto">
        {isProcessing ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>{t('processing')}</span>
          </>
        ) : (
          t('cta')
        )}
      </Button>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-ifa-gray-500 text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-ifa-navy-900 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
