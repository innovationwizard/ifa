/**
 * @vitest-environment node
 *
 * Tests for the Phase L5 Stripe webhook handler.
 *
 * The handler's value is in three concerns; this file covers all three:
 *
 *   1. Signature verification — invalid / missing signature MUST 400.
 *   2. Idempotency — duplicate deliveries (same event.id) MUST be
 *      no-ops that still return 200. Stripe retries on any non-2xx.
 *   3. Per-event business state — the right Profile fields move per
 *      event type.
 *
 * We mock the Stripe SDK at the module boundary so signature
 * verification + event construction are deterministic, and mock the
 * Prisma layer so the $transaction wrapper's idempotency contract
 * can be exercised without a real DB.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const m = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  recordOnce: vi.fn(),
  profileUpdate: vi.fn(),
  profileFindFirst: vi.fn(),
  stripeEventLogCreate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  publicEnv: { siteUrl: 'https://test.ifa.example' },
  getStripeEnv: vi.fn(() => ({
    secretKey: 'sk_test_x',
    webhookSecret: 'whsec_x',
    priceIndividualId: 'price_ind',
    priceBusinessId: 'price_bus',
  })),
}));

vi.mock('@/lib/billing/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    webhooks: { constructEvent: m.constructEvent },
  })),
}));

vi.mock('@/lib/db/stripe-event-log', () => ({
  recordStripeEventOnce: m.recordOnce,
}));

import { POST } from './route';

/**
 * Build a fake NextRequest. The handler only reads `headers.get(...)`
 * and `text()`, so a Request shim is sufficient — no need to import
 * NextRequest itself.
 */
function fakeRequest({
  body = '{}',
  signature = 'valid-sig',
}: {
  body?: string;
  signature?: string | null;
} = {}): Parameters<typeof POST>[0] {
  const headers = new Headers();
  if (signature !== null) headers.set('stripe-signature', signature);
  return new Request('https://test.ifa.example/api/stripe/webhook', {
    method: 'POST',
    body,
    headers,
  }) as unknown as Parameters<typeof POST>[0];
}

/**
 * Drive the `recordStripeEventOnce` helper to behave like first-delivery:
 * invoke the caller's `apply` callback with a fake Prisma tx that
 * exposes the per-table mocks, then resolve to 'processed'.
 */
function recordRunsApply() {
  m.recordOnce.mockImplementation(
    async (args: { eventId: string; eventType: string; apply: (tx: unknown) => Promise<void> }) => {
      const tx = {
        stripeEventLog: { create: m.stripeEventLogCreate },
        profile: { update: m.profileUpdate, findFirst: m.profileFindFirst },
      };
      // Record what the route asked us to log so the test can assert.
      await m.stripeEventLogCreate({ data: { id: args.eventId, eventType: args.eventType } });
      await args.apply(tx);
      return 'processed';
    },
  );
}

function recordReportsDuplicate() {
  /*
   * The helper catches P2002 itself and resolves to 'duplicate' —
   * tests don't need to simulate the raw Prisma error.
   */
  m.recordOnce.mockResolvedValue('duplicate');
}

beforeEach(() => {
  vi.clearAllMocks();
  recordRunsApply();
});

/* -------------------------------------------------------------------------- */
/* Signature verification                                                      */
/* -------------------------------------------------------------------------- */

describe('webhook — signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await POST(fakeRequest({ signature: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_signature');
    expect(m.recordOnce).not.toHaveBeenCalled();
  });

  it('returns 400 when constructEvent throws (invalid signature)', async () => {
    m.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    const res = await POST(fakeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_signature');
    expect(m.recordOnce).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                 */
/* -------------------------------------------------------------------------- */

describe('webhook — idempotency', () => {
  function fakeEvent(): Stripe.Event {
    /*
     * Empty `data.object` doesn't match any concrete Stripe object
     * variant — cast through `unknown` for the minimal idempotency
     * test fixture. Tests with real shapes (checkout/subscription/
     * invoice) don't need the cast.
     */
    return {
      id: 'evt_test_1',
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    } as unknown as Stripe.Event;
  }

  it('inserts the StripeEventLog row inside the transaction', async () => {
    m.constructEvent.mockReturnValue(fakeEvent());

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(m.stripeEventLogCreate).toHaveBeenCalledWith({
      data: { id: 'evt_test_1', eventType: 'invoice.payment_succeeded' },
    });
  });

  it('returns 200 with duplicate:true when the event_id was already processed', async () => {
    m.constructEvent.mockReturnValue(fakeEvent());
    recordReportsDuplicate();

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the transaction throws something OTHER than P2002', async () => {
    m.constructEvent.mockReturnValue(fakeEvent());
    m.recordOnce.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('handler_failed');
  });
});

/* -------------------------------------------------------------------------- */
/* Per-event business state                                                    */
/* -------------------------------------------------------------------------- */

describe('webhook — checkout.session.completed', () => {
  it('flips profile to ACTIVE + stores customer/subscription ids', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'profile_uuid_abc',
          subscription: 'sub_abc',
          customer: 'cus_abc',
        },
      },
    });

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(m.profileUpdate).toHaveBeenCalledWith({
      where: { id: 'profile_uuid_abc' },
      data: {
        subscriptionStatus: 'ACTIVE',
        stripeSubscriptionId: 'sub_abc',
        stripeCustomerId: 'cus_abc',
      },
    });
  });

  it('ignores the event if client_reference_id is missing', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_checkout_2',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: null, subscription: 'sub_x', customer: 'cus_x' } },
    });

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(m.profileUpdate).not.toHaveBeenCalled();
  });
});

describe('webhook — customer.subscription.updated', () => {
  it('mirrors subscription status onto the profile', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_sub_upd_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_xyz',
          status: 'active',
          metadata: { profileId: 'profile_uuid_abc' },
          current_period_end: 1782345600, // 2026-...
        },
      },
    });

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(m.profileUpdate).toHaveBeenCalled();
    const call = m.profileUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { subscriptionStatus: string; stripeSubscriptionId: string; currentPeriodEnd?: Date };
    };
    expect(call.where.id).toBe('profile_uuid_abc');
    expect(call.data.subscriptionStatus).toBe('ACTIVE');
    expect(call.data.stripeSubscriptionId).toBe('sub_xyz');
    expect(call.data.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('maps past_due Stripe status to PAST_DUE Profile status', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_sub_past_due',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_xyz',
          status: 'past_due',
          metadata: { profileId: 'profile_uuid_abc' },
        },
      },
    });

    await POST(fakeRequest());

    const call = m.profileUpdate.mock.calls[0]?.[0] as { data: { subscriptionStatus: string } };
    expect(call.data.subscriptionStatus).toBe('PAST_DUE');
  });
});

describe('webhook — customer.subscription.deleted', () => {
  it('sets profile to CANCELED with currentPeriodEnd populated', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_sub_del_1',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_xyz',
          status: 'canceled',
          metadata: { profileId: 'profile_uuid_abc' },
          current_period_end: 1782345600,
        },
      },
    });

    await POST(fakeRequest());

    const call = m.profileUpdate.mock.calls[0]?.[0] as {
      data: { subscriptionStatus: string; currentPeriodEnd?: Date };
    };
    expect(call.data.subscriptionStatus).toBe('CANCELED');
    expect(call.data.currentPeriodEnd).toBeInstanceOf(Date);
  });
});

describe('webhook — invoice.payment_failed', () => {
  it('looks up profile by stripeCustomerId and flips to PAST_DUE', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_inv_fail_1',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_abc' } },
    });
    m.profileFindFirst.mockResolvedValue({ id: 'profile_uuid_abc' });

    await POST(fakeRequest());

    expect(m.profileFindFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_abc' },
    });
    expect(m.profileUpdate).toHaveBeenCalledWith({
      where: { id: 'profile_uuid_abc' },
      data: { subscriptionStatus: 'PAST_DUE' },
    });
  });

  it('ignores the event when no matching profile exists', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_inv_fail_2',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_unknown' } },
    });
    m.profileFindFirst.mockResolvedValue(null);

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(m.profileUpdate).not.toHaveBeenCalled();
  });
});

describe('webhook — invoice.payment_succeeded', () => {
  it('acks without mutating Profile (Stripe sends the receipt itself)', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_inv_ok_1',
      type: 'invoice.payment_succeeded',
      data: { object: { customer: 'cus_abc' } },
    });

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    // Event still gets logged (idempotency)
    expect(m.stripeEventLogCreate).toHaveBeenCalledWith({
      data: { id: 'evt_inv_ok_1', eventType: 'invoice.payment_succeeded' },
    });
    // But no profile mutation
    expect(m.profileUpdate).not.toHaveBeenCalled();
  });
});
