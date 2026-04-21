import type { Prisma, Profile } from '@prisma/client';
import { prisma } from '../prisma';

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

  findManyForUser(userId: string): Promise<Profile[]> {
    return prisma.profile.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  update(args: Prisma.ProfileUpdateArgs): Promise<Profile> {
    return prisma.profile.update(args);
  },

  count(args: Prisma.ProfileCountArgs = {}): Promise<number> {
    return prisma.profile.count(args);
  },
};

export type ProfileRepo = typeof profileRepo;
