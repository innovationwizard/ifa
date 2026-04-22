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

/**
 * Body validator for `POST /api/v1/transactions` (S-3.4).
 *
 * Matches the Transaction row's required fields (amount, date, type,
 * description) and the common optional metadata (currency, merchant
 * fields, category). Amount is a `number` at the API boundary — we
 * accept both numeric and string inputs via `z.coerce.number()`;
 * Prisma coerces to Decimal internally when writing to the
 * `@db.Decimal(14, 2)` column.
 *
 * Range caps mirror the schema's `@db.Decimal(14, 2)` precision. Any
 * amount with more than 2 decimal places is rejected — GTQ and USD
 * both use centavo precision.
 */
const TRANSACTION_TYPE_VALUES = ['INCOME', 'EXPENSE', 'TRANSFER'] as const;

export const createTransactionBodySchema = z.object({
  amount: z.coerce
    .number()
    .finite()
    .min(-9_999_999_999.99)
    .max(9_999_999_999.99)
    .refine((v) => Number.isInteger(Math.round(v * 100)) && Math.round(v * 100) / 100 === v, {
      message: 'amount must have at most 2 decimal places',
    }),
  date: z.coerce.date(),
  type: z.enum(TRANSACTION_TYPE_VALUES),
  description: z.string().trim().min(1).max(1000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  merchantName: z.string().trim().min(1).max(200).optional(),
  merchantNit: z.string().trim().min(1).max(50).optional(),
  category: z.string().trim().min(1).max(100).optional(),
});

export type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>;

/**
 * Idempotency-Key header validator. Permissive per RFC: 8–128 chars,
 * URL-safe charset. Clients typically generate UUIDs but any stable
 * token works.
 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Idempotency-Key must be URL-safe (A-Z, a-z, 0-9, _, -, .)');
