import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import type { Prisma, SubscriptionStatus } from '@prisma/client';
import { recordStripeEventOnce } from '@/lib/db/stripe-event-log';
import { getStripeClient } from '@/lib/billing/stripe';
import { getStripeEnv } from '@/lib/env';

/*
 * POST /api/stripe/webhook — Stripe event receiver.
 *
 * Stripe posts signed event payloads here; we verify the signature
 * against `STRIPE_WEBHOOK_SECRET` and update the Profile's
 * subscription fields to match. Events we care about:
 *
 *   - checkout.session.completed         → stripeSubscriptionId set,
 *                                           status → ACTIVE
 *   - customer.subscription.{created,updated}
 *                                        → sync status + currentPeriodEnd
 *   - customer.subscription.deleted      → status → CANCELED (access
 *                                           until currentPeriodEnd)
 *   - invoice.payment_failed             → status → PAST_DUE
 *   - invoice.payment_succeeded          → ack only; Stripe sends the
 *                                           branded receipt itself
 *                                           (Settings → Invoices →
 *                                           "Email finalized invoices")
 *
 * Other events are acknowledged with 200 but not processed — Stripe
 * retries on non-2xx so acking-and-ignoring keeps their retry queue
 * clean.
 *
 * BULLETPROOF IDEMPOTENCY (Phase L5 — founder decision 2026-06-02:
 * "Security is maximum priority. A single double-spend would destroy
 * adoption."): every event is processed inside a Prisma `$transaction`
 * that ATOMICALLY inserts a `StripeEventLog` row keyed by event.id
 * and applies the Profile mutation. ON CONFLICT (`P2002` unique
 * violation) → event was already processed → return 200 without
 * re-running. Either both writes land or neither does.
 *
 * Non-blocking mode: if Stripe env is not configured, the route
 * returns 503. In that state Stripe won't be pointing at us anyway,
 * so this path should never be hit pre-configuration.
 *
 * IMPORTANT: this route MUST read the raw body to verify the signature.
 * Next.js route handlers give us `request.text()` which returns the raw
 * string — do NOT use `request.json()` here, that re-serializes and
 * breaks signature verification.
 */

export const runtime = 'nodejs';
/*
 * Force dynamic so the handler isn't accidentally cached and so the
 * raw body is never munged by Next's fetch-cache layer.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripeClient();
  const env = getStripeEnv();
  if (!stripe || !env) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }
  if (!env.webhookSecret) {
    return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.webhookSecret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    const outcome = await processEventOnce(event);
    if (outcome === 'duplicate') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    /*
     * Log and 500 so Stripe retries — but never leak the error message
     * in the response body (could echo sensitive customer data).
     */
    console.error('[stripe webhook] handler error', event.type, event.id, error);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Idempotency gate
// ---------------------------------------------------------------------------

/**
 * Process the event inside a transaction wrapped by
 * `recordStripeEventOnce` (see src/lib/db/stripe-event-log.ts).
 * Returns 'duplicate' when the event id was already processed —
 * the route still 200s to quiet Stripe's retry loop.
 */
async function processEventOnce(event: Stripe.Event) {
  const outcome = await recordStripeEventOnce({
    eventId: event.id,
    eventType: event.type,
    apply: (tx) => dispatchEvent(event, tx),
  });
  if (outcome === 'duplicate') {
    console.warn('[stripe webhook] duplicate event ignored', event.type, event.id);
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

async function dispatchEvent(event: Stripe.Event, tx: Prisma.TransactionClient): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, tx);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      await handleSubscriptionUpdated(event.data.object, tx);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object, tx);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object, tx);
      break;
    case 'invoice.payment_succeeded':
      /*
       * Stripe sends the branded receipt itself when "Email finalized
       * invoices to customers" is enabled in the dashboard (see
       * vercel-setup.md §3 — Stripe ops). We acknowledge so the event
       * lands in StripeEventLog (useful for ops queries) but take no
       * Profile action.
       */
      break;
    default:
      // Unhandled event — already logged in StripeEventLog above.
      break;
  }
}

// ---------------------------------------------------------------------------
// Event handlers (all take the transaction client so writes commit
// atomically with the StripeEventLog insert)
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const profileId = session.client_reference_id;
  if (!profileId) return;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  await tx.profile.update({
    where: { id: profileId },
    data: {
      subscriptionStatus: 'ACTIVE',
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const profileId = subscription.metadata.profileId;
  if (!profileId) return;

  const nextStatus = mapStripeStatusToSubscriptionStatus(subscription.status);
  const currentPeriodEnd = firstPeriodEnd(subscription);

  await tx.profile.update({
    where: { id: profileId },
    data: {
      subscriptionStatus: nextStatus,
      stripeSubscriptionId: subscription.id,
      ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    },
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const profileId = subscription.metadata.profileId;
  if (!profileId) return;
  const currentPeriodEnd = firstPeriodEnd(subscription);

  await tx.profile.update({
    where: { id: profileId },
    data: {
      subscriptionStatus: 'CANCELED',
      ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    },
  });
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const profile = await tx.profile.findFirst({ where: { stripeCustomerId: customerId } });
  if (!profile) return;
  await tx.profile.update({
    where: { id: profile.id },
    data: { subscriptionStatus: 'PAST_DUE' },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStripeStatusToSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete':
    case 'incomplete_expired':
      return 'EXPIRED';
    case 'paused':
      return 'PAST_DUE';
    default:
      return 'EXPIRED';
  }
}

/**
 * Pull the period-end timestamp from a Stripe Subscription. The API
 * moved this field across versions — `current_period_end` on the
 * subscription itself, or nested under `items.data[0].current_period_end`
 * on newer revisions. Check both.
 */
function firstPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const withFallback = subscription as unknown as {
    current_period_end?: number;
    items?: { data: { current_period_end?: number }[] };
  };
  const epoch =
    withFallback.current_period_end ?? withFallback.items?.data[0]?.current_period_end ?? null;
  return epoch ? new Date(epoch * 1000) : null;
}
