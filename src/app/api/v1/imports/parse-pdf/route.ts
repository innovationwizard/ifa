import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { extractFromPdf } from '@/lib/ingestion/extractor';

/**
 * PDF-sample parse endpoint — Phase L2.6.
 *
 * `POST /api/v1/imports/parse-pdf` — raw body:
 *
 *   Content-Type: application/pdf
 *   Body: the PDF file as bytes (no multipart wrapper, no JSON).
 *
 * Returns the `ExtractorResult` from `extractFromPdf` (L2.4): a
 * sample of canonical-field-shaped rows the AI extracted from the
 * PDF text, plus per-field confidence + the merged trace
 * (pdf-extract step + AI prose step).
 *
 * Auth: requires an authenticated user with a Profile (mirrors B11
 * + L1.7's gating shape). 401 anonymous, 400 `no_profile` for
 * users mid-onboarding.
 *
 * Why raw-bytes (not JSON / not multipart): the wizard sends the
 * PDF as a `fetch(..., { body: file })` post. Vercel functions
 * accept up to ~4.5MB body by default — sufficient for typical
 * Guatemalan bank statements (1–3 pages, well under 4MB). Larger
 * statements will need a Supabase-signed-upload flow similar to
 * the CSV-commit path; flagged but not built for MVP.
 *
 * Error mapping:
 *   - 401 unauthenticated — no signed-in user
 *   - 400 no_profile — authed user mid-onboarding
 *   - 400 invalid_content_type — body wasn't sent as application/pdf
 *   - 400 empty_body — request body was zero bytes
 *   - 413 body_too_large — body exceeds the 10 MB cap (matches the
 *     wizard's MAX_FILE_BYTES; raised in `vercel.json` only if the
 *     platform default 4.5MB ever needs lifting)
 *   - 400 pdf_extract_failed — unpdf threw (corrupt / encrypted /
 *     non-PDF input). The opaque `message` is included so the
 *     wizard can surface specific copy if the error string is
 *     parseable. Future iteration: pattern-match `err.name` to
 *     emit codes like `pdf_encrypted` / `pdf_corrupt`.
 *   - 200 ExtractorResult — even when extraction was unrecoverable
 *     (AI failed, no text layer in PDF, etc.) the orchestrator
 *     returns a `failed` result and we surface it 200. The wizard
 *     inspects `result.overallConfidence` + `result.sample` to
 *     decide between "show preview" and "show error" UI.
 *
 * No transaction commit happens here — this route only proposes a
 * mapping/sample. The PDF commit path (full extraction → row
 * insert) is a separate post-MVP sub-batch; the wizard's existing
 * `previewing → uploading → importing` flow is CSV-shaped and
 * needs adaptation for PDF.
 */

const ALLOWED_CONTENT_TYPE = 'application/pdf';

/**
 * Body-size cap. Matches the wizard's MAX_FILE_BYTES (10 MB) so
 * the user's "max-size error" UX is consistent across CSV + PDF.
 * Vercel's default function body limit is ~4.5MB — bodies between
 * 4.5MB and 10MB would be cut off at the platform layer before
 * reaching us; this constant is the SECOND line of defense if the
 * platform limit is ever raised.
 */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

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

  /*
   * Content-Type check. `includes` (not equality) to tolerate
   * suffixes like `application/pdf; charset=binary` that some
   * clients add. Case-insensitive because the HTTP spec is
   * case-insensitive for header values in some contexts and we
   * shouldn't 400 a request just because a client sent
   * `Application/PDF`.
   */
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes(ALLOWED_CONTENT_TYPE)) {
    return NextResponse.json({ error: 'invalid_content_type' }, { status: 400 });
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
  }

  try {
    const result = await extractFromPdf(new Uint8Array(buffer));
    return NextResponse.json(result);
  } catch (err) {
    /*
     * extractFromPdf throws when unpdf throws (corrupt /
     * encrypted / non-PDF — see pdf-extract.ts's locked
     * "errors propagate" guarantee). aiDetectProse downstream
     * never throws, so any throw here is a true parse failure.
     */
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[parse-pdf] extractFromPdf threw', message);
    return NextResponse.json({ error: 'pdf_extract_failed', message }, { status: 400 });
  }
}
