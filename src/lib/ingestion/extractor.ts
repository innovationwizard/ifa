import 'server-only';
import { aiDetect } from './ai-detect';
import { heuristicDetect } from './heuristic-detect';
import type { ExtractorResult } from './types';

/**
 * Ingestion-pipeline orchestrator (Phase L1.4).
 *
 * Single entry point for CSV column extraction. Pipeline:
 *
 *   1. Run `heuristicDetect` (synchronous, free).
 *   2. If `result.overallConfidence >= HEURISTIC_CONFIDENCE_THRESHOLD`,
 *      return that result — the AI call is skipped entirely (no
 *      tokens spent, no network latency).
 *   3. Otherwise call `aiDetect` (Claude Haiku, ~$0.005–$0.02/import).
 *      The returned result has its trace prepended with the
 *      heuristic step so ops visibility shows what was tried first.
 *      Source is `'ai'` when the AI returns a usable result,
 *      `'mixed'` is reserved for future iterations that combine
 *      both signals.
 *
 * The orchestrator is the ONLY function callers in the wizard /
 * API route (L1.7/L1.8/L1.9) should invoke. Direct use of
 * `heuristicDetect` or `aiDetect` is reserved for tests.
 *
 * Pure of caching, idempotent w.r.t. its inputs (modulo AI
 * non-determinism on the fallback path). Throws ONLY if `aiDetect`
 * throws — and per ai-detect's locked guarantees, it doesn't throw,
 * it returns a `failed` ExtractorResult. So in practice this
 * orchestrator never throws either; callers can rely on always
 * getting a result back.
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
