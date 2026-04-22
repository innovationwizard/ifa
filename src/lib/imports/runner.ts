import Papa from 'papaparse';
import { transactionRepo } from '@/lib/db/repositories';
import { detectColumns, validateMapping, type ColumnMapping } from './column-detect';
import { mapRows, type RowError } from './csv-parser';

/**
 * CSV import orchestrator (S-3.6).
 *
 * Takes a raw CSV string + optional column mapping (the wizard either
 * uses the auto-detected mapping or lets the user override), parses
 * into canonical transactions, and bulk-inserts in batches of 500 via
 * `transactionRepo.createManyFromImport` which delegates to Prisma's
 * `createMany({ skipDuplicates: true })`. The schema's
 * `@@unique([profileId, source, externalId])` constraint catches
 * re-imports — each row's externalId is a hash of its natural
 * properties (see csv-parser.ts), so running the same CSV twice
 * reports `duplicatesSkipped: N` on the second pass.
 *
 * Batch size: 500. Chosen to balance Prisma's statement size against
 * Postgres parameter limits (Supabase pooler has a default of 100k
 * parameters per query). 500 rows × ~10 fields = 5,000 params per
 * `createMany` call — well within limits and fast enough for MVP
 * volumes.
 *
 * Timeout warning: Vercel's 10s free / 60s Pro limit caps the file
 * size this pathway handles before it risks partial commits on a
 * batch. Per `project_compute_constraints.md`, large imports will
 * move to Railway when this becomes painful. MVP accepts the cap
 * and documents the behavior.
 *
 * Partial-commit semantics: if an insert batch fails mid-run, prior
 * batches are already committed. A subsequent retry is idempotent —
 * already-imported rows skip via the unique constraint.
 */

const BATCH_SIZE = 500;

export interface ImportSummary {
  totalRows: number;
  imported: number;
  duplicatesSkipped: number;
  failed: number;
  errors: RowError[];
  detectedBank: string;
}

export interface RunImportInput {
  csv: string;
  mapping?: ColumnMapping;
}

export async function runImport(input: RunImportInput): Promise<ImportSummary> {
  const parsed = Papa.parse<Record<string, string>>(input.csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = Object.keys(parsed.data[0] ?? {});
  const detection = detectColumns(headers);
  const mapping = input.mapping ?? detection.mapping;

  const mappingCheck = validateMapping(mapping);
  if (!mappingCheck.ok) {
    throw new ImportConfigurationError(
      `missing required fields in mapping: ${mappingCheck.missing.join(', ')}`,
    );
  }

  const { transactions, errors } = mapRows(parsed.data, mapping);

  let imported = 0;
  let duplicatesSkipped = 0;
  for (const batch of chunks(transactions, BATCH_SIZE)) {
    const { inserted } = await transactionRepo.createManyFromImport(batch);
    imported += inserted;
    duplicatesSkipped += batch.length - inserted;
  }

  return {
    totalRows: parsed.data.length,
    imported,
    duplicatesSkipped,
    failed: errors.length,
    errors,
    detectedBank: input.mapping ? 'USER_MAPPED' : detection.detectedBank,
  };
}

function* chunks<T>(array: T[], size: number): Generator<T[]> {
  for (let i = 0; i < array.length; i += size) {
    yield array.slice(i, i + size);
  }
}

export class ImportConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportConfigurationError';
  }
}
