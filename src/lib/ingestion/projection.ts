import type { ColumnMapping, ExtractedRow } from './types';

/**
 * Sample-row projection shared by every CSV-shaped extractor
 * (Phase L1.2.5). Both the heuristic extractor (L1.2) and the AI
 * extractor (L1.3) produce a `ColumnMapping` (source header →
 * canonical field) and then need to apply it to the original sample
 * rows so the wizard's "Confirma el mapeo" preview table can render
 * the canonical-field-keyed `ExtractedRow[]`.
 *
 * Pure function. No clock, no IO, no logging — deterministic in its
 * inputs. Lives in its own module so a future PDF-only extractor
 * (L2.3 prose-mode) doesn't depend on it (PDF AI output is row-
 * shaped, not header-mapped, so this projection isn't applicable
 * there).
 *
 * Conflict behavior: when the mapping has multiple source headers
 * routed to the same canonical field (mis-detected layout), the
 * LAST matching cell per row wins. Surface the conflict via the
 * confidence map at the call site — the projection itself does
 * not flag it.
 *
 * Missing cells are preserved as `null` so the wizard renders a
 * visible gap rather than a blank that looks like "we found
 * nothing" when in fact the source row had nothing.
 */
export function projectCsvSample(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): ExtractedRow[] {
  return rows.map((row) => {
    const out: ExtractedRow = {
      date: null,
      description: null,
      amount: null,
      debit: null,
      credit: null,
      merchantNit: null,
    };
    for (const [header, value] of Object.entries(row)) {
      const field = mapping[header];
      if (!field || field === 'ignore') continue;
      // Exhaustively narrow to the writable fields on ExtractedRow.
      if (
        field === 'date' ||
        field === 'description' ||
        field === 'amount' ||
        field === 'debit' ||
        field === 'credit' ||
        field === 'merchantNit'
      ) {
        out[field] = value ?? null;
      }
    }
    return out;
  });
}
