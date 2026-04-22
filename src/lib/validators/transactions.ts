import { z } from 'zod';

/**
 * Query-param validator for `GET /api/v1/transactions` (S-3.2).
 *
 * The API surface accepts each filter as an independent query param
 * and coerces types where necessary (numbers, dates). `cursorId` and
 * `cursorDate` travel as two separate params for readability — they
 * MUST be supplied together (checked via `.refine`). Callers who want
 * opacity can base64 the pair themselves; we don't enforce opacity
 * here because keyset cursors leak no internal state worth hiding.
 *
 * The output shape matches `transactionRepo.list`'s arg shape cleanly
 * once cursor destructuring happens in the route handler.
 */

const SOURCE_VALUES = ['FEL', 'TPV', 'BANK_CSV', 'MANUAL'] as const;
const RECONCILIATION_STATUS_VALUES = ['UNMATCHED', 'MATCHED', 'MANUAL_MATCH', 'EXCLUDED'] as const;

export const listTransactionsQuerySchema = z
  .object({
    /** Page size — server-side clamped to [1, 200] regardless. */
    limit: z.coerce.number().int().min(1).max(500).optional(),

    /** Cursor id — UUID of the last row from the previous page. */
    cursorId: z.uuid().optional(),
    /** Cursor date — ISO date (YYYY-MM-DD) or full ISO datetime. */
    cursorDate: z.coerce.date().optional(),

    source: z.enum(SOURCE_VALUES).optional(),
    reconciliationStatus: z.enum(RECONCILIATION_STATUS_VALUES).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    amountMin: z.coerce.number().optional(),
    amountMax: z.coerce.number().optional(),
    merchantNit: z.string().trim().min(1).max(50).optional(),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (v) =>
      (v.cursorId === undefined && v.cursorDate === undefined) ||
      (v.cursorId !== undefined && v.cursorDate !== undefined),
    {
      message: 'cursorId and cursorDate must be supplied together',
      path: ['cursorId'],
    },
  )
  .refine((v) => v.dateFrom === undefined || v.dateTo === undefined || v.dateFrom <= v.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  })
  .refine(
    (v) => v.amountMin === undefined || v.amountMax === undefined || v.amountMin <= v.amountMax,
    { message: 'amountMin must be ≤ amountMax', path: ['amountMin'] },
  );

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
