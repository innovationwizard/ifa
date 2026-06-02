import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, userRepo } from '@/lib/db/repositories';
import { buildExportZip } from '@/lib/export/build-zip';

/**
 * GET /api/v1/me/export — Phase L3.6 data download.
 *
 * Returns a ZIP containing the user's profile, user record, profile
 * memberships, transactions (JSON + CSV), health-score history, the
 * original uploaded statements from Supabase storage, and a README.
 *
 * Auth-gated by `getCurrentUser`. Builds synchronously in-request per
 * ADR-002 — at friends-and-family scale the ZIP is sub-second. The
 * route streams the bytes back with `application/zip` and a
 * `Content-Disposition: attachment` header so the browser triggers
 * a download.
 *
 * Error shapes:
 *   - 401 { error: 'unauthenticated' }          no session
 *   - 400 { error: 'no_profile' }               authed but no profile row
 *   - 404 { error: 'user_record_missing' }      authed but our User row
 *                                                missing (would only
 *                                                happen if ensureUserAndProfile
 *                                                failed silently)
 *   - 200 application/zip                       the export
 */
export async function GET(_request: NextRequest): Promise<Response> {
  const supabaseUser = await getCurrentUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const ifaUser = await userRepo.findById(supabaseUser.id);
  if (!ifaUser) {
    return NextResponse.json({ error: 'user_record_missing' }, { status: 404 });
  }

  const profiles = await profileRepo.findManyForUser(supabaseUser.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  const { zipBytes, filename } = await buildExportZip({ user: ifaUser, profile });

  /*
   * Response accepts BodyInit, which (per the latest TS lib defs) no
   * longer includes the generic Uint8Array<ArrayBufferLike> — copy to a
   * plain ArrayBuffer first. Cache-Control: private + no-store so the
   * ZIP never lands in intermediate caches (sensitive financial data).
   */
  const body = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(body).set(zipBytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(zipBytes.byteLength),
    },
  });
}
