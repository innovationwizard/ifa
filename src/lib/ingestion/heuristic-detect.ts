import {
  detectColumns,
  type CanonicalField,
  type ColumnMapping,
} from '@/lib/imports/column-detect';
import { projectCsvSample } from './projection';
import type { ColumnConfidence, ExtractorResult, ExtractorStepTrace } from './types';

/**
 * Heuristic detector — Phase L1.2.
 *
 * Thin wrapper around the existing `@/lib/imports/column-detect`'s
 * `detectColumns(headers)` that adapts its `DetectionResult` shape
 * into the unified `ExtractorResult` shape (L1.1) the orchestrator
 * (L1.4) consumes.
 *
 * The wrapper adds three things on top of `detectColumns`:
 *
 *   1. Per-canonical-field `ColumnConfidence`. The legacy detector
 *      emits a single `confidence` number; the orchestrator + wizard
 *      want per-column granularity so the "Confirma el mapeo" step
 *      can highlight specific low-confidence columns rather than
 *      flagging the whole import.
 *   2. Sample-row projection — turning the caller's
 *      `Record<header, cell>[]` rows into canonical-field-keyed
 *      `ExtractedRow[]` using the detector's mapping. The wizard
 *      renders these in the preview table.
 *   3. Trace step entry — the orchestrator chains heuristic + AI
 *      step traces for ops visibility.
 *
 * The legacy `column-detect.ts` is NOT modified by this wrapper. The
 * underlying detector continues to own the keyword/signature logic;
 * this file only adapts the shape.
 *
 * Pure: no IO, no clock dependency surfaced through args (we DO read
 * `Date.now()` for trace duration — see note in the function body).
 */

/*
 * Per-column confidence scores assigned when the detector matched.
 * Bank-signature matches (BAC, Banco Industrial) are high-confidence
 * because both the column set + bank are known. Generic keyword
 * matches are medium-confidence — each individual column matched a
 * keyword pattern but the overall layout is unverified, so the
 * orchestrator's threshold will usually still escalate to AI.
 *
 * These two constants are pinned by unit test (L1.6) so a future
 * tweak doesn't silently shift the AI-escalation rate.
 */
export const SIGNATURE_PER_COLUMN_CONFIDENCE = 1.0;
export const GENERIC_PER_COLUMN_CONFIDENCE = 0.7;

export interface HeuristicInput {
  /** Source CSV headers in original order. */
  headers: string[];
  /**
   * Up-to-50 sample rows from the source CSV. Each row is a
   * `header → cell` dict as papaparse emits when `header: true`.
   */
  sampleRows: Record<string, string>[];
}

/**
 * Run the heuristic detector and adapt its output to `ExtractorResult`.
 *
 * The returned `ExtractorResult` always has `source: 'heuristic'`. The
 * orchestrator decides whether this result is sufficient (commits)
 * or whether to escalate to the AI extractor (which will then return
 * its own `ExtractorResult` with `source: 'ai'` or `'mixed'`).
 */
export function heuristicDetect(input: HeuristicInput): ExtractorResult {
  /*
   * `Date.now()` is used only for the trace's `durationMs` — pure
   * observability. The function's logical output (mapping, confidence,
   * sample) is fully deterministic in its inputs.
   */
  const start = Date.now();
  const detection = detectColumns(input.headers);

  const confidence = buildPerFieldConfidence(detection.mapping, detection.detectedBank);
  const sample = projectCsvSample(input.sampleRows, detection.mapping);
  const durationMs = Date.now() - start;

  const trace: ExtractorStepTrace = {
    step: 'heuristic',
    durationMs,
    /*
     * `matched` when the detector identified at least one canonical
     * field (more than zero non-ignore headers). `fallback` when the
     * detector returned nothing usable — the orchestrator will
     * escalate to AI in that case.
     */
    outcome: Object.keys(confidence).length > 0 ? 'matched' : 'fallback',
  };

  return {
    sample,
    mapping: detection.mapping,
    detectedBank: detection.detectedBank,
    confidence,
    overallConfidence: detection.confidence,
    source: 'heuristic',
    trace: { steps: [trace] },
  };
}

/**
 * Walk the mapping and assign per-canonical-field confidence. For
 * any field with multiple matching headers (e.g., two amount-like
 * columns) the FIRST encountered is recorded; the orchestrator /
 * wizard can surface the conflict from the mapping itself.
 *
 * `ignore` fields are deliberately omitted from the result —
 * downstream consumers treat "missing key" as "we didn't find this
 * canonical field" (NOT "we're 0% confident in our found field").
 */
function buildPerFieldConfidence(
  mapping: ColumnMapping,
  detectedBank: 'BAC' | 'BANCO_INDUSTRIAL' | 'GENERIC',
): Partial<Record<CanonicalField, ColumnConfidence>> {
  const perColumn =
    detectedBank === 'GENERIC' ? GENERIC_PER_COLUMN_CONFIDENCE : SIGNATURE_PER_COLUMN_CONFIDENCE;

  const result: Partial<Record<CanonicalField, ColumnConfidence>> = {};
  for (const field of Object.values(mapping)) {
    if (field === 'ignore') continue;
    if (result[field] !== undefined) continue;
    result[field] = { score: perColumn };
  }
  return result;
}
