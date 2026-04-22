/**
 * Client-side CSV assembly for bulk export (S-3.10).
 *
 * The selected rows already live in the feed's state, so we don't
 * round-trip through a server endpoint — the client builds a CSV
 * blob and triggers a download. Simple, works offline for rows
 * already loaded, and avoids a whole new API surface for a feature
 * that's mostly a convenience.
 *
 * If the volume grows past ~1k selected rows the whole-array join
 * becomes wasteful; revisit with streaming + server-side CSV then.
 */

export interface ExportRow {
  id: string;
  date: string;
  description: string;
  merchantName: string | null;
  merchantNit: string | null;
  amount: string;
  currency: string;
  source: string;
  reconciliationStatus: string;
  type: string;
}

const HEADERS = [
  'id',
  'date',
  'type',
  'source',
  'description',
  'merchantName',
  'merchantNit',
  'amount',
  'currency',
  'reconciliationStatus',
] as const satisfies readonly (keyof ExportRow)[];

export function rowsToCsv(rows: ExportRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((key) => escapeField(row[key])).join(','));
  }
  // RFC 4180 mandates CRLF between records.
  return lines.join('\r\n');
}

/**
 * Escape a field per RFC 4180: wrap in quotes if it contains a
 * comma, double-quote, or newline; double any embedded quotes.
 * Null → empty.
 */
function escapeField(value: string | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Builds a timestamped filename for the download. Pure for
 * testability — a `now` can be injected to keep tests deterministic.
 */
export function buildExportFileName(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `ifa-movimientos-${yyyy}${mm}${dd}-${hh}${mi}.csv`;
}

/**
 * Browser-only: serializes rows → CSV → Blob → clicks an invisible
 * anchor to trigger download. Server-safe imports shouldn't reach
 * this function; if they somehow do, the `document` guard fails
 * closed.
 */
export function downloadRowsAsCsv(rows: ExportRow[]): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const csv = rowsToCsv(rows);
  // Prepend a UTF-8 BOM so Excel opens the file in UTF-8 mode on
  // Windows (otherwise it defaults to system codepage — garbled
  // accents for Guatemalan names, merchant info, etc.).
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildExportFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
