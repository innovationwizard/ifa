import { describe, expect, it } from 'vitest';
import { CHART_OF_ACCOUNTS_TEMPLATE } from '../../../prisma/seed/chart-of-accounts';

/*
 * Pure-data tests for the NIIF-PYME starter chart of accounts. These
 * verify the template is structurally coherent — canonical classes are
 * present, every parent exists, codes are unique. Integration tests
 * that hit the database land in S-11.5 once the test DB fixture is wired.
 */

describe('NIIF-PYME chart of accounts template', () => {
  it('contains the five canonical NIIF-PYME class headers', () => {
    const classHeaders = CHART_OF_ACCOUNTS_TEMPLATE.filter((row) => row.parentCode === null);
    const codes = classHeaders.map((row) => row.code).sort();
    expect(codes).toEqual(['1000', '2000', '3000', '4000', '5000', '6000']);
  });

  it('classifies every account under the right AccountType', () => {
    const byCode = new Map(CHART_OF_ACCOUNTS_TEMPLATE.map((row) => [row.code, row]));
    for (const row of CHART_OF_ACCOUNTS_TEMPLATE) {
      const prefix = row.code[0];
      const expected = {
        '1': 'ASSET',
        '2': 'LIABILITY',
        '3': 'EQUITY',
        '4': 'REVENUE',
        '5': 'EXPENSE',
        '6': 'EXPENSE',
      }[prefix ?? ''];
      expect(row.type, `${row.code} ${row.name}`).toBe(expected);
      expect(byCode.has(row.code)).toBe(true);
    }
  });

  it('has no duplicate codes', () => {
    const codes = CHART_OF_ACCOUNTS_TEMPLATE.map((row) => row.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('every parentCode refers to an existing account', () => {
    const codes = new Set(CHART_OF_ACCOUNTS_TEMPLATE.map((row) => row.code));
    for (const row of CHART_OF_ACCOUNTS_TEMPLATE) {
      if (row.parentCode === null) continue;
      expect(codes.has(row.parentCode), `${row.code} parent ${row.parentCode}`).toBe(true);
    }
  });

  it('parents and children share the same AccountType', () => {
    const byCode = new Map(CHART_OF_ACCOUNTS_TEMPLATE.map((row) => [row.code, row]));
    for (const row of CHART_OF_ACCOUNTS_TEMPLATE) {
      if (row.parentCode === null) continue;
      const parent = byCode.get(row.parentCode)!;
      expect(row.type, `${row.code} (${row.type}) under ${parent.code} (${parent.type})`).toBe(
        parent.type,
      );
    }
  });

  it('has meaningful Spanish names on every row', () => {
    for (const row of CHART_OF_ACCOUNTS_TEMPLATE) {
      expect(row.name.length, `${row.code} name too short`).toBeGreaterThanOrEqual(3);
      expect(row.name).toBe(row.name.trim());
    }
  });
});
