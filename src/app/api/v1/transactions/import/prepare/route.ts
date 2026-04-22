import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { getSupabaseAdmin, IMPORTS_BUCKET } from '@/lib/storage/supabase-admin';

/**
 * POST /api/v1/transactions/import/prepare — request a signed upload URL.
 *
 * Large CSV imports (up to 10MB per build plan §S-3.5) need to reach
 * Supabase Storage directly — Vercel caps serverless bodies at 4.5MB,
 * so the browser cannot proxy the file through this Next API. Instead
 * the flow is:
 *
 *   1. Browser POSTs filename here → we return `{ signedUrl, token,
 *      path }`.
 *   2. Browser PUTs the file to `signedUrl` directly against Supabase.
 *   3. Browser POSTs `path` to /import → we download and process.
 *
 * The signed URL is valid for Supabase's default upload window (120s
 * per their docs) and scoped to the exact object path we generated —
 * other paths aren't writable with the same token.
 *
 * Path convention: `{profileId}/{uuid}.csv` inside the `imports`
 * bucket per scaffolding §10.4.1. `{profileId}` in the path gives
 * operators / oncall a quick tenancy read when tracing object leaks.
 */

export const dynamic = 'force-dynamic';

const prepareSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = prepareSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  const uuid = crypto.randomUUID();
  const path = `${profile.id}/${uuid}.csv`;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(IMPORTS_BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[import/prepare] createSignedUploadUrl failed', error);
    return NextResponse.json({ error: 'storage_error' }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    },
  });
}
