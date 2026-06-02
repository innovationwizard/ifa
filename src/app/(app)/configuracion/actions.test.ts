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

const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const linkIdentityMock = vi.fn();

vi.mock('@/lib/auth/server', () => ({
  createSupabaseServerSideClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: getUserMock,
        updateUser: updateUserMock,
        linkIdentity: linkIdentityMock,
      },
    }),
  ),
  getCurrentUser: vi.fn(),
}));

import { confirmGoogleLink } from './actions';

interface FakeUserOverrides {
  identities?: { provider: string }[] | null;
  lastSignInAt?: string | null;
  pendingAt?: string | null;
}

function fakeUser(overrides: FakeUserOverrides = {}) {
  return {
    id: 'user_uuid_xyz',
    email: 'test@example.com',
    last_sign_in_at: overrides.lastSignInAt ?? new Date().toISOString(),
    identities: overrides.identities ?? [{ provider: 'email' }],
    user_metadata: {
      pendingLinkGoogleRequestedAt: overrides.pendingAt ?? new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * Spy on Date.now so the freshness checks are deterministic.
   * All assertions assume "now" = 2026-06-02T00:00:00Z.
   */
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-02T00:00:00Z').getTime());
});

describe('confirmGoogleLink — security gates (ADR-003)', () => {
  it('refuses when user is not authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'not_authenticated' });
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });

  it('refuses when last_sign_in_at is older than 60s', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: fakeUser({
          // 61 seconds before "now"
          lastSignInAt: new Date('2026-06-01T23:58:59Z').toISOString(),
        }),
      },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'fresh_sign_in_required' });
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });

  it('refuses when no pending-link metadata is set', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          ...fakeUser(),
          user_metadata: {},
        },
      },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'no_pending_change' });
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when pending-link is older than 15 min', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: fakeUser({
          // 16 minutes before "now"
          pendingAt: new Date('2026-06-01T23:44:00Z').toISOString(),
        }),
      },
    });
    updateUserMock.mockResolvedValue({ error: null });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'pending_change_expired' });
    expect(updateUserMock).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });

  it('refuses + clears metadata when Google is already linked', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: fakeUser({
          identities: [{ provider: 'email' }, { provider: 'google' }],
        }),
      },
    });
    updateUserMock.mockResolvedValue({ error: null });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'already_linked' });
    expect(updateUserMock).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
    expect(linkIdentityMock).not.toHaveBeenCalled();
  });

  it('returns link_failed when linkIdentity errors', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser() } });
    linkIdentityMock.mockResolvedValue({
      data: { url: null, provider: 'google' },
      error: { message: 'Manual linking is disabled', name: 'AuthApiError', status: 400 },
    });

    const result = await confirmGoogleLink();

    expect(result).toEqual({ ok: false, errorKey: 'link_failed' });
  });

  it('redirects to the OAuth URL on happy path', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser() } });
    linkIdentityMock.mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth/authorize?state=xyz', provider: 'google' },
      error: null,
    });
    updateUserMock.mockResolvedValue({ error: null });

    /*
     * redirect() is mocked to throw `REDIRECT:<url>` (see vi.mock above).
     * That's how we observe the redirect target without needing
     * NEXT_REDIRECT plumbing.
     */
    await expect(confirmGoogleLink()).rejects.toThrow(
      'REDIRECT:https://accounts.google.com/oauth/authorize?state=xyz',
    );

    expect(linkIdentityMock).toHaveBeenCalledTimes(1);
    const linkCallArg = linkIdentityMock.mock.calls[0]?.[0] as
      | { provider: string; options: { scopes: string; skipBrowserRedirect: boolean } }
      | undefined;
    expect(linkCallArg?.provider).toBe('google');
    expect(linkCallArg?.options.scopes).toBe('email profile openid');
    expect(linkCallArg?.options.skipBrowserRedirect).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith({
      data: { pendingLinkGoogleRequestedAt: null },
    });
  });
});
