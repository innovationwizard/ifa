import type { CanonicalField, ColumnMapping, DetectedBank } from '@/lib/imports/column-detect';

/**
 * Shared types for the universal ingestion pipeline (Phase L Batch 1 — ADR/plan
 * §2 L1). Designed to support BOTH CSV input (where `mapping` from headers →
 * canonical fields is meaningful) AND PDF input (where the AI emits rows
 * directly with no real "headers" to map). The wizard branches on
 * `mapping === undefined` to render the right confirm UI.
 *
 * Re-exports `CanonicalField` + `ColumnMapping` + `DetectedBank` from the
 * existing `@/lib/imports/column-detect` so downstream code has a single
 * import surface for the ingestion-related types. The existing
 * `column-detect.ts` continues to own the heuristic detection logic; L1.2
 * will wrap it to emit the richer `ExtractorResult` shape below.
 */

export type { CanonicalField, ColumnMapping, DetectedBank };

/**
 * Which extractor produced this result.
 *
 *   - `heuristic` — only the keyword/signature detector ran and was
 *     confident enough to return without falling through to AI.
 *   - `ai`        — the heuristic returned low confidence and the AI
 *     extractor produced the final mapping/rows.
 *   - `mixed`     — heuristic identified some fields; AI filled gaps.
 *   - `manual`    — the user corrected the mapping in the wizard's
 *     confirm step; this is the final committed shape.
 */
export type ExtractorSource = 'heuristic' | 'ai' | 'mixed' | 'manual';

/**
 * Per-canonical-field confidence the wizard uses to decide whether to
 * surface that field as "needs your confirmation" vs "we're sure".
 *
 * `score` is on `[0, 1]` — comparable to the existing
 * `DetectionResult.confidence` so the orchestrator can fold both
 * heuristic-overall and AI-per-column signals onto one scale.
 *
 * `reason` is OPTIONAL human-readable copy (tú-register Spanish) the
 * wizard MAY render under low-confidence columns ("creemos que esta
 * columna es la descripción porque…"). Omitted on the high-confidence
 * heuristic path to keep the wire payload small.
 */
export interface ColumnConfidence {
  score: number;
  reason?: string;
}

/**
 * One sample row in canonical-field shape — what the wizard renders in
 * the "Confirma el mapeo" preview table. Strings (not parsed numbers /
 * dates) because the user is reviewing the SOURCE values; the actual
 * type coercion happens at commit time inside
 * `transactionRepo.createManyFromImport`.
 *
 * `null` means the field wasn't present in the source row (e.g., a
 * CSV with separate debit/credit columns will have `amount: null` and
 * one of `debit`/`credit` populated per row).
 */
export interface ExtractedRow {
  date: string | null;
  description: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  merchantNit: string | null;
}

/**
 * One step inside the pipeline trace. Captured for ops visibility —
 * NOT surfaced in the wizard UI. Logged at the same level as the
 * existing AI cost telemetry from B2.
 */
export interface ExtractorStepTrace {
  /**
   * Pipeline step. `'heuristic'` and `'ai'` for the CSV pipeline
   * (L1); `'pdf'` for the L2 PDF text-extraction step that runs
   * before the AI prose-mode call. Distinguished in the trace so
   * ops can grep PDF latency vs AI latency separately.
   */
  step: 'heuristic' | 'ai' | 'pdf';
  durationMs: number;
  outcome: 'matched' | 'fallback' | 'failed';
  /**
   * Populated only when `step === 'ai'`. Lines up with the cost-
   * telemetry payload emitted by `callClaudeWithRetry` (B2) so the
   * per-import token spend is greppable in logs.
   */
  ai?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

export interface ExtractorTrace {
  steps: ExtractorStepTrace[];
}

/**
 * Output of the L1 orchestrator (`src/lib/ingestion/extractor.ts`,
 * landing in L1.4). One shape for both CSV and PDF inputs — the
 * wizard branches on `mapping === undefined` to know which input
 * shape was extracted from.
 */
export interface ExtractorResult {
  /**
   * Up-to-50 sample rows in canonical shape. The wizard renders these
   * for user review before any commit happens.
   */
  sample: ExtractedRow[];

  /**
   * CSV-only: original-header → canonical-field. Present for CSV input
   * (where the user can re-map a header to a different canonical field
   * in the confirm step). UNDEFINED for PDF input (no real headers).
   */
  mapping?: ColumnMapping;

  /**
   * CSV-only: which bank the heuristic recognized, if any. Useful for
   * telemetry ("how often does the heuristic save an AI call?"). Set
   * to `'GENERIC'` on AI-extracted CSVs; UNDEFINED for PDF input.
   */
  detectedBank?: DetectedBank;

  /**
   * Per-canonical-field confidence. Partial because not every field is
   * always present (a profile-payments CSV may legitimately lack
   * `merchantNit`). Wizard treats missing keys as "we didn't find this
   * field" (NOT "we're 0% confident in our found field").
   */
  confidence: Partial<Record<CanonicalField, ColumnConfidence>>;

  /**
   * Pipeline-level confidence on `[0, 1]`. The wizard uses this to
   * decide whether to surface the confirm step at all (≥ threshold
   * skips confirm; below threshold forces it). The threshold itself
   * lives in `extractor.ts` (L1.4).
   */
  overallConfidence: number;

  /**
   * Which extractor produced this result. The wizard MAY use this to
   * tone its copy ("encontramos esto solitos" vs "esto lo armamos con
   * ayuda de IA, revísalo").
   */
  source: ExtractorSource;

  /** Ops/debug trace. Logged, not rendered. */
  trace: ExtractorTrace;
}
