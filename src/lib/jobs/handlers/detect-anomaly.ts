import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '@/lib/db/prisma';
import { detectAnomaly } from '@/lib/intelligence/anomalies';
import { readAnomalyMetadata } from '@/lib/transactions/anomaly-detection';

/**
 * Job handler — `DETECT_ANOMALY` (Phase 6/7 Batch 8).
 *
 * Payload (set by `transactionRepo.createManualWithAudit` and
 * `createManyFromImport` on insert):
 *
 *     { transactionId: string, profileId: string }
 *
 * Flow:
 *   1. Validate payload via Zod.
 *   2. Look up the candidate transaction via `prismaUnscoped`
 *      scoped by `(id, profileId)` for cross-tenant safety.
 *   3. Idempotency short-circuit: if the row already carries an
 *      `anomaly.method` in metadata, this handler has already run.
 *      No-op so duplicate enqueues are safe.
 *   4. Pull the merchant's prior EXPENSE amounts on this profile,
 *      preferring NIT as the join key (more stable than name) and
 *      falling back to merchantName. Excludes the candidate itself
 *      and any TRANSFER rows.
 *   5. Run `detectAnomaly`. On null → nothing to write, return.
 *   6. Merge `{ anomaly: { method, zScore, detectedAt } }` into the
 *      existing metadata blob — preserves sibling keys like
 *      `possibleDuplicateOf`, `duplicateDismissed`, the FEL/TPV raw
 *      payload echoes, etc.
 *
 * Detection only runs AFTER the transaction is inserted (the queue
 * picks it up on the next cron drain). The feed may briefly show
 * an un-flagged row that gains a badge on the next page refresh —
 * acceptable for MVP per the Batch 8 risk note in the plan.
 */

const PayloadSchema = z.object({
  transactionId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export async function detectAnomalyHandler(rawPayload: Prisma.JsonValue): Promise<void> {
  const payload = PayloadSchema.parse(rawPayload);

  const tx = await prismaUnscoped.transaction.findFirst({
    where: { id: payload.transactionId, profileId: payload.profileId },
    select: {
      id: true,
      type: true,
      amount: true,
      merchantName: true,
      merchantNit: true,
      metadata: true,
    },
  });

  if (!tx) {
    /*
     * Transaction was deleted (or never existed under that tenant)
     * between enqueue and handler execution. Drop the job.
     */
    return;
  }

  /*
   * Idempotency: a prior successful handler run already wrote
   * `anomaly.method`. We respect the prior decision (including a
   * possible user `dismissed: true`) and no-op.
   */
  const existing = readAnomalyMetadata(tx.metadata);
  if (existing.method) {
    return;
  }

  /*
   * Anomaly detection is only meaningful for EXPENSE rows in
   * consumer finance — INCOME (salary deposits) and TRANSFER
   * (intra-account movement) have their own expected variance
   * patterns that don't fit per-merchant z-score.
   */
  if (tx.type !== 'EXPENSE') {
    return;
  }

  /*
   * Build the merchant-history query. We prefer matching on
   * merchantNit (stable across statement formatting variations)
   * and fall back to merchantName. If neither is set there's no
   * meaningful history to compare against — return.
   */
  const merchantNit = tx.merchantNit?.trim();
  const merchantName = tx.merchantName?.trim();
  const whereMerchant =
    merchantNit && merchantNit.length > 0
      ? { merchantNit }
      : merchantName && merchantName.length > 0
        ? { merchantName }
        : null;
  if (!whereMerchant) return;

  const historyRows = await prismaUnscoped.transaction.findMany({
    where: {
      profileId: payload.profileId,
      type: 'EXPENSE',
      id: { not: payload.transactionId },
      ...whereMerchant,
    },
    select: { amount: true },
  });

  const merchantHistory = historyRows.map((r) => Number(r.amount));
  const result = detectAnomaly({
    amount: Number(tx.amount),
    merchantHistory,
  });

  if (!result) return;

  /*
   * JSONB merge: read the current metadata, slot in the new
   * anomaly subkey, write back. Doing this client-side keeps
   * the SQL simple (no jsonb_set / nested CASE) and lets the
   * Zod validators above stay the only schema surface.
   */
  const baseMetadata =
    tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
      ? (tx.metadata as Record<string, unknown>)
      : {};

  await prismaUnscoped.transaction.update({
    where: { id: payload.transactionId },
    data: {
      metadata: {
        ...baseMetadata,
        anomaly: {
          method: result.method,
          zScore: result.zScore,
          detectedAt: new Date().toISOString(),
        },
      },
    },
  });
}
