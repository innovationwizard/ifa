import { describe, expect, it } from 'vitest';
import type { User as AuthUser } from '@supabase/supabase-js';
import { deriveDisplayName } from './ensure-user-profile';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  // Only the fields deriveDisplayName reads need to be realistic — the
  // rest of the Supabase User shape is filled with minimal stubs.
  return {
    id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    email: 'tester@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-04-21T00:00:00Z',
    ...overrides,
  };
}

describe('deriveDisplayName', () => {
  it('prefers user_metadata.full_name when present (Google OAuth shape)', () => {
    const name = deriveDisplayName(
      authUser({
        email: 'juan@gmail.com',
        user_metadata: { full_name: 'Juan Pérez', name: 'Juan' },
      }),
    );
    expect(name).toBe('Juan Pérez');
  });

  it('falls back to user_metadata.name when full_name is absent', () => {
    const name = deriveDisplayName(
      authUser({
        email: 'maria@gmail.com',
        user_metadata: { name: 'María' },
      }),
    );
    expect(name).toBe('María');
  });

  it('ignores empty-string metadata values and falls back to the email prefix', () => {
    const name = deriveDisplayName(
      authUser({
        email: 'carlos.lopez@correo.gt',
        user_metadata: { full_name: '   ', name: '' },
      }),
    );
    expect(name).toBe('Carlos Lopez');
  });

  it('title-cases the email local-part when metadata is missing', () => {
    const name = deriveDisplayName(authUser({ email: 'ana_garcia@correo.gt', user_metadata: {} }));
    expect(name).toBe('Ana Garcia');
  });

  it('handles dot-separated and hyphen-separated email prefixes', () => {
    expect(deriveDisplayName(authUser({ email: 'pedro.martinez@x.y' }))).toBe('Pedro Martinez');
    expect(deriveDisplayName(authUser({ email: 'maria-jose@x.y' }))).toBe('Maria Jose');
  });

  it('falls back to "Usuario" only when email is completely absent', () => {
    /*
     * Supabase's type requires `email: string`, but the runtime can emit
     * users without an email for exotic providers. We model that here
     * by hand-constructing an AuthUser with email missing.
     */
    const missingEmailUser = {
      id: '00000000-0000-0000-0000-000000000000',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-04-21T00:00:00Z',
    } as unknown as AuthUser;
    expect(deriveDisplayName(missingEmailUser)).toBe('Usuario');
  });

  it('trims whitespace around metadata names', () => {
    const name = deriveDisplayName(
      authUser({
        user_metadata: { full_name: '  Laura  ' },
      }),
    );
    expect(name).toBe('Laura');
  });
});
