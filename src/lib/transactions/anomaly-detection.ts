/**
 * Anomaly-detection metadata helpers (Phase 6/7 Batch 8).
 *
 * Mirrors the shape of `duplicate-detection.ts` so feed-row consumers
 * have a uniform way to peek at `Transaction.metadata` regardless of
 * which signal they care about.
 *
 * The metadata blob written by the `DETECT_ANOMALY` job handler:
 *
 *     metadata.anomaly = {
 *       method: 'new_merchant' | 'merchant_zscore',
 *       zScore: number,
 *       detectedAt: string,           // ISO-8601 timestamp
 *       dismissed?: true,             // set by the user-dismiss action
 *     }
 *
 * `hasActiveAnomalyFlag` returns true when an anomaly was detected
 * AND the user hasn't dismissed it. The feed renders the badge based
 * on this single boolean — the underlying shape stays internal.
 */

import type { AnomalyMethod } from '@/lib/intelligence/anomalies';

export interface AnomalyMetadata {
  method?: AnomalyMethod;
  zScore?: number;
  detectedAt?: string;
  dismissed?: boolean;
}

const KNOWN_METHODS: ReadonlySet<AnomalyMethod> = new Set<AnomalyMethod>([
  'new_merchant',
  'merchant_zscore',
]);

/**
 * Extract the anomaly slice from a `Transaction.metadata` JSONB
 * payload, validating each field's shape so unrelated metadata keys
 * (or an empty/null metadata) never crash the reader.
 */
export function readAnomalyMetadata(metadata: unknown): AnomalyMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  const root = metadata as Record<string, unknown>;
  const anomaly = root.anomaly;
  if (!anomaly || typeof anomaly !== 'object') return {};

  const a = anomaly as Record<string, unknown>;
  const out: AnomalyMetadata = {};

  if (typeof a.method === 'string' && KNOWN_METHODS.has(a.method as AnomalyMethod)) {
    out.method = a.method as AnomalyMethod;
  }
  if (typeof a.zScore === 'number' && Number.isFinite(a.zScore)) {
    out.zScore = a.zScore;
  }
  if (typeof a.detectedAt === 'string') {
    out.detectedAt = a.detectedAt;
  }
  if (a.dismissed === true) {
    out.dismissed = true;
  }

  return out;
}

/**
 * True iff the row currently carries an un-dismissed anomaly flag.
 * Feed rows render the badge from this single boolean.
 */
export function hasActiveAnomalyFlag(metadata: unknown): boolean {
  const a = readAnomalyMetadata(metadata);
  return Boolean(a.method) && !a.dismissed;
}
