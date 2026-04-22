import 'server-only';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { Profile, User } from '@prisma/client';
import { userRepo, profileRepo } from '@/lib/db/repositories';

/**
 * First-sign-in bootstrap.
 *
 * Idempotently ensures that every authenticated Supabase user has:
 *   1. A row in `users` (id = Supabase auth UUID)
 *   2. A Profile (INDIVIDUAL by default, with a 30-day trial)
 *   3. A ProfileMember linking user → profile as OWNER
 *
 * Safe to call on every sign-in — the User upsert is idempotent and
 * the Profile-create runs only when the user has zero Profile rows.
 * Subsequent sign-ins skip creation entirely.
 *
 * Multi-profile caveat: if a user already has at least one Profile,
 * we do NOT create another. Users with multiple Profiles (Canal
 * Contable, team invites) stay on their first one until the profile
 * switcher (S-1.x backlog) lets them pick.
 */
export async function ensureUserAndProfile(authUser: AuthUser): Promise<{
  user: User;
  profile: Profile;
  isFirstSignIn: boolean;
}> {
  if (!authUser.email) {
    /*
     * Every Supabase user we accept has an email (magic link and Google
     * OAuth both require one). This guard catches a corrupted session
     * and fails loudly rather than persisting a row with an empty
     * string that would later violate the unique index on `users.email`.
     */
    throw new Error('ensureUserAndProfile: authUser.email is required but missing');
  }

  const user = await userRepo.upsert({
    id: authUser.id,
    email: authUser.email,
    name: extractOptional(authUser.user_metadata, ['full_name', 'name']),
    avatarUrl: extractOptional(authUser.user_metadata, ['avatar_url', 'picture']),
  });

  const existing = await profileRepo.findManyForUser(user.id);
  const firstProfile = existing[0];
  if (firstProfile) {
    return { user, profile: firstProfile, isFirstSignIn: false };
  }

  const profile = await profileRepo.createForOwner({
    ownerUserId: user.id,
    displayName: deriveDisplayName(authUser),
  });

  return { user, profile, isFirstSignIn: true };
}

/**
 * Derive the best human-readable handle from a Supabase Auth user at
 * first sign-in. Fallback chain:
 *
 *   1. OAuth full_name / name (Google populates these)
 *   2. Email local-part, title-cased
 *   3. 'Usuario' (shouldn't happen — email is required upstream)
 *
 * S-2.8 onboarding lets the user rewrite this to whatever they prefer.
 * Exported for unit testing.
 */
export function deriveDisplayName(authUser: AuthUser): string {
  const metadataName = extractOptional(authUser.user_metadata, ['full_name', 'name']);
  if (metadataName && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  const email = authUser.email ?? '';
  const localPart = email.split('@')[0];
  if (localPart && localPart.length > 0) {
    return titleCase(localPart);
  }
  return 'Usuario';
}

function extractOptional(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function titleCase(input: string): string {
  return input
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
