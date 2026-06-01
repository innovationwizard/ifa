/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused',
    databaseUrl: 'unused',
    directUrl: 'unused',
    anthropicApiKey: 'unused',
  }),
}));

vi.mock('@/lib/auth/server', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  profileRepo: {
    findManyForUser: vi.fn(),
  },
}));

vi.mock('@/lib/ingestion/extractor', () => ({
  extractFromPdf: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { extractFromPdf } from '@/lib/ingestion/extractor';
import { POST } from './route';

/* eslint-disable @typescript-eslint/unbound-method -- mocked vi.fn refs */
const getCurrentUserMock = getCurrentUser as unknown as Mock;
const findManyForUserMock = profileRepo.findManyForUser as unknown as Mock;
const extractMock = extractFromPdf as unknown as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

function makeRequest(
  body: ArrayBuffer | Uint8Array | string | null,
  headers: Record<string, string> = { 'content-type': 'application/pdf' },
): NextRequest {
  /*
   * BodyInit doesn't accept Uint8Array directly under TS's DOM
   * Fetch types (the `buffer: ArrayBufferLike` mismatch under
   * `noUncheckedIndexedAccess`). Copy into a plain ArrayBuffer so
   * the request body reads back with the same bytes the route
   * would see in production, with a clean type.
   */
  let normalizedBody: BodyInit | null;
  if (body instanceof Uint8Array) {
    const copy = new ArrayBuffer(body.byteLength);
    new Uint8Array(copy).set(body);
    normalizedBody = copy;
  } else {
    normalizedBody = body;
  }
  return new NextRequest('http://localhost/api/v1/imports/parse-pdf', {
    method: 'POST',
    headers,
    body: normalizedBody,
  });
}

function fakeUser(): { id: string } {
  return { id: 'user_test' };
}

function fakeProfile() {
  return { id: 'profile_test', displayName: 'Jorge' };
}

/**
 * Smallest valid-looking PDF bytes for "non-empty body" cases.
 * Real validity is irrelevant — the extractor is mocked.
 */
const MINIMAL_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

beforeEach(() => {
  getCurrentUserMock.mockReset();
  findManyForUserMock.mockReset();
  extractMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {
    /* silence extract-throws warn during tests */
  });
});

describe('POST /api/v1/imports/parse-pdf — auth gating', () => {
  it('returns 401 when no user is authenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthenticated');
    expect(findManyForUserMock).not.toHaveBeenCalled();
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 'no_profile' when authed user has no Profile", async () => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([]);

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_profile');
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/imports/parse-pdf — content-type guard', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it("returns 400 'invalid_content_type' when the request is JSON", async () => {
    const res = await POST(makeRequest(MINIMAL_PDF_BYTES, { 'content-type': 'application/json' }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_content_type');
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('accepts content-type with a suffix (e.g., "application/pdf; charset=binary")', async () => {
    extractMock.mockResolvedValue({
      sample: [],
      confidence: {},
      overallConfidence: 0.5,
      source: 'ai',
      trace: { steps: [] },
    });

    const res = await POST(
      makeRequest(MINIMAL_PDF_BYTES, { 'content-type': 'application/pdf; charset=binary' }),
    );

    expect(res.status).toBe(200);
    expect(extractMock).toHaveBeenCalledTimes(1);
  });

  it('case-insensitive (e.g., "Application/PDF")', async () => {
    extractMock.mockResolvedValue({
      sample: [],
      confidence: {},
      overallConfidence: 0.5,
      source: 'ai',
      trace: { steps: [] },
    });

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES, { 'content-type': 'Application/PDF' }));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/imports/parse-pdf — body guards', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it("returns 400 'empty_body' when the body is zero bytes", async () => {
    const res = await POST(makeRequest(new Uint8Array(0)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('empty_body');
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 413 'body_too_large' when the body exceeds the 10 MB cap", async () => {
    /*
     * 10 MB + 1 byte. Vercel's platform default would normally
     * reject this earlier, but our second-line defense catches it
     * here if the platform limit is ever raised.
     */
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await POST(makeRequest(tooLarge));

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('body_too_large');
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/imports/parse-pdf — extractor errors', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it("returns 400 'pdf_extract_failed' when extractFromPdf throws (corrupt/encrypted/non-PDF)", async () => {
    extractMock.mockRejectedValue(new Error('Invalid PDF structure'));

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('pdf_extract_failed');
    /*
     * The opaque error message is included so the wizard can
     * surface specific copy if the error string is parseable.
     * Pinned because a future iteration that strips the message
     * would silently lose diagnostic detail.
     */
    expect(body.message).toBe('Invalid PDF structure');
  });

  it("returns 400 'pdf_extract_failed' for non-Error throws (defensive)", async () => {
    extractMock.mockRejectedValue('string boom');

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('pdf_extract_failed');
    expect(body.message).toBe('string boom');
  });
});

describe('POST /api/v1/imports/parse-pdf — happy path', () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(fakeUser());
    findManyForUserMock.mockResolvedValue([fakeProfile()]);
  });

  it('returns 200 with the orchestrator result for a valid PDF body', async () => {
    const orchestratorResult = {
      sample: [
        {
          date: '2026-05-21',
          description: 'PAGO SUPERMERCADO',
          amount: '-150.00',
          debit: null,
          credit: null,
          merchantNit: null,
        },
      ],
      confidence: { date: { score: 0.95 }, description: { score: 0.9 }, amount: { score: 0.9 } },
      overallConfidence: 0.92,
      source: 'ai',
      trace: {
        steps: [
          { step: 'pdf', durationMs: 120, outcome: 'matched' },
          { step: 'ai', durationMs: 1500, outcome: 'matched' },
        ],
      },
    };
    extractMock.mockResolvedValue(orchestratorResult);

    const res = await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof orchestratorResult;
    expect(body.overallConfidence).toBe(0.92);
    expect(body.source).toBe('ai');
    expect(body.sample).toHaveLength(1);
    expect(body.trace.steps[0]?.step).toBe('pdf');
    expect(body.trace.steps[1]?.step).toBe('ai');
  });

  it('forwards the body to extractFromPdf as a Uint8Array', async () => {
    extractMock.mockResolvedValue({
      sample: [],
      confidence: {},
      overallConfidence: 0,
      source: 'ai',
      trace: { steps: [] },
    });

    await POST(makeRequest(MINIMAL_PDF_BYTES));

    expect(extractMock).toHaveBeenCalledTimes(1);
    const passed = extractMock.mock.calls[0]?.[0] as Uint8Array;
    expect(passed).toBeInstanceOf(Uint8Array);
    expect(passed.byteLength).toBe(MINIMAL_PDF_BYTES.byteLength);
  });
});
