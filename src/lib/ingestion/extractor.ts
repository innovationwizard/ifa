import 'server-only';
import { aiDetect, aiDetectProse } from './ai-detect';
import { heuristicDetect } from './heuristic-detect';
import { extractPdfText } from './pdf-extract';
import type { ExtractorResult, ExtractorStepTrace } from './types';

/**
 * Ingestion-pipeline orchestrator.
 *
 * Two entry points:
 *
 *   - `extractFromCsv` (Phase L1.4):
 *       1. Run `heuristicDetect` (synchronous, free).
 *       2. If overallConfidence ≥ HEURISTIC_CONFIDENCE_THRESHOLD,
 *          return — AI call skipped entirely.
 *       3. Otherwise call `aiDetect` (Claude Haiku); merge traces
 *          (heuristic step prepended to AI step).
 *
 *   - `extractFromPdf` (Phase L2.4):
 *       1. Run `extractPdfText` (server-side unpdf).
 *       2. Call `aiDetectProse` with the per-page text.
 *       3. Merge traces (pdf step prepended to AI step).
 *       There is NO heuristic step for PDFs — no PDF analog of CSV
 *       header signature matching exists (the source has no
 *       headers, only free text). Always escalates straight to AI.
 *
 * The orchestrator is the ONLY function callers in the wizard /
 * API routes (L1.7/L1.8/L1.9, L2.5/L2.6) should invoke. Direct use
 * of `heuristicDetect`, `aiDetect`, `aiDetectProse`, or
 * `extractPdfText` is reserved for tests.
 *
 * Throws semantics:
 *   - `extractFromCsv` never throws (ai-detect's never-throw
 *     contract holds).
 *   - `extractFromPdf` MAY throw if `extractPdfText` throws
 *     (corrupt PDF / password-protected / non-PDF input). The
 *     L2.6 route layer catches + maps to user-facing copy. This
 *     is the OPPOSITE of CSV: PDF parsing failures are
 *     user-action errors, not silent fallbacks.
 */

/**
 * Confidence threshold above which the heuristic result is trusted
 * without escalating to AI. Pinned here (not in heuristic-detect or
 * ai-detect) because this is the orchestrator-level policy decision.
 * The L1.6 unit test pins this value so a future tweak doesn't
 * silently shift the AI-escalation rate (and therefore the per-
 * import Anthropic spend).
 *
 * 0.9 means: signature-matched layouts (BAC, BANCO_INDUSTRIAL —
 * confidence 1.0 from the heuristic) skip the AI, but generic
 * keyword matches (max confidence in the heuristic is
 * non-ignore-headers / total-headers, typically 0.4–0.8 even on
 * good CSVs) usually trigger AI escalation. This is the right
 * default for the "must ingest whatever the user uploads" promise.
 */
export const HEURISTIC_CONFIDENCE_THRESHOLD = 0.9;

export interface ExtractFromCsvInput {
  /** CSV headers in source order. */
  headers: string[];
  /**
   * Up-to-50 sample rows in `header → cell` shape. The orchestrator
   * forwards the same sample to both extractors so the wizard's
   * preview is consistent regardless of which path was taken.
   */
  sampleRows: Record<string, string>[];
}

export async function extractFromCsv(input: ExtractFromCsvInput): Promise<ExtractorResult> {
  const heuristicResult = heuristicDetect(input);

  if (heuristicResult.overallConfidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
    return heuristicResult;
  }

  const aiResult = await aiDetect(input);

  /*
   * Prepend the heuristic trace step so ops visibility shows both
   * attempts. The AI step (with its `outcome`) stays at the end so
   * "what did the pipeline decide" reads top-to-bottom.
   */
  return {
    ...aiResult,
    trace: {
      steps: [...heuristicResult.trace.steps, ...aiResult.trace.steps],
    },
  };
}

// -----------------------------------------------------------------------------
// PDF entry (Phase L2.4).
// -----------------------------------------------------------------------------

/**
 * PDF orchestrator. Chains `extractPdfText` → `aiDetectProse` and
 * merges traces.
 *
 * Throws ONLY when `extractPdfText` throws (corrupt PDF / encrypted
 * / non-PDF). The L2.6 route catches + maps to user-facing copy.
 * `aiDetectProse` itself never throws — it returns a `failed`
 * `ExtractorResult` on every internal failure mode.
 */
export async function extractFromPdf(buffer: Uint8Array): Promise<ExtractorResult> {
  /*
   * pdf-extract.ts owns the timing of its own step (sets
   * `durationMs` on its result). We build a trace step from that
   * so the AI step's timing reads as an independent measurement
   * rather than wall-clock-summed-against-PDF.
   */
  const pdfExtract = await extractPdfText(buffer);

  const pdfTrace: ExtractorStepTrace = {
    step: 'pdf',
    durationMs: pdfExtract.durationMs,
    /*
     * `matched` when we got any non-empty page; `fallback` when
     * every page is empty (image-only / scanned PDF). The AI step
     * that follows will short-circuit on empty input either way,
     * but this lets ops distinguish "PDF had no text layer" from
     * "AI couldn't extract from real text".
     */
    outcome: pdfExtract.pages.some((p) => p.trim().length > 0) ? 'matched' : 'fallback',
  };

  const aiResult = await aiDetectProse({ pages: pdfExtract.pages });

  return {
    ...aiResult,
    trace: {
      steps: [pdfTrace, ...aiResult.trace.steps],
    },
  };
}
