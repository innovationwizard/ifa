import 'server-only';
import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from './prisma';

/**
 * Stripe webhook idempotency helper (Phase L5).
 *
 * Lives inside `src/lib/db/` so it can reach the Prisma client directly
 * (the lint rule restricts prisma access elsewhere). The webhook route
 * imports `recordStripeEventOnce` to get bulletproof "exactly-once"
 * delivery semantics:
 *
 *   1. Open a Prisma `$transaction`.
 *   2. Try to INSERT a row in `stripe_event_logs` keyed by `eventId`
 *      (= Stripe's `event.id`).
 *   3. If the INSERT fires (first delivery), run the caller's `apply`
 *      callback on the same transaction client.
 *   4. Commit. The Stripe event id is now in the log; future
 *      redeliveries with the same id will P2002 on the INSERT.
 *
 * `prismaUnscoped` is intentional — webhook calls have no tenant
 * context (Stripe → us, not a logged-in user). The lack of tenant
 * filter does not loosen safety here because the only writes are:
 *   - `stripe_event_logs` (global table, no tenant column)
 *   - Profile fields driven by Stripe-side ids (`stripeCustomerId` /
 *     `stripeSubscriptionId`) that are intrinsically tenant-scoped
 *     via Stripe's own customer/subscription ownership model.
 */

export type StripeEventOutcome = 'processed' | 'duplicate';

export async function recordStripeEventOnce(args: {
  eventId: string;
  eventType: string;
  apply: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<StripeEventOutcome> {
  try {
    await prismaUnscoped.$transaction(async (tx) => {
      await tx.stripeEventLog.create({
        data: { id: args.eventId, eventType: args.eventType },
      });
      await args.apply(tx);
    });
    return 'processed';
  } catch (err) {
    if (isUniqueViolation(err)) {
      /*
       * Event id already in the log. Stripe is retrying after we
       * already acked + committed; the apply callback has already
       * run and Profile state is already current. Return `duplicate`
       * so the route can 200 without re-running anything.
       */
      return 'duplicate';
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err !== null && typeof err === 'object' && 'code' in err && err.code === 'P2002';
}
