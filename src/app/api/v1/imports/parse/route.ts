import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { extractFromCsv } from '@/lib/ingestion/extractor';

/**
 * CSV-sample parse endpoint — Phase L1.7.
 *
 * `POST /api/v1/imports/parse` — body:
 *
 *   {
 *     headers: string[],
 *     sampleRows: Record<string, string>[]
 *   }
 *
 * Returns the `ExtractorResult` from `extractFromCsv` (L1.4): the
 * heuristic-confident shortcut OR the AI-fallback result, plus the
 * trace + per-field confidence the wizard's "Confirma el mapeo" step
 * needs to render.
 *
 * Auth: requires an authenticated user with a Profile (mirrors B11's
 * gating shape). 401 anonymous, 400 `no_profile` for users mid-
 * onboarding.
 *
 * Why a server endpoint vs. doing this client-side: the orchestrator
 * may call Claude. The Anthropic API key is server-only, and we don't
 * want the wizard to ship the Claude wrapper to the browser bundle.
 * The wizard parses the CSV with papaparse in the browser, samples
 * ≤50 rows, and POSTs them here for column detection.
 *
 * No size cap on `sampleRows` at this layer — the orchestrator's
 * extractors already cap (`SAMPLE_ROWS_FOR_AI = 10` in ai-detect).
 * The wizard caps at 50 client-side before sending, so payload is
 * bounded in practice. A defensive zod `.max()` could be added if
 * the public attack surface concern surfaces.
 *
 * NO transaction commit happens here. This route only produces the
 * proposed mapping. The user reviews + confirms in the wizard, and a
 * separate commit endpoint (already exists for CSV import per B5)
 * writes the rows.
 */

const ParsePayloadSchema = z.object({
  headers: z.array(z.string()).min(1, 'at least one header required'),
  sampleRows: z.array(z.record(z.string(), z.string())),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ParsePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  /*
   * No `withTenant(...)` here — the orchestrator + its extractors
   * are pure of tenant-scoped DB reads. The AI extractor calls
   * Claude with the sample headers/rows; no Prisma is touched.
   *
   * If a future extractor needs tenant-scoped DB access (e.g., to
   * look up the user's previously-confirmed mappings for the same
   * bank), wrap the `extractFromCsv` call in `withTenant` then.
   */
  const result = await extractFromCsv({
    headers: parsed.data.headers,
    sampleRows: parsed.data.sampleRows,
  });

  return NextResponse.json(result);
}
