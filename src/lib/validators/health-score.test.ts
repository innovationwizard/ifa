import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT_DEFAULT,
  HISTORY_LIMIT_MAX,
  RECOMPUTE_THROTTLE_MS,
  historyQuerySchema,
  throttleRemainingMs,
  throttleRetryAfterSeconds,
} from './health-score';

const NOW = new Date('2026-05-21T12:00:00Z');

describe('historyQuerySchema', () => {
  it('defaults to HISTORY_LIMIT_DEFAULT when historyLimit is missing', () => {
    expect(historyQuerySchema.parse({}).historyLimit).toBe(HISTORY_LIMIT_DEFAULT);
  });
  it('clamps to HISTORY_LIMIT_MAX when given a larger value', () => {
    expect(historyQuerySchema.parse({ historyLimit: 9999 }).historyLimit).toBe(HISTORY_LIMIT_MAX);
  });
  it('clamps to 1 at the lower bound', () => {
    expect(historyQuerySchema.parse({ historyLimit: 0 }).historyLimit).toBe(1);
    expect(historyQuerySchema.parse({ historyLimit: -10 }).historyLimit).toBe(1);
  });
  it('accepts a numeric string (from URL query params)', () => {
    expect(historyQuerySchema.parse({ historyLimit: '15' }).historyLimit).toBe(15);
  });
  it('falls back to default on a non-numeric string', () => {
    expect(historyQuerySchema.parse({ historyLimit: 'banana' }).historyLimit).toBe(
      HISTORY_LIMIT_DEFAULT,
    );
  });
  it('floors fractional inputs', () => {
    expect(historyQuerySchema.parse({ historyLimit: 30.9 }).historyLimit).toBe(30);
  });
});

describe('throttleRemainingMs', () => {
  it('returns 0 when there is no prior recompute', () => {
    expect(throttleRemainingMs(null, NOW)).toBe(0);
  });
  it('returns 0 when the prior recompute is older than the throttle window', () => {
    const past = new Date(NOW.getTime() - RECOMPUTE_THROTTLE_MS - 1);
    expect(throttleRemainingMs(past, NOW)).toBe(0);
  });
  it('returns 0 when the prior recompute is exactly at the window edge', () => {
    const edge = new Date(NOW.getTime() - RECOMPUTE_THROTTLE_MS);
    expect(throttleRemainingMs(edge, NOW)).toBe(0);
  });
  it('returns the positive remaining ms inside the window', () => {
    const recent = new Date(NOW.getTime() - 10 * 60 * 1000); // 10 min ago
    expect(throttleRemainingMs(recent, NOW)).toBe(RECOMPUTE_THROTTLE_MS - 10 * 60 * 1000);
  });
});

describe('throttleRetryAfterSeconds', () => {
  it('returns 0 when outside the window', () => {
    expect(throttleRetryAfterSeconds(null, NOW)).toBe(0);
  });
  it('rounds up to the nearest second', () => {
    /*
     * 59m 59.5s ago → 0.5s remaining → ceil = 1.
     */
    const recent = new Date(NOW.getTime() - (RECOMPUTE_THROTTLE_MS - 500));
    expect(throttleRetryAfterSeconds(recent, NOW)).toBe(1);
  });
  it('returns 3600 when the prior recompute is at "just now"', () => {
    expect(throttleRetryAfterSeconds(NOW, NOW)).toBe(3600);
  });
});
