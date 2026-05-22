import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '@/lib/db/prisma';
import { categorizeMerchant } from '@/lib/ai/categorization';

/**
 * Job handler — `CATEGORIZE_TRANSACTION` (Phase 6/7 Batch 5).
 *
 * Payload (set by `transactionRepo.createManualWithAudit` and
 * `createManyFromImport` on insert, and by the
 * `/api/admin/backfill-categorization` route for older rows):
 *
 *     { transactionId: string, profileId: string }
 *
 * Flow:
 *   1. Validate payload via Zod.
 *   2. Look up the transaction via `prismaUnscoped` and pin
 *      profile-scope manually — the queue worker runs outside any
 *      request, so there's no `withTenant` context to inherit.
 *      Going through `prismaUnscoped` with an explicit
 *      `profileId` filter avoids needing a tenant context purely
 *      to read one row.
 *   3. Idempotency short-circuit: if `category` is already set
 *      (manual classification on insert, or a previous handler
 *      run won the race), no-op so duplicate enqueues are safe.
 *   4. Call `categorizeMerchant(profileId, ...)`. Cache hit → fast
 *      path; cache miss → Claude Haiku via the wrapper.
 *   5. On `null` return (Claude error or malformed) throw so the
 *      cron loop calls `markFailed`; the queue's retry-with-backoff
 *      picks it up.
 *   6. On success, write `category` + `aiCategoryConfidence` to
 *      the transaction row.
 *
 * Throws on payload-shape errors, transaction missing/wrong-tenant,
 * categorization failure. Returns normally on idempotent skip or
 * successful update.
 */

const PayloadSchema = z.object({
  transactionId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export async function categorizeTransactionHandler(rawPayload: Prisma.JsonValue): Promise<void> {
  const payload = PayloadSchema.parse(rawPayload);

  const tx = await prismaUnscoped.transaction.findFirst({
    where: { id: payload.transactionId, profileId: payload.profileId },
    select: {
      id: true,
      category: true,
      merchantName: true,
      merchantNit: true,
    },
  });

  if (!tx) {
    /*
     * Transaction was deleted (or never existed under that tenant)
     * between enqueue and handler execution. Drop the job — there's
     * nothing to categorize.
     */
    return;
  }

  /*
   * Idempotency: already-categorized rows are a no-op. This covers
   * the manual-classification path (caller passed `category` on
   * insert), prior successful runs of this handler, and the rare
   * case where two CATEGORIZE_TRANSACTION jobs for the same row
   * race past the queue's locking (both succeed; the second writes
   * the same value).
   */
  if (tx.category !== null) {
    return;
  }

  const result = await categorizeMerchant(payload.profileId, {
    merchantName: tx.merchantName,
    merchantNit: tx.merchantNit,
  });

  if (!result) {
    /*
     * categorizeMerchant returned null — either the merchant input
     * was empty (no NIT, no name) or the AI call failed. Throw so
     * the cron loop marks the job failed; the queue's backoff +
     * dead-letter handles the retry decision. We avoid writing
     * `category` so the row remains a candidate for the next run.
     */
    throw new Error(`categorizeMerchant returned null for transaction ${payload.transactionId}`);
  }

  await prismaUnscoped.transaction.update({
    where: { id: payload.transactionId },
    data: {
      category: result.category,
      aiCategoryConfidence: result.confidence,
    },
  });
}
