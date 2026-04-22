import { createHash } from 'node:crypto';
import type { TransactionType } from '@prisma/client';
import type { CanonicalField, ColumnMapping } from './column-detect';

/**
 * CSV parsing + row → canonical-transaction mapping (S-3.6).
 *
 * Separate from `column-detect.ts`: detection runs once per file to
 * figure out the header mapping; this module takes the mapping + the
 * row-by-row data and produces `ParsedTransaction` rows ready for
 * insert (plus per-row errors for the "couldn't parse this" cases).
 *
 * Idempotency: each produced transaction carries a deterministic
 * `externalId` derived from `(date, amount.toFixed(2), description)`.
 * Re-importing the same CSV hits the
 * `@@unique([profileId, source, externalId])` constraint on retry
 * and is silently skipped via Prisma's `createMany({ skipDuplicates:
 * true })`.
 *
 * Locale conventions:
 *   - Date formats accepted: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`,
 *     `DD/MM/YY`, and any ISO-like string JS's `Date` parses
 *     unambiguously. Guatemala uses DD/MM/YYYY dominantly.
 *   - Numbers: `1,234.56`-style (US/GT) and `1.234,56`-style
 *     (EU). Parens `(123.45)` is accounting-notation negative. `Q`
 *     / `USD` / other currency prefixes are stripped.
 */

export interface ParsedTransaction {
  externalId: string;
  type: TransactionType;
  /** Signed amount in statement currency. Decimal(14,2) on the DB side. */
  amount: number;
  /** Zero-time Date matching the `@db.Date` column convention. */
  date: Date;
  description: string;
  merchantNit?: string;
  currency: string;
}

export interface RowError {
  rowIndex: number;
  message: string;
  raw: Record<string, string>;
}

export interface MapResult {
  transactions: ParsedTransaction[];
  errors: RowError[];
}

/**
 * Transform CSV rows into canonical transactions using the supplied
 * column mapping. Rows that fail validation go into `errors` instead
 * of throwing — the UI surfaces these as "X filas con errores" and
 * the user can choose to skip them (MVP default) or fix the file.
 */
export function mapRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  options: { currency?: string } = {},
): MapResult {
  const transactions: ParsedTransaction[] = [];
  const errors: RowError[] = [];
  const currency = options.currency ?? 'GTQ';

  rows.forEach((raw, rowIndex) => {
    const mapped = mapRow(raw, mapping, currency);
    if (mapped.transaction) {
      transactions.push(mapped.transaction);
    } else {
      errors.push({ rowIndex, message: mapped.error, raw });
    }
  });

  return { transactions, errors };
}

function mapRow(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  currency: string,
): { transaction: ParsedTransaction } | { transaction?: undefined; error: string } {
  const fields: Partial<Record<Exclude<CanonicalField, 'ignore'>, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue;
    const value = raw[header]?.trim();
    if (value) fields[field] = value;
  }

  const date = fields.date ? parseDateFlexible(fields.date) : undefined;
  if (!date) return { error: 'fecha inválida o ausente' };

  const description = fields.description?.trim() ?? '';
  if (!description) return { error: 'descripción ausente' };

  let amount: number | undefined;
  if (fields.amount !== undefined) {
    amount = parseNumber(fields.amount);
  } else {
    const debit = fields.debit ? parseNumber(fields.debit) : undefined;
    const credit = fields.credit ? parseNumber(fields.credit) : undefined;
    if (debit !== undefined && debit > 0) {
      // Debit column on a bank statement = money OUT of user's account.
      amount = -debit;
    } else if (credit !== undefined && credit > 0) {
      // Credit column = money IN.
      amount = credit;
    }
  }
  if (amount === undefined || !Number.isFinite(amount)) {
    return { error: 'monto inválido o ausente' };
  }

  // Round to 2 decimal places to match Decimal(14, 2).
  amount = Math.round(amount * 100) / 100;

  const type: TransactionType = amount < 0 ? 'EXPENSE' : 'INCOME';

  const externalId = `csv:${hashRow(date, amount, description)}`;

  const transaction: ParsedTransaction = {
    externalId,
    type,
    amount,
    date,
    description,
    currency,
    ...(fields.merchantNit ? { merchantNit: fields.merchantNit } : {}),
  };
  return { transaction };
}

function hashRow(date: Date, amount: number, description: string): string {
  const material = `${date.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${description}`;
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * Parse a date string in any of the common Guatemalan / ISO formats.
 * Returns a zero-time Date to match the `@db.Date` column (Prisma
 * coerces to the Postgres DATE type; time is discarded anyway).
 */
export function parseDateFlexible(input: string): Date | undefined {
  const s = input.trim();
  if (!s) return undefined;

  // yyyy-mm-dd
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return safeDate(Number(y), Number(mo) - 1, Number(d));
  }

  // dd/mm/yyyy or dd-mm-yyyy
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    const [, dRaw, moRaw, yRaw] = m;
    const day = Number(dRaw);
    const month = Number(moRaw) - 1;
    const yearRaw = Number(yRaw);
    const year = (yRaw ?? '').length === 2 ? 2000 + yearRaw : yearRaw;
    return safeDate(year, month, day);
  }

  // Fallback — accept anything `Date` can parse (covers ISO with time
  // and locale-friendly strings); still filter out NaN.
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? undefined : zeroTime(fallback);
}

function safeDate(year: number, month: number, day: number): Date | undefined {
  const d = new Date(Date.UTC(year, month, day));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month ||
    d.getUTCDate() !== day
  ) {
    return undefined;
  }
  return d;
}

function zeroTime(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Parse a numeric string accepting common bank-statement formats:
 *   - `1,234.56` (US/GT convention)
 *   - `1.234,56` (EU convention)
 *   - `(123.45)` → -123.45 (accounting-notation parens)
 *   - Currency prefixes `Q`, `USD`, `$` are stripped
 */
export function parseNumber(input: string): number | undefined {
  const raw = input.trim();
  if (!raw) return undefined;

  const parensNegative = raw.startsWith('(') && raw.endsWith(')');
  const inner = parensNegative ? raw.slice(1, -1) : raw;

  // Strip currency and letter prefixes; keep digits, separators, minus.
  let cleaned = inner.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return undefined;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    /*
     * Both separators present. The LAST one is the decimal point; the
     * other is a thousands separator we strip. Handles both
     * `1,234.56` and `1.234,56` correctly.
     */
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    /*
     * Comma only — ambiguous. If there are 3 digits after the last
     * comma, treat as thousands (remove); otherwise treat as decimal
     * (replace with `.`).
     */
    const after = cleaned.slice(cleaned.lastIndexOf(',') + 1);
    cleaned = after.length === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  }

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return parensNegative ? -Math.abs(n) : n;
}
