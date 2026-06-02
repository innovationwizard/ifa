import type { Prisma, Profile } from '@prisma/client';
import { prisma, prismaUnscoped } from '../prisma';
import { TRIAL_DURATION_DAYS } from '@/lib/billing/pricing';

/**
 * Profile repository.
 *
 * `Profile` is the tenant boundary but is NOT itself tenant-scoped — the
 * tenancy extension does not inject a filter on Profile queries. That
 * keeps lookup flows (e.g., "find the profile for this user" during
 * sign-in) from having a chicken-and-egg problem.
 *
 * `delete` is intentionally absent — profile removal follows the soft-
 * delete / purge flow (S-9.7) so audit trails survive.
 */
export const profileRepo = {
  create(data: Prisma.ProfileUncheckedCreateInput): Promise<Profile> {
    return prisma.profile.create({ data });
  },

  findById(id: string): Promise<Profile | null> {
    return prisma.profile.findFirst({ where: { id } });
  },

  findFirst(args: Prisma.ProfileFindFirstArgs): Promise<Profile | null> {
    return prisma.profile.findFirst(args);
  },

  /**
   * Lookup the profiles a user belongs to. Excludes soft-deleted profiles
   * AND soft-deleted membership rows (Phase L3.7 — once an account is
   * marked deleted, the user must never see it again, and the proxy /
   * server-side `getCurrentUser()` plus the Supabase ban that L3.7 sets
   * should prevent them from even reaching code that calls this).
   */
  findManyForUser(userId: string): Promise<Profile[]> {
    return prisma.profile.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId, deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  update(args: Prisma.ProfileUpdateArgs): Promise<Profile> {
    return prisma.profile.update(args);
  },

  count(args: Prisma.ProfileCountArgs = {}): Promise<number> {
    return prisma.profile.count(args);
  },

  /**
   * Iterate-able list of profile ids the nightly Health Score cron
   * should recompute for (Phase 6/7 Batch 15). Excludes `EXPIRED`
   * subscriptions — those users have no UI access, so refreshing
   * their score wastes compute without user benefit. Everyone else
   * (TRIAL / ACTIVE / EARLY_SUPPORTER / PAST_DUE / CANCELED) keeps
   * a fresh score even during grace periods so the dashboard is
   * accurate the moment a billing recovery flips them back to
   * ACTIVE.
   *
   * Returns ids only (not full Profile rows) so the cron's memory
   * footprint stays constant regardless of tenant count. Ordering
   * by `createdAt` is deterministic — useful for the per-profile
   * isolation log when a recompute fails mid-batch.
   */
  async listActiveProfileIds(): Promise<string[]> {
    const rows = await prisma.profile.findMany({
      where: { subscriptionStatus: { not: 'EXPIRED' } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.id);
  },

  /**
   * First-sign-in bootstrap. Creates the Profile row (INDIVIDUAL by
   * default, with `trialEndsAt = now + 30d`) and the OWNER
   * ProfileMember row in a single transaction so there's never a
   * half-created tenant.
   *
   * Uses `prismaUnscoped` because the tenancy extension would throw
   * TenantContextMissingError on the ProfileMember create — this IS
   * the bootstrap path that establishes the tenant context for
   * subsequent requests. Bootstrap is the documented exception in
   * `src/lib/db/prisma.ts`.
   *
   * `displayName` should be the best human-readable handle we have
   * at sign-in time (OAuth full_name → email prefix → generic
   * fallback). S-2.8 onboarding lets the user correct it.
   */
  async createForOwner(args: { ownerUserId: string; displayName: string }): Promise<Profile> {
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    return prismaUnscoped.$transaction(async (tx) => {
      const profile = await tx.profile.create({
        data: {
          type: 'INDIVIDUAL',
          displayName: args.displayName,
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
        },
      });
      await tx.profileMember.create({
        data: {
          profileId: profile.id,
          userId: args.ownerUserId,
          role: 'OWNER',
          joinedAt: now,
        },
      });
      return profile;
    });
  },

  /**
   * All ProfileMember rows for the current tenant. Used by Phase L3.6
   * data export. Caller MUST be inside `withTenant(...)`.
   */
  listMembersForExport() {
    return prisma.profileMember.findMany({
      orderBy: { invitedAt: 'asc' },
    });
  },

  /**
   * Soft-delete an account (Phase L3.7). Sets `deletedAt` on the Profile
   * row AND on every related ProfileMember row atomically. Uses
   * `prismaUnscoped` because we don't want the tenancy extension to
   * inject `where: { profileId }` on the ProfileMember updateMany —
   * the explicit `where` IS the safety boundary, and a future caller
   * that's not inside withTenant (e.g. an admin tool or test) should
   * still be able to invoke this.
   *
   * Returns the affected counts so the calling action can log them
   * (and the founder can audit deletions later).
   *
   * Does NOT touch Supabase Auth (caller bans the user) or Stripe
   * (caller cancels the subscription). Keeping each responsibility
   * separate makes failure recovery clearer: the DB transaction can
   * succeed even if Stripe is down, and we can still ban the user.
   */
  async softDeleteAccount(profileId: string): Promise<{
    profileUpdated: boolean;
    membersDeactivated: number;
  }> {
    const now = new Date();
    return prismaUnscoped.$transaction(async (tx) => {
      const profile = await tx.profile.update({
        where: { id: profileId },
        data: { deletedAt: now },
        select: { id: true },
      });
      const members = await tx.profileMember.updateMany({
        where: { profileId, deletedAt: null },
        data: { deletedAt: now },
      });
      return {
        profileUpdated: Boolean(profile),
        membersDeactivated: members.count,
      };
    });
  },
};

export type ProfileRepo = typeof profileRepo;
