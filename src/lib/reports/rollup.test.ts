import { describe, expect, it } from 'vitest';
import type { CategoryBucket } from './aggregations';
import { rollupCategories } from './rollup';

function bucket(category: string, total: number, percent: number, count = 1): CategoryBucket {
  return { category, total, percent, count };
}

describe('rollupCategories', () => {
  it('returns input unchanged when length <= limit', () => {
    const data = [bucket('A', 100, 50), bucket('B', 100, 50)];
    expect(rollupCategories(data, { limit: 6, othersLabel: 'Otros' })).toEqual(data);
  });

  it('rolls tail into a single "Otros" bucket past limit', () => {
    const data = [
      bucket('A', 100, 25),
      bucket('B', 100, 25),
      bucket('C', 80, 20),
      bucket('D', 60, 15),
      bucket('E', 40, 10),
      bucket('F', 20, 5),
      bucket('G', 10, 2.5),
      bucket('H', 10, 2.5),
    ];
    const result = rollupCategories(data, { limit: 6, othersLabel: 'Otros' });
    expect(result).toHaveLength(7);
    expect(result.slice(0, 6).map((r) => r.category)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(result[6]).toEqual({ category: 'Otros', total: 20, percent: 5, count: 2 });
  });

  it('sums percents in the tail so the chart still totals ~100%', () => {
    const data = [
      bucket('A', 50, 50),
      bucket('B', 10, 10),
      bucket('C', 10, 10),
      bucket('D', 10, 10),
      bucket('E', 10, 10),
      bucket('F', 5, 5),
      bucket('G', 5, 5),
    ];
    const result = rollupCategories(data, { limit: 6, othersLabel: 'Otros' });
    const sum = result.reduce((s, r) => s + r.percent, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('honors the default limit (6) when not specified', () => {
    const data = Array.from({ length: 10 }, (_, i) => bucket(`C${i.toString()}`, 10, 10));
    const result = rollupCategories(data, { othersLabel: 'Otros' });
    expect(result).toHaveLength(7);
    expect(result[6]?.category).toBe('Otros');
    expect(result[6]?.count).toBe(4);
  });

  it('uses the caller-provided label', () => {
    const data = Array.from({ length: 8 }, (_, i) => bucket(`C${i.toString()}`, 10, 12.5));
    const result = rollupCategories(data, { limit: 5, othersLabel: 'Resto' });
    expect(result[5]?.category).toBe('Resto');
  });
});
