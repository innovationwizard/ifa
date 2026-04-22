/**
 * Duplicate-detection helpers for incoming transactions (S-3.11).
 *
 * "Duplicate" here is a heuristic match on the triplet
 * `(date, amount, description)` within ±90 days of the incoming
 * row's date. The choice is deliberate:
 *
 *   - `externalId` already catches exact re-imports (same CSV
 *     uploaded twice) via the `(profileId, source, externalId)`
 *     unique constraint on the schema. This flag catches the
 *     *cross-source* case: a MANUAL entry for the same gas
 *     purchase that also comes in via CSV.
 *
 *   - ±90 days is a looseness budget. A match from 2 years ago
 *     is almost certainly a coincidence (same merchant, same
 *     monthly amount); a match from last week is almost
 *     certainly a duplicate.
 *
 *   - Exact description match for MVP. Fuzzy (case-insensitive,
 *     whitespace-normalized, trigram) lands when the AI
 *     categorization pipeline arrives and the `pg_trgm` GIN index
 *     is cheap to query.
 *
 * Users can dismiss a false-positive; that writes
 * `metadata.duplicateDismissed = true` on the flagged row. Once
 * dismissed, the UI stops showing the badge.
 */

import { Prisma } from '@prisma/client';

export const DUPLICATE_WINDOW_DAYS = 90;

export interface DuplicateTriplet {
  /** Zero-time Date — matches the `@db.Date` column convention. */
  date: Date;
  /** Signed decimal amount as a string (Decimal-safe). */
  amount: string;
  description: string;
}

/**
 * Deterministic string key for in-memory triplet lookup. Used by
 * the batch-import path where we prefetch all candidates in the
 * date window once and then filter in-memory against the batch's
 * rows.
 */
export function tripletKey(t: DuplicateTriplet): string {
  const dateKey = t.date.toISOString().slice(0, 10);
  return `${dateKey}|${t.amount}|${t.description}`;
}

/**
 * ±90-day window centered on the given date, as UTC dates. Use the
 * output to constrain the candidate lookup — any transaction whose
 * `date` falls outside this window is skipped, bounding query cost
 * even for users with multiple years of history.
 */
export function duplicateWindow(
  around: Date,
  days = DUPLICATE_WINDOW_DAYS,
): {
  gte: Date;
  lte: Date;
} {
  const gte = new Date(
    Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), around.getUTCDate() - days),
  );
  const lte = new Date(
    Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), around.getUTCDate() + days),
  );
  return { gte, lte };
}

/**
 * Normalize an amount value to its canonical string form. Prisma
 * `Decimal`, plain `number`, and `string` all map to the same
 * two-decimal representation, which is what `tripletKey` consumes.
 */
export function amountToString(amount: Prisma.Decimal | number | string): string {
  if (typeof amount === 'string') return new Prisma.Decimal(amount).toFixed(2);
  if (typeof amount === 'number') return amount.toFixed(2);
  return amount.toFixed(2);
}

/**
 * Shape extracted from `Transaction.metadata` by UI consumers.
 * Metadata is a free-form JSONB — this helper keeps the access
 * pattern documented in one place.
 */
export interface DuplicateMetadata {
  possibleDuplicateOf?: string;
  duplicateDismissed?: boolean;
}

export function readDuplicateMetadata(metadata: unknown): DuplicateMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  const m = metadata as Record<string, unknown>;
  const out: DuplicateMetadata = {};
  if (typeof m.possibleDuplicateOf === 'string') {
    out.possibleDuplicateOf = m.possibleDuplicateOf;
  }
  if (m.duplicateDismissed === true) {
    out.duplicateDismissed = true;
  }
  return out;
}

export function hasActiveDuplicateFlag(metadata: unknown): boolean {
  const m = readDuplicateMetadata(metadata);
  return Boolean(m.possibleDuplicateOf) && !m.duplicateDismissed;
}
