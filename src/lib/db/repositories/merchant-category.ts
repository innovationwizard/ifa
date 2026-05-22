import type { MerchantCategory, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Per-profile AI categorization cache.
 *
 * `MerchantCategory` is tenant-scoped (TENANT_SCOPED_MODELS in
 * tenancy.ts), so every operation here runs under `withTenant(...)`
 * and the tenancy extension injects `profileId`. Callers never need
 * to pass it explicitly on reads; on writes the extension validates
 * the explicit `profileId` matches the current context (cross-tenant
 * writes are blocked).
 *
 * Surface kept narrow on purpose:
 *   - `findByLookupKey` — the only read shape the categorization
 *     service needs (cache hit lookup).
 *   - `create` — used after a successful AI call. We deliberately
 *     do NOT expose `upsert`: the cache miss → AI call → create
 *     flow lets us return early on a fresh insert and treat the
 *     unique-constraint race (`uniq_profile_lookup_key`) as a
 *     concurrent-write signal (re-fetch instead of overwriting).
 *   - `count` — useful for diagnostics and for the readiness checks
 *     in later stories.
 *
 * `update` / `delete` are out of scope for Batch 3. Manual user
 * overrides (`source: 'USER'`) land with the override UI in a later
 * batch and will add the necessary surface then.
 */
export const merchantCategoryRepo = {
  findByLookupKey(lookupKey: string): Promise<MerchantCategory | null> {
    return prisma.merchantCategory.findFirst({ where: { lookupKey } });
  },

  create(data: Prisma.MerchantCategoryUncheckedCreateInput): Promise<MerchantCategory> {
    return prisma.merchantCategory.create({ data });
  },

  count(args: Prisma.MerchantCategoryCountArgs = {}): Promise<number> {
    return prisma.merchantCategory.count(args);
  },
};

export type MerchantCategoryRepo = typeof merchantCategoryRepo;
