import type { Prisma, User } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * User repository.
 *
 * `User.id` is the Supabase Auth user UUID (NOT generated here). Every
 * row is inserted by `ensureUserAndProfile()` on first sign-in — see
 * `src/lib/auth/ensure-user-profile.ts`.
 *
 * Like `profileRepo`, this table is NOT tenant-scoped — the multi-
 * tenancy Prisma extension skips it so sign-in bootstrap can find
 * the row before any tenant context exists.
 */
export const userRepo = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  /**
   * Idempotent insert-or-update keyed by the Supabase Auth user id.
   * Called on every successful sign-in so name/avatar refresh if the
   * OAuth provider changed them upstream. Email on update is NOT
   * touched because Supabase handles email-change flows separately
   * (and we don't want a stale OAuth email to overwrite a user-
   * confirmed change).
   */
  upsert(data: {
    id: string;
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    return prisma.user.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        email: data.email,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
      update: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
    });
  },

  update(args: Prisma.UserUpdateArgs): Promise<User> {
    return prisma.user.update(args);
  },
};

export type UserRepo = typeof userRepo;
