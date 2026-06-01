'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';

/**
 * Server actions for `/configuracion` — Phase L3.3+.
 *
 * One action ships per L3 sub-batch:
 *   - updateProfile (L3.3) — this file.
 *   - L3.4 email change, L3.5 password reset, L3.6 data export,
 *     L3.7 account deletion all land later as sibling exports here.
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
