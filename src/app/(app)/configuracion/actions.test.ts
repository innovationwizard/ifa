/**
 * @vitest-environment node
 *
 * Tests for `confirmGoogleLink` (Phase L3.5.5) — the bank-grade re-auth
 * gate locked by [ADR-003](../../../../docs_operations/_DECISIONS.md#adr-003).
 *
 * Why these tests exist (and not for the L3.4 confirm action): the gates
 * ARE the security surface. We need explicit assertions that:
 *
 *   - last_sign_in_at older than 60s → refuse with fresh_sign_in_required
 *   - missing pending metadata → refuse with no_pending_change
 *   - pending metadata older than 15 min → refuse with pending_change_expired
 *   - already-linked Google identity → refuse with already_linked
 *   - happy path → linkIdentity called + server-side redirect issued
 *
 * Anything that loosens a gate gets caught here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Map<string, string>())),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock('@/lib/env', () => ({
  publicEnv: {
    siteUrl: 'https://test.ifa.example',
    supabaseUrl: 'unused',
    supabaseAnonKey: 'unused',
  },
}));

/*
 * vi.hoisted lifts these mock refs alongside vi.mock so factory
 * closures can reference them. vi.mock hoists above top-level const
 * declarations; vi.hoisted is the escape hatch that puts our refs
 * up there too.
 */
const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
  signOut: vi.fn(),
  adminUpdateUserById: vi.fn(),
  profileFindManyForUser: vi.fn(),
  profileSoftDeleteAccount: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  createSupabaseServerSideClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: m.getUser,
        updateUser: m.updateUser,
        linkIdentity: m.linkIdentity,
        unlinkIdentity: m.unlinkIdentity,
        signOut: m.signOut,
      },
    }),
  ),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/storage/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    auth: {
      admin: {
        updateUserById: m.adminUpdateUserById,
      },
    },
  })),
  IMPORTS_BUCKET: 'imports',
}));

vi.mock('@/lib/db/repositories', () => ({
  profileRepo: {
    findManyForUser: m.profileFindManyForUser,
    softDeleteAccount: m.profileSoftDeleteAccount,
  },
}));

import { confirmAccountDeletion, confirmGoogleLink, confirmGoogleUnlink } from './actions';

interface FakeUserOverrides {
  identities?: { provider: string }[] | null;
  lastSignInAt?: string | null;
  pendingAt?: string | null;
  metadataKey?: 'pendingLinkGoogleRequestedAt' | 'pendingUnlinkGoogleRequestedAt';
}

function fakeUser(overrides: FakeUserOverrides = {}) {
  const metadataKey = overrides.metadataKey ?? 'pendingLinkGoogleRequestedAt';
  return {
    id: 'user_uuid_xyz',
    email: 'test@example.com',
    last_sign_in_at: overrides.lastSignInAt ?? new Date().toISOString(),
    identities: overrides.identities ?? [{ provider: 'email' }],
    user_metadata: {
      [metadataKey]: overrides.pendingAt ?? new Date().toISOString(),
    },
  };
}

function unlinkFakeUser(overrides: Omit<FakeUserOverrides, 'metadataKey'> = {}) {
  /*
   * Default identities for an unlink test: email + google (length 2),
   * so the last-identity gate doesn't trip unless overridden.
   */
  return fakeUser({
    ...overrides,
    metadataKey: 'pendingUnlinkGoogleRequestedAt',
    identities: overrides.identities ?? [{ provider: 'email' }, { provider: 'google' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * Spy on Date.now so the freshness checks are deterministic.
   * All assertions assume "now" = 2026-06-02T00:00:00Z.
   */
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-02T00:00:00Z').getTime());

  /*
   * Default profileRepo behavior for the L3.7 happy path. Tests that
   * exercise no-profile / soft-delete-failure override these.
   */
  m.profileFindManyForUser.mockResolvedValue([{ id: 'profile_uuid_abc' }]);
  m.profileSoftDeleteAccount.mockResolvedValue({
    profileUpdated: true,
    membersDeactivated: 1,
  });
});

describe('confirmGoogleLink — security gates (ADR-003)', () => {
  it('refuses when user is not authenticated', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'not_authenticated' });
    expect(m.linkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when last_sign_in_at is older than 60s', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: fakeUser({
          // 61 seconds before "now"
          lastSignInAt: new Date('2026-06-01T23:58:59Z').toISOString(),
        }),
      },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'fresh_sign_in_required' });
    expect(m.linkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when no pending-link metadata is set', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: {
          ...fakeUser(),
          user_metadata: {},
        },
      },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'no_pending_change' });
    expect(m.linkIdentity).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when pending-link is older than 15 min', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: fakeUser({
          // 16 minutes before "now"
          pendingAt: new Date('2026-06-01T23:44:00Z').toISOString(),
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'pending_change_expired' });
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
    expect(m.linkIdentity).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when Google is already linked', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: fakeUser({
          identities: [{ provider: 'email' }, { provider: 'google' }],
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'already_linked' });
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
    expect(m.linkIdentity).not.toHaveBeenCalled();
  });

  it('returns link_failed when linkIdentity errors', async () => {
    m.getUser.mockResolvedValue({ data: { user: fakeUser() } });
    m.linkIdentity.mockResolvedValue({
      data: { url: null, provider: 'google' },
      error: { message: 'Manual linking is disabled', name: 'AuthApiError', status: 400 },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'link_failed' });
  });

  it('redirects to the OAuth URL on happy path', async () => {
    m.getUser.mockResolvedValue({ data: { user: fakeUser() } });
    m.linkIdentity.mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth/authorize?state=xyz', provider: 'google' },
      error: null,
    });
    m.updateUser.mockResolvedValue({ error: null });

    /*
     * redirect() is mocked to throw `REDIRECT:<url>` (see vi.mock above).
     * That's how we observe the redirect target without needing
     * NEXT_REDIRECT plumbing.
     */
    await expect(confirmGoogleLink()).rejects.toThrow(
      'REDIRECT:https://accounts.google.com/oauth/authorize?state=xyz',
    );

    expect(m.linkIdentity).toHaveBeenCalledTimes(1);
    const linkCallArg = m.linkIdentity.mock.calls[0]?.[0] as
      | { provider: string; options: { scopes: string; skipBrowserRedirect: boolean } }
      | undefined;
    expect(linkCallArg?.provider).toBe('google');
    expect(linkCallArg?.options.scopes).toBe('email profile openid');
    expect(linkCallArg?.options.skipBrowserRedirect).toBe(true);
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
  });
});

describe('confirmGoogleUnlink — security gates (ADR-003)', () => {
  it('refuses when user is not authenticated', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'not_authenticated' });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when last_sign_in_at is older than 60s', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: unlinkFakeUser({
          lastSignInAt: new Date('2026-06-01T23:58:59Z').toISOString(),
        }),
      },
    });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'fresh_sign_in_required' });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when no pending-unlink metadata is set', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: {
          ...unlinkFakeUser(),
          user_metadata: {},
        },
      },
    });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'no_pending_change' });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when pending-unlink is older than 15 min', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: unlinkFakeUser({
          pendingAt: new Date('2026-06-01T23:44:00Z').toISOString(),
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'pending_change_expired' });
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingUnlinkGoogleRequestedAt: null },
    });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when Google is not linked', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: unlinkFakeUser({
          identities: [{ provider: 'email' }],
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'not_linked' });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('refuses when Google is the only identity (would strand user)', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: unlinkFakeUser({
          identities: [{ provider: 'google' }],
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'last_identity' });
    expect(m.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('returns unlink_failed when unlinkIdentity errors', async () => {
    m.getUser.mockResolvedValue({ data: { user: unlinkFakeUser() } });
    m.unlinkIdentity.mockResolvedValue({
      data: null,
      error: { message: 'Manual linking is disabled', name: 'AuthApiError', status: 400 },
    });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: false, errorKey: 'unlink_failed' });
  });

  it('unlinks Google + clears metadata + returns ok on happy path', async () => {
    m.getUser.mockResolvedValue({ data: { user: unlinkFakeUser() } });
    m.unlinkIdentity.mockResolvedValue({ data: {}, error: null });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmGoogleUnlink();

    expect(result).toEqual({ ok: true });
    expect(m.unlinkIdentity).toHaveBeenCalledTimes(1);
    const arg = m.unlinkIdentity.mock.calls[0]?.[0] as { provider: string } | undefined;
    expect(arg?.provider).toBe('google');
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingUnlinkGoogleRequestedAt: null },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* confirmAccountDeletion — Phase L3.7                                        */
/* -------------------------------------------------------------------------- */

function deletionFakeUser(
  overrides: { lastSignInAt?: string | null; pendingAt?: string | null } = {},
) {
  return {
    id: 'user_uuid_xyz',
    email: 'test@example.com',
    last_sign_in_at: overrides.lastSignInAt ?? new Date().toISOString(),
    identities: [{ provider: 'email' }],
    user_metadata: {
      pendingAccountDeletionRequestedAt: overrides.pendingAt ?? new Date().toISOString(),
    },
  };
}

function deletionForm(phrase: string): FormData {
  const fd = new FormData();
  fd.set('confirmationPhrase', phrase);
  return fd;
}

describe('confirmAccountDeletion — security gates (ADR-003)', () => {
  it('refuses when user is not authenticated', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'not_authenticated' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses when last_sign_in_at is older than 60s', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: deletionFakeUser({
          lastSignInAt: new Date('2026-06-01T23:58:59Z').toISOString(),
        }),
      },
    });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'fresh_sign_in_required' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses when no pending-deletion metadata is set', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: { ...deletionFakeUser(), user_metadata: {} },
      },
    });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'no_pending_change' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when pending is older than 15 min', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: deletionFakeUser({
          pendingAt: new Date('2026-06-01T23:44:00Z').toISOString(),
        }),
      },
    });
    m.updateUser.mockResolvedValue({ error: null });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'pending_change_expired' });
    expect(m.updateUser).toHaveBeenCalledWith({
      data: { pendingAccountDeletionRequestedAt: null },
    });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses on phrase mismatch (case-sensitive)', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });

    const result = await confirmAccountDeletion(deletionForm('eliminar mi cuenta'));

    expect(result).toEqual({ ok: false, errorKey: 'phrase_mismatch' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses on phrase mismatch (partial)', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR'));

    expect(result).toEqual({ ok: false, errorKey: 'phrase_mismatch' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('refuses when no profile is found for the user', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });
    m.profileFindManyForUser.mockResolvedValue([]);

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'no_profile' });
    expect(m.profileSoftDeleteAccount).not.toHaveBeenCalled();
  });

  it('returns soft_delete_failed when the DB transaction throws', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });
    m.profileFindManyForUser.mockResolvedValue([{ id: 'profile_uuid_abc' }]);
    m.profileSoftDeleteAccount.mockRejectedValue(new Error('DB connection lost'));

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'soft_delete_failed' });
    expect(m.adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns ban_failed when Supabase ban errors after DB succeeded', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });
    m.profileFindManyForUser.mockResolvedValue([{ id: 'profile_uuid_abc' }]);
    m.profileSoftDeleteAccount.mockResolvedValue({
      profileUpdated: true,
      membersDeactivated: 1,
    });
    m.adminUpdateUserById.mockResolvedValue({
      error: { message: 'admin error', name: 'AuthApiError', status: 500 },
    });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: false, errorKey: 'ban_failed' });
    // DB was still deleted even though ban failed
    expect(m.profileSoftDeleteAccount).toHaveBeenCalledWith('profile_uuid_abc');
  });

  it('soft-deletes + bans + signs out + returns ok on happy path', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });
    m.profileFindManyForUser.mockResolvedValue([{ id: 'profile_uuid_abc' }]);
    m.profileSoftDeleteAccount.mockResolvedValue({
      profileUpdated: true,
      membersDeactivated: 1,
    });
    m.adminUpdateUserById.mockResolvedValue({ error: null });
    m.signOut.mockResolvedValue({ error: null });

    const result = await confirmAccountDeletion(deletionForm('ELIMINAR MI CUENTA'));

    expect(result).toEqual({ ok: true });
    expect(m.profileSoftDeleteAccount).toHaveBeenCalledWith('profile_uuid_abc');
    expect(m.adminUpdateUserById).toHaveBeenCalledWith('user_uuid_xyz', {
      ban_duration: '876000h',
    });
    expect(m.signOut).toHaveBeenCalled();
  });

  it('tolerates whitespace around the phrase but not casing', async () => {
    m.getUser.mockResolvedValue({ data: { user: deletionFakeUser() } });
    m.profileFindManyForUser.mockResolvedValue([{ id: 'profile_uuid_abc' }]);
    m.profileSoftDeleteAccount.mockResolvedValue({
      profileUpdated: true,
      membersDeactivated: 1,
    });
    m.adminUpdateUserById.mockResolvedValue({ error: null });
    m.signOut.mockResolvedValue({ error: null });

    const result = await confirmAccountDeletion(deletionForm('  ELIMINAR MI CUENTA  '));

    expect(result).toEqual({ ok: true });
  });
});
