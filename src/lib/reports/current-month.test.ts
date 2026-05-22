import { describe, expect, it } from 'vitest';
import { currentMonthInGuatemala } from './current-month';

/*
 * GT is UTC-6 year-round (no DST). The interesting edge cases are
 * the 6h windows where UTC and GT disagree about which calendar
 * month we're in.
 */

describe('currentMonthInGuatemala', () => {
  it('returns the calendar month bounds when called mid-month', () => {
    // 2026-05-15 12:00 UTC → 06:00 GT — clearly May in both zones.
    const result = currentMonthInGuatemala(new Date('2026-05-15T12:00:00Z'));
    expect(result.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(result.monthKey).toBe('2026-05');
  });

  it('picks the GT calendar month, not UTC, near month boundaries', () => {
    /*
     * 2026-06-01 02:00 UTC = 2026-05-31 20:00 GT. UTC has rolled into
     * June; GT is still on May 31. The dashboard's "this month" must
     * read May here, not the empty June bucket.
     */
    const result = currentMonthInGuatemala(new Date('2026-06-01T02:00:00Z'));
    expect(result.monthKey).toBe('2026-05');
    expect(result.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('rolls into the next month once GT itself rolls over', () => {
    // 2026-06-01 06:00 UTC = 2026-06-01 00:00 GT — first instant of June in GT.
    const result = currentMonthInGuatemala(new Date('2026-06-01T06:00:00Z'));
    expect(result.monthKey).toBe('2026-06');
    expect(result.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('handles December → January year rollover (GT timezone)', () => {
    // 2027-01-01 03:00 UTC = 2026-12-31 21:00 GT.
    const result = currentMonthInGuatemala(new Date('2027-01-01T03:00:00Z'));
    expect(result.monthKey).toBe('2026-12');
    expect(result.from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('handles February in a leap year (28-day month)', () => {
    // 2026 is not a leap year — February has 28 days.
    const result = currentMonthInGuatemala(new Date('2026-02-10T12:00:00Z'));
    expect(result.to.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('handles February in a leap year (29 days)', () => {
    // 2028 is a leap year — February has 29 days.
    const result = currentMonthInGuatemala(new Date('2028-02-10T12:00:00Z'));
    expect(result.to.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
});
