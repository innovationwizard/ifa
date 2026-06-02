'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser, createSupabaseServerSideClient } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { publicEnv } from '@/lib/env';

/**
 * Server actions for `/configuracion` — Phase L3.3+.
 *
 * One action ships per L3 sub-batch:
 *   - updateProfile (L3.3) — this file.
 *   - requestEmailChange + confirmEmailChange (L3.4) — this file.
 *     Together they implement the bank-grade email-change flow
 *     locked by [ADR-003](../../../../docs_operations/_DECISIONS.md#adr-003).
 *   - L3.5 password reset, L3.6 data export, L3.7 account deletion
 *     all land later as sibling exports here.
 *
 * Auth pattern mirrors `/dashboard/salud/actions.ts` (Phase 6/7 B13):
 * resolve user + profile per call, redirect to /ingresar or
 * /bienvenida on miss, then act under the profile's identity.
 */

/**
 * Update profile form payload.
 *
 *   - displayName: required; min 1 / max 120 chars (loose upper
 *     bound since DB column has no length constraint and we don't
 *     want to surprise users with rejections).
 *   - dpiNumber: optional Guatemalan DPI. Schema says "Stored for
 *     reference only; never validated, never used as a lookup key."
 *     We do a minimal-friction validation: digits-only when present,
 *     up to 13 chars (GT DPI standard length). Empty string → null.
 *   - dateOfBirth: optional ISO date (YYYY-MM-DD). Empty string → null.
 *     Stored as `DateTime? @db.Date` so the time component is dropped.
 */
const UpdateProfilePayloadSchema = z.object({
  displayName: z.string().trim().min(1, 'displayName required').max(120, 'displayName too long'),
  dpiNumber: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || /^\d{1,13}$/.test(v), {
      message: 'dpiNumber must be 1–13 digits or empty',
    }),
  dateOfBirth: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine(
      (v) => {
        if (v === null) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const d = new Date(`${v}T00:00:00Z`);
        return Number.isFinite(d.getTime());
      },
      { message: 'dateOfBirth must be YYYY-MM-DD or empty' },
    ),
});

export interface UpdateProfileResult {
  ok: boolean;
  /** Field-specific or general error key (caller resolves to i18n). */
  errorKey?: 'validation' | 'unknown';
}

async function authedContext(): Promise<{ profileId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  if (profiles.length === 0) redirect('/bienvenida');
  const profile = profiles[0];
  // `profiles.length === 0` already ruled out — `profile` is defined here
  // but TS narrowing through array indexing under `noUncheckedIndexedAccess`
  // still types it as Profile | undefined. Re-check + throw for type safety.
  if (!profile) redirect('/bienvenida');
  return { profileId: profile.id };
}

export async function updateProfile(formData: FormData): Promise<UpdateProfileResult> {
  const ctx = await authedContext();

  /*
   * FormData.get() returns `string | File | null`. Our inputs are
   * all text fields so File never appears in practice — but the
   * type system can't prove that, so we narrow with `typeof === 'string'`
   * to avoid `.toString()` on a File (which produces "[object File]"
   * and would silently fail the schema validation downstream).
   */
  const parsed = UpdateProfilePayloadSchema.safeParse({
    displayName: stringFromForm(formData, 'displayName'),
    dpiNumber: stringFromForm(formData, 'dpiNumber'),
    dateOfBirth: stringFromForm(formData, 'dateOfBirth'),
  });
  if (!parsed.success) {
    return { ok: false, errorKey: 'validation' };
  }

  try {
    await profileRepo.update({
      where: { id: ctx.profileId },
      data: {
        displayName: parsed.data.displayName,
        dpiNumber: parsed.data.dpiNumber,
        dateOfBirth: parsed.data.dateOfBirth
          ? new Date(`${parsed.data.dateOfBirth}T00:00:00Z`)
          : null,
      },
    });
  } catch (err) {
    console.warn('[updateProfile] DB update failed', err);
    return { ok: false, errorKey: 'unknown' };
  }

  /*
   * Revalidate /configuracion so the server-rendered ProfileCard
   * re-fetches with the new values. Also revalidate /dashboard
   * since it greets the user by displayName ("Hola, {firstName}").
   */
  revalidatePath('/configuracion');
  revalidatePath('/dashboard');

  return { ok: true };
}

function stringFromForm(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

// ----------------------------------------------------------------------------
// Email change — Phase L3.4 (ADR-003 bank-grade two-step flow).
// ----------------------------------------------------------------------------

/**
 * Maximum age, in seconds, of the user's `last_sign_in_at` for
 * `confirmEmailChange` to accept the request. The user is expected to
 * complete the entire flow within this window after clicking the
 * magic link sent to their current email. 60s matches the
 * step-up-auth freshness windows that bank web apps typically
 * accept; it's short enough to make session-theft replay impractical
 * but long enough that a real user clicking + reading the
 * confirmation page won't trip it.
 */
const FRESH_SIGN_IN_WINDOW_SECONDS = 60;

/**
 * Maximum age of the `pendingEmailChangeRequestedAt` metadata before
 * the confirmation action refuses to proceed. 15 minutes lets the
 * user click the magic-link email at their leisure but ensures stale
 * pending changes (forgotten requests) don't get applied weeks
 * later.
 */
const PENDING_CHANGE_TTL_SECONDS = 15 * 60;

const EmailSchema = z.string().trim().toLowerCase().email();

export interface RequestEmailChangeResult {
  ok: boolean;
  errorKey?:
    | 'invalid_email'
    | 'same_as_current'
    | 'session_email_missing'
    | 'send_failed'
    | 'unknown';
}

/**
 * Step 1 of the bank-grade email-change flow (ADR-003).
 *
 * User submits the new email. We:
 *   1. Validate the new email syntactically.
 *   2. Reject if it equals the user's current email (no-op + UX
 *      friction).
 *   3. Stash the pending change in `user_metadata.pendingEmailChange`
 *      with a timestamp.
 *   4. Send a magic link via `signInWithOtp` to the user's CURRENT
 *      email (proof-of-possession factor). The magic link's
 *      `emailRedirectTo` points at `/configuracion/confirmar-cambio-correo`,
 *      our confirmation page (Phase L3.4 page route).
 *
 * On success the wizard tells the user "we sent a link to your
 * current email — click it to continue." NO email change happens
 * yet; the magic-link click is the gate.
 */
export async function requestEmailChange(formData: FormData): Promise<RequestEmailChangeResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');
  const currentEmail = user.email;
  if (!currentEmail) {
    return { ok: false, errorKey: 'session_email_missing' };
  }

  const parsed = EmailSchema.safeParse(stringFromForm(formData, 'newEmail'));
  if (!parsed.success) {
    return { ok: false, errorKey: 'invalid_email' };
  }
  const newEmail = parsed.data;
  if (newEmail === currentEmail.toLowerCase()) {
    return { ok: false, errorKey: 'same_as_current' };
  }

  /*
   * Persist the pending change in user_metadata. We deliberately
   * use user_metadata (not app_metadata) because user_metadata is
   * writable by the user's own session — exactly what we need here.
   * Confidentiality isn't a concern: only the user themselves can
   * read their own metadata.
   */
  const requestedAt = new Date().toISOString();
  const { error: stashErr } = await supabase.auth.updateUser({
    data: {
      pendingEmailChange: newEmail,
      pendingEmailChangeRequestedAt: requestedAt,
    },
  });
  if (stashErr) {
    console.warn('[requestEmailChange] metadata stash failed', stashErr);
    return { ok: false, errorKey: 'unknown' };
  }

  /*
   * Send the magic link to the CURRENT email. The link's
   * `emailRedirectTo` lands the user on the confirmation page;
   * Supabase's standard callback (`/auth/callback`) processes the
   * sign-in token first then redirects there.
   *
   * `shouldCreateUser: false` because the email IS registered
   * (it's the signed-in user's own address). Defense in depth: if
   * something somehow doesn't match, we don't want to spin up a
   * second account.
   */
  const origin = await resolveOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/configuracion/confirmar-cambio-correo')}`;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: currentEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (otpErr) {
    console.warn('[requestEmailChange] signInWithOtp failed', otpErr);
    return { ok: false, errorKey: 'send_failed' };
  }

  return { ok: true };
}

export interface ConfirmEmailChangeResult {
  ok: boolean;
  errorKey?:
    | 'not_authenticated'
    | 'fresh_sign_in_required'
    | 'no_pending_change'
    | 'pending_change_expired'
    | 'update_failed'
    | 'unknown';
}

/**
 * Step 2 of the bank-grade email-change flow (ADR-003).
 *
 * Runs from the confirmation page after the user clicks the magic
 * link in their CURRENT email. We:
 *   1. Verify the session is fresh — `last_sign_in_at` within
 *      `FRESH_SIGN_IN_WINDOW_SECONDS`. If not, the session may have
 *      been stolen; refuse and require a new magic-link round trip.
 *   2. Read the pending change from metadata; refuse if missing or
 *      older than `PENDING_CHANGE_TTL_SECONDS`.
 *   3. Call `updateUser({email: pendingEmailChange})` — Supabase's
 *      standard flow sends a confirmation link to the NEW email
 *      and a notification to the OLD email.
 *   4. Clear the metadata.
 *
 * The email change becomes effective only AFTER the user clicks
 * Supabase's confirmation link on the new address. This action
 * just kicks off Supabase's standard flow with all three security
 * factors verified.
 */
export async function confirmEmailChange(): Promise<ConfirmEmailChangeResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, errorKey: 'not_authenticated' };
  }

  /*
   * Freshness check (ADR-003 §3 factor #2: proves possession of
   * current email via just-completed magic-link sign-in).
   */
  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { ok: false, errorKey: 'fresh_sign_in_required' };
  }

  const metadata = user.user_metadata;
  const pendingEmail =
    typeof metadata.pendingEmailChange === 'string' ? metadata.pendingEmailChange : null;
  const pendingAtIso =
    typeof metadata.pendingEmailChangeRequestedAt === 'string'
      ? metadata.pendingEmailChangeRequestedAt
      : null;
  if (!pendingEmail || !pendingAtIso) {
    return { ok: false, errorKey: 'no_pending_change' };
  }
  const pendingAgeSeconds = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAgeSeconds) || pendingAgeSeconds > PENDING_CHANGE_TTL_SECONDS) {
    /*
     * Clear the stale metadata as a side effect so a future request
     * doesn't accidentally re-use it. Best-effort; ignore errors.
     */
    await supabase.auth
      .updateUser({ data: { pendingEmailChange: null, pendingEmailChangeRequestedAt: null } })
      .catch(() => {
        /* swallow — already failing, just being tidy */
      });
    return { ok: false, errorKey: 'pending_change_expired' };
  }

  /*
   * Kick off Supabase's standard email-change flow. Supabase sends:
   *   - confirmation link to the NEW email (factor #3)
   *   - notification to the OLD email (defense-in-depth advisory)
   * Email change becomes effective only after the new-email click.
   */
  const { error: updateErr } = await supabase.auth.updateUser({
    email: pendingEmail,
    data: { pendingEmailChange: null, pendingEmailChangeRequestedAt: null },
  });
  if (updateErr) {
    console.warn('[confirmEmailChange] updateUser failed', updateErr);
    return { ok: false, errorKey: 'update_failed' };
  }

  revalidatePath('/configuracion');
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Link Google identity — Phase L3.5.5 (ADR-003 bank-grade two-step flow).
// ----------------------------------------------------------------------------

/*
 * The connect-Google flow reuses the L3.4 freshness/TTL windows
 * verbatim (FRESH_SIGN_IN_WINDOW_SECONDS, PENDING_CHANGE_TTL_SECONDS).
 * Same security profile: just-clicked magic link + same-session
 * pending action started ≤ 15 min ago.
 *
 * Metadata key: `pendingLinkGoogleRequestedAt` (ISO string). Presence
 * alone signals the action — no value field needed because the action
 * is unambiguous. Independent slot from `pendingEmailChange*` so the
 * two flows can coexist without collision.
 */

export interface RequestGoogleLinkResult {
  ok: boolean;
  errorKey?: 'session_email_missing' | 'already_linked' | 'send_failed' | 'unknown';
}

export async function requestGoogleLink(): Promise<RequestGoogleLinkResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');
  const currentEmail = user.email;
  if (!currentEmail) {
    return { ok: false, errorKey: 'session_email_missing' };
  }

  /*
   * Refuse if Google is already linked. Defense-in-depth — the UI
   * only renders the Connect button when !googleLinked, but a stale
   * page or replayed request could still hit this action.
   */
  const alreadyLinked = (user.identities ?? []).some((i) => i.provider === 'google');
  if (alreadyLinked) {
    return { ok: false, errorKey: 'already_linked' };
  }

  const requestedAt = new Date().toISOString();
  const { error: stashErr } = await supabase.auth.updateUser({
    data: { pendingLinkGoogleRequestedAt: requestedAt },
  });
  if (stashErr) {
    console.warn('[requestGoogleLink] metadata stash failed', stashErr);
    return { ok: false, errorKey: 'unknown' };
  }

  const origin = await resolveOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/configuracion/confirmar-conectar-google')}`;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: currentEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (otpErr) {
    console.warn('[requestGoogleLink] signInWithOtp failed', otpErr);
    return { ok: false, errorKey: 'send_failed' };
  }

  return { ok: true };
}

export interface ConfirmGoogleLinkResult {
  ok: boolean;
  errorKey?:
    | 'not_authenticated'
    | 'fresh_sign_in_required'
    | 'no_pending_change'
    | 'pending_change_expired'
    | 'already_linked'
    | 'link_failed'
    | 'unknown';
}

/**
 * Step 2 of the bank-grade connect-Google flow (ADR-003).
 *
 * Three gates (all required) before the OAuth URL is generated:
 *   1. Authenticated (action redirects to /ingresar if not).
 *   2. `last_sign_in_at` fresh (≤ FRESH_SIGN_IN_WINDOW_SECONDS).
 *   3. `user_metadata.pendingLinkGoogleRequestedAt` set + not stale.
 *
 * On success: clears the pending metadata, calls
 * `supabase.auth.linkIdentity({provider: 'google', skipBrowserRedirect: true})`
 * to generate the OAuth URL, and server-redirects the browser there.
 * Google → /auth/callback → identity linked → /configuracion?linked=google.
 *
 * If linkIdentity errors before redirect, we return the error key and
 * the metadata is NOT cleared (action is retryable).
 *
 * Throws via `redirect(url)` on the happy path — call sites need to
 * treat NEXT_REDIRECT specially (Next.js convention).
 */
export async function confirmGoogleLink(): Promise<ConfirmGoogleLinkResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, errorKey: 'not_authenticated' };
  }

  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { ok: false, errorKey: 'fresh_sign_in_required' };
  }

  const metadata = user.user_metadata;
  const pendingAtIso =
    typeof metadata.pendingLinkGoogleRequestedAt === 'string'
      ? metadata.pendingLinkGoogleRequestedAt
      : null;
  if (!pendingAtIso) {
    return { ok: false, errorKey: 'no_pending_change' };
  }
  const pendingAgeSeconds = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAgeSeconds) || pendingAgeSeconds > PENDING_CHANGE_TTL_SECONDS) {
    await supabase.auth.updateUser({ data: { pendingLinkGoogleRequestedAt: null } }).catch(() => {
      /* swallow — already failing, just being tidy */
    });
    return { ok: false, errorKey: 'pending_change_expired' };
  }

  /*
   * Defense-in-depth: re-check linked state in case a parallel tab
   * already completed a link since the request was issued.
   */
  if ((user.identities ?? []).some((i) => i.provider === 'google')) {
    await supabase.auth.updateUser({ data: { pendingLinkGoogleRequestedAt: null } }).catch(() => {
      /* swallow — already failing, just being tidy */
    });
    return { ok: false, errorKey: 'already_linked' };
  }

  const origin = await resolveOrigin();
  const oauthRedirect = `${origin}/auth/callback?next=${encodeURIComponent('/configuracion?linked=google')}`;
  const { data: oauthData, error: linkErr } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: oauthRedirect,
      scopes: 'email profile openid',
      skipBrowserRedirect: true,
    },
  });
  if (linkErr || !oauthData.url) {
    console.warn('[confirmGoogleLink] linkIdentity failed', linkErr);
    return { ok: false, errorKey: 'link_failed' };
  }

  /*
   * Clear pending metadata BEFORE redirecting so a parallel
   * tab can't re-confirm. Best-effort: if the clear fails we still
   * redirect — the freshness window expires in 60s anyway.
   */
  await supabase.auth.updateUser({ data: { pendingLinkGoogleRequestedAt: null } }).catch(() => {
    /* best-effort cleanup; OAuth URL is already valid */
  });

  redirect(oauthData.url);
}

// ----------------------------------------------------------------------------
// Unlink Google identity — Phase L3.5.6 (ADR-003 bank-grade two-step flow).
// ----------------------------------------------------------------------------

/*
 * Same three-factor gate as L3.4/L3.5.5 (freshness ≤ 60s + pending action
 * ≤ 15 min). Independent metadata slot: `pendingUnlinkGoogleRequestedAt`.
 *
 * Extra safety vs. L3.5.5 (which only verifies !alreadyLinked):
 *   - Google identity must still be present (idempotency).
 *   - User must retain ≥ 1 OTHER identity after unlink. Supabase refuses
 *     to unlink the last identity, but we re-check at our layer so the
 *     UI never even offers the option, and the action returns a typed
 *     error key instead of a Supabase string.
 *
 * Refactor candidate (deferred): L3.4 + L3.5.5 + L3.5.6 all share the
 * (auth + freshness + pending-metadata) gate shape. Three is the
 * threshold where extraction makes sense, but doing it now would touch
 * already-shipped/tested L3.4 + L3.5.5 code. Punt until L3 closure.
 */

export interface RequestGoogleUnlinkResult {
  ok: boolean;
  errorKey?: 'session_email_missing' | 'not_linked' | 'last_identity' | 'send_failed' | 'unknown';
}

export async function requestGoogleUnlink(): Promise<RequestGoogleUnlinkResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');
  const currentEmail = user.email;
  if (!currentEmail) {
    return { ok: false, errorKey: 'session_email_missing' };
  }

  const identities = user.identities ?? [];
  const hasGoogle = identities.some((i) => i.provider === 'google');
  if (!hasGoogle) {
    return { ok: false, errorKey: 'not_linked' };
  }
  /*
   * Refuse if Google is the user's only identity. Without another
   * identity the user can no longer sign in after unlink — Supabase
   * blocks this anyway, but we surface a typed error before sending
   * the magic link rather than after the round-trip.
   */
  if (identities.length < 2) {
    return { ok: false, errorKey: 'last_identity' };
  }

  const requestedAt = new Date().toISOString();
  const { error: stashErr } = await supabase.auth.updateUser({
    data: { pendingUnlinkGoogleRequestedAt: requestedAt },
  });
  if (stashErr) {
    console.warn('[requestGoogleUnlink] metadata stash failed', stashErr);
    return { ok: false, errorKey: 'unknown' };
  }

  const origin = await resolveOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/configuracion/confirmar-desconectar-google')}`;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: currentEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (otpErr) {
    console.warn('[requestGoogleUnlink] signInWithOtp failed', otpErr);
    return { ok: false, errorKey: 'send_failed' };
  }

  return { ok: true };
}

export interface ConfirmGoogleUnlinkResult {
  ok: boolean;
  errorKey?:
    | 'not_authenticated'
    | 'fresh_sign_in_required'
    | 'no_pending_change'
    | 'pending_change_expired'
    | 'not_linked'
    | 'last_identity'
    | 'unlink_failed'
    | 'unknown';
}

/**
 * Step 2 of the bank-grade disconnect-Google flow (ADR-003).
 *
 * Five gates (all required) before `unlinkIdentity` is called:
 *   1. Authenticated.
 *   2. `last_sign_in_at` fresh (≤ FRESH_SIGN_IN_WINDOW_SECONDS).
 *   3. `user_metadata.pendingUnlinkGoogleRequestedAt` set + not stale.
 *   4. Google still linked (idempotency).
 *   5. User has ≥ 2 identities total (don't strand them without sign-in).
 *
 * On success: clears the pending metadata, calls `unlinkIdentity` with
 * the Google identity object, returns `{ok: true}`. The caller is
 * expected to `revalidatePath('/configuracion')` and redirect to
 * `/configuracion?unlinked=google` so the AccountCard re-renders with
 * the updated identities list.
 */
export async function confirmGoogleUnlink(): Promise<ConfirmGoogleUnlinkResult> {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, errorKey: 'not_authenticated' };
  }

  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { ok: false, errorKey: 'fresh_sign_in_required' };
  }

  const metadata = user.user_metadata;
  const pendingAtIso =
    typeof metadata.pendingUnlinkGoogleRequestedAt === 'string'
      ? metadata.pendingUnlinkGoogleRequestedAt
      : null;
  if (!pendingAtIso) {
    return { ok: false, errorKey: 'no_pending_change' };
  }
  const pendingAgeSeconds = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAgeSeconds) || pendingAgeSeconds > PENDING_CHANGE_TTL_SECONDS) {
    await supabase.auth.updateUser({ data: { pendingUnlinkGoogleRequestedAt: null } }).catch(() => {
      /* swallow — already failing, just being tidy */
    });
    return { ok: false, errorKey: 'pending_change_expired' };
  }

  const identities = user.identities ?? [];
  const googleIdentity = identities.find((i) => i.provider === 'google');
  if (!googleIdentity) {
    await supabase.auth.updateUser({ data: { pendingUnlinkGoogleRequestedAt: null } }).catch(() => {
      /* swallow — already failing, just being tidy */
    });
    return { ok: false, errorKey: 'not_linked' };
  }
  if (identities.length < 2) {
    await supabase.auth.updateUser({ data: { pendingUnlinkGoogleRequestedAt: null } }).catch(() => {
      /* swallow — already failing, just being tidy */
    });
    return { ok: false, errorKey: 'last_identity' };
  }

  const { error: unlinkErr } = await supabase.auth.unlinkIdentity(googleIdentity);
  if (unlinkErr) {
    console.warn('[confirmGoogleUnlink] unlinkIdentity failed', unlinkErr);
    return { ok: false, errorKey: 'unlink_failed' };
  }

  await supabase.auth.updateUser({ data: { pendingUnlinkGoogleRequestedAt: null } }).catch(() => {
    /* best-effort cleanup; unlink already succeeded */
  });

  revalidatePath('/configuracion');
  return { ok: true };
}

async function resolveOrigin(): Promise<string> {
  /*
   * Prefer the live request's origin so dev (localhost), preview
   * (vercel.app), and prod (custom domain) all work without
   * config. Fall back to NEXT_PUBLIC_SITE_URL if the headers
   * aren't telling us — should never happen in a real request.
   */
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${proto}://${host}`;
  return publicEnv.siteUrl;
}
