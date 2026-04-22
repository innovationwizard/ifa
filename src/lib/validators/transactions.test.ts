import { describe, expect, it } from 'vitest';
import {
  createTransactionBodySchema,
  idempotencyKeySchema,
  listTransactionsQuerySchema,
} from './transactions';

describe('listTransactionsQuerySchema', () => {
  describe('happy paths', () => {
    it('accepts an empty query (all filters optional)', () => {
      const result = listTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('coerces limit from string to int', () => {
      const result = listTransactionsQuerySchema.safeParse({ limit: '25' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBe(25);
    });

    it('coerces dateFrom / dateTo from YYYY-MM-DD strings to Date', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
        expect(result.data.dateTo).toBeInstanceOf(Date);
      }
    });

    it('accepts a complete cursor pair', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: '01900000-0000-7000-8000-000000000000',
        cursorDate: '2026-02-15',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid enum values', () => {
      for (const source of ['FEL', 'TPV', 'BANK_CSV', 'MANUAL']) {
        expect(listTransactionsQuerySchema.safeParse({ source }).success).toBe(true);
      }
    });
  });

  describe('limit bounds', () => {
    it('rejects limit below 1', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    });

    it('rejects limit above 500 (request-side cap)', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
    });

    it('rejects non-integer limit', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '25.5' }).success).toBe(false);
    });
  });

  describe('cursor pairing', () => {
    it('rejects cursorId without cursorDate', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: '01900000-0000-7000-8000-000000000000',
      });
      expect(result.success).toBe(false);
    });

    it('rejects cursorDate without cursorId', () => {
      const result = listTransactionsQuerySchema.safeParse({ cursorDate: '2026-02-15' });
      expect(result.success).toBe(false);
    });

    it('rejects a malformed cursor id (not a UUID)', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: 'not-a-uuid',
        cursorDate: '2026-02-15',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('range ordering', () => {
    it('rejects dateFrom after dateTo', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-06-01',
        dateTo: '2026-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects amountMin greater than amountMax', () => {
      const result = listTransactionsQuerySchema.safeParse({
        amountMin: '500',
        amountMax: '100',
      });
      expect(result.success).toBe(false);
    });

    it('accepts equal dateFrom/dateTo (single-day range)', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-03-15',
        dateTo: '2026-03-15',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('string caps', () => {
    it('rejects merchantNit longer than 50 chars', () => {
      expect(listTransactionsQuerySchema.safeParse({ merchantNit: '1'.repeat(51) }).success).toBe(
        false,
      );
    });

    it('rejects q longer than 100 chars', () => {
      expect(listTransactionsQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    });

    it('trims whitespace around merchantNit + q', () => {
      const result = listTransactionsQuerySchema.safeParse({
        merchantNit: '  12345678  ',
        q: '  gasolina  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merchantNit).toBe('12345678');
        expect(result.data.q).toBe('gasolina');
      }
    });
  });

  describe('unknown values', () => {
    it('rejects a bogus source enum', () => {
      expect(listTransactionsQuerySchema.safeParse({ source: 'NOT_A_SOURCE' }).success).toBe(false);
    });
  });
});

describe('createTransactionBodySchema', () => {
  const validBase = {
    amount: 150.5,
    date: '2026-04-21',
    type: 'EXPENSE',
    description: 'Almuerzo con cliente',
  };

  it('accepts a minimal valid body', () => {
    const result = createTransactionBodySchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(150.5);
      expect(result.data.type).toBe('EXPENSE');
      expect(result.data.description).toBe('Almuerzo con cliente');
    }
  });

  it('accepts all optional fields', () => {
    const result = createTransactionBodySchema.safeParse({
      ...validBase,
      currency: 'USD',
      merchantName: 'Café Aurora',
      merchantNit: '12345678',
      category: 'Comida',
    });
    expect(result.success).toBe(true);
  });

  it('coerces a numeric string to number', () => {
    const result = createTransactionBodySchema.safeParse({ ...validBase, amount: '150.50' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(150.5);
  });

  it('rejects amount with more than 2 decimal places', () => {
    expect(createTransactionBodySchema.safeParse({ ...validBase, amount: 1.234 }).success).toBe(
      false,
    );
  });

  it('accepts negative amounts (e.g. TRANSFER)', () => {
    expect(
      createTransactionBodySchema.safeParse({ ...validBase, type: 'TRANSFER', amount: -100 })
        .success,
    ).toBe(true);
  });

  it('rejects a description of zero length', () => {
    expect(createTransactionBodySchema.safeParse({ ...validBase, description: '' }).success).toBe(
      false,
    );
  });

  it('rejects a description longer than 1000 chars', () => {
    expect(
      createTransactionBodySchema.safeParse({ ...validBase, description: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(
      createTransactionBodySchema.safeParse({ ...validBase, type: 'TRANSFERENCIA' }).success,
    ).toBe(false);
  });

  it('rejects a currency that is not a 3-letter ISO code', () => {
    expect(
      createTransactionBodySchema.safeParse({ ...validBase, currency: 'Quetzal' }).success,
    ).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...validBase, currency: 'gt' }).success).toBe(
      false,
    );
    expect(createTransactionBodySchema.safeParse({ ...validBase, currency: 'gtq' }).success).toBe(
      false,
    );
  });

  it('trims description', () => {
    const result = createTransactionBodySchema.safeParse({
      ...validBase,
      description: '  Compra de combustible  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('Compra de combustible');
  });
});

describe('idempotencyKeySchema', () => {
  it('accepts a standard UUID', () => {
    expect(idempotencyKeySchema.safeParse('01900000-0000-7000-8000-000000000000').success).toBe(
      true,
    );
  });

  it('accepts arbitrary URL-safe tokens', () => {
    expect(idempotencyKeySchema.safeParse('abc_DEF-123.xyz').success).toBe(true);
  });

  it('rejects keys shorter than 8 chars', () => {
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
  });

  it('rejects keys longer than 128 chars', () => {
    expect(idempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('rejects keys with disallowed chars', () => {
    expect(idempotencyKeySchema.safeParse('has spaces!').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('has/slash').success).toBe(false);
  });

  it('trims whitespace', () => {
    const result = idempotencyKeySchema.safeParse('  01900000-0000-7000-8000-000000000000  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('01900000-0000-7000-8000-000000000000');
  });
});
