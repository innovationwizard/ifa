import { describe, expect, it } from 'vitest';
import { buildExportFileName, rowsToCsv, type ExportRow } from './csv-export';

function makeRow(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    id: '01900000-0000-7000-8000-000000000000',
    date: '2026-04-21',
    description: 'Cafe Luna',
    merchantName: 'Cafe Luna',
    merchantNit: '1234567',
    amount: '25.00',
    currency: 'GTQ',
    source: 'BANK_CSV',
    reconciliationStatus: 'UNMATCHED',
    type: 'EXPENSE',
    ...overrides,
  };
}

describe('rowsToCsv', () => {
  it('emits the header row first', () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe(
      'id,date,type,source,description,merchantName,merchantNit,amount,currency,reconciliationStatus',
    );
  });

  it('serializes a simple row with CRLF separators', () => {
    const csv = rowsToCsv([makeRow()]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '01900000-0000-7000-8000-000000000000,2026-04-21,EXPENSE,BANK_CSV,Cafe Luna,Cafe Luna,1234567,25.00,GTQ,UNMATCHED',
    );
  });

  it('quotes fields containing commas', () => {
    const csv = rowsToCsv([makeRow({ description: 'Pago, Shell' })]);
    expect(csv).toContain('"Pago, Shell"');
  });

  it('doubles embedded quotes per RFC 4180', () => {
    const csv = rowsToCsv([makeRow({ description: 'Cafe "Luna"' })]);
    expect(csv).toContain('"Cafe ""Luna"""');
  });

  it('quotes fields with newlines', () => {
    const csv = rowsToCsv([makeRow({ description: 'Line 1\nLine 2' })]);
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('emits empty cells for null fields', () => {
    const csv = rowsToCsv([makeRow({ merchantName: null, merchantNit: null })]);
    // Grab the data row; look for the two adjacent empty cells.
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('Cafe Luna,,,');
  });
});

describe('buildExportFileName', () => {
  it('builds a timestamped filename with zero-padded components', () => {
    const name = buildExportFileName(new Date(2026, 3, 5, 9, 7));
    expect(name).toBe('ifa-movimientos-20260405-0907.csv');
  });

  it('uses the current date by default (format check only)', () => {
    const name = buildExportFileName();
    expect(name).toMatch(/^ifa-movimientos-\d{8}-\d{4}\.csv$/);
  });
});
