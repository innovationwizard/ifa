import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { getSupabaseAdmin, IMPORTS_BUCKET } from '@/lib/storage/supabase-admin';
import { ImportConfigurationError, runImport } from '@/lib/imports/runner';
import { type CanonicalField } from '@/lib/imports/column-detect';

/**
 * POST /api/v1/transactions/import — process an uploaded statement.
 *
 * Client flow (see /import/prepare for the handshake):
 *   1. POST /prepare → receive { signedUrl, path }
 *   2. PUT file → Supabase Storage via signedUrl
 *   3. POST here with { storagePath, mapping } — we download, parse,
 *      insert, return a summary.
 *
 * Security:
 *   - 401 anonymous
 *   - 400 invalid body / missing mapping fields
 *   - 403 if the storagePath doesn't belong to the authenticated
 *     Profile (path is validated to start with `{profileId}/`)
 *   - 404 if the object doesn't exist in the bucket
 *   - 500 for any unexpected parser / DB / storage failure
 *
 * Idempotency: reimporting the same CSV produces identical row
 * externalIds (hash of date + amount + description), which hit the
 * schema's `(profileId, source, externalId)` unique constraint and
 * come back as `duplicatesSkipped`. Partial-commit semantics: if a
 * batch fails mid-run, prior batches remain. A retry is safe.
 */

export const dynamic = 'force-dynamic';
/*
 * Pro-tier Vercel caps the function at 60s. Large CSVs may still
 * exceed it — when they do, Railway is the earmarked destination
 * (see project_compute_constraints memory).
 */
export const maxDuration = 60;

const CANONICAL_FIELD_VALUES: CanonicalField[] = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'merchantNit',
  'ignore',
];

const importSchema = z.object({
  storagePath: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[^/]+\/[A-Za-z0-9._-]+\.csv$/, 'storagePath must be `{profileId}/{filename}.csv`'),
  mapping: z.record(z.string(), z.enum(CANONICAL_FIELD_VALUES)).optional(),
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
  const parsed = importSchema.safeParse(rawBody);
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

  const { storagePath, mapping } = parsed.data;
  const expectedPrefix = `${profile.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    /*
     * Defense-in-depth — the prepare endpoint only issues paths
     * prefixed with the authenticated profile, so reaching this
     * branch means the client hand-crafted a storagePath pointing
     * at another tenant's upload. Fail with 403, not 400, so the
     * access-denied intent is clear in logs.
     */
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(IMPORTS_BUCKET)
    .download(storagePath);

  if (downloadError || !fileBlob) {
    if (downloadError?.message?.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('[import] storage download failed', downloadError);
    return NextResponse.json({ error: 'storage_error' }, { status: 500 });
  }

  const csv = await fileBlob.text();

  try {
    const summary = await withTenant({ profileId: profile.id, userId: user.id }, () =>
      runImport({ csv, ...(mapping ? { mapping } : {}) }),
    );
    return NextResponse.json({ data: summary });
  } catch (error) {
    if (error instanceof ImportConfigurationError) {
      return NextResponse.json(
        { error: 'invalid_mapping', message: error.message },
        { status: 400 },
      );
    }
    console.error('[import] runImport failed', error);
    return NextResponse.json({ error: 'import_failed' }, { status: 500 });
  }
}
