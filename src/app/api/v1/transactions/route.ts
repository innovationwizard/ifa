import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { listTransactionsQuerySchema } from '@/lib/validators/transactions';

/**
 * GET /api/v1/transactions — cursor-paginated transaction feed.
 *
 * Authentication required; tenant context comes from the user's first
 * Profile (profile-switcher arrives with a later story). Response
 * envelope is `{ data, meta }` where `meta` carries `hasMore` and the
 * opaque `nextCursor` needed for the next page.
 *
 * Query params (all optional):
 *   - limit         1..200 (clamped repo-side; request-side cap is 500 so
 *                   callers see a validation error rather than silent
 *                   truncation if they ask for way too many)
 *   - cursorId      UUIDv7 of the last row from the previous page
 *   - cursorDate    ISO date or ISO datetime — paired with cursorId
 *   - source        TransactionSource enum
 *   - reconciliationStatus
 *   - dateFrom, dateTo       coerced to Date
 *   - amountMin, amountMax   coerced to number
 *   - merchantNit            string, 1..50
 *   - q                      free-text, 1..100, case-insensitive contains
 *
 * Error shapes:
 *   - 401 { error: 'unauthenticated' }                     no session
 *   - 400 { error: 'invalid_query', issues }               Zod failures
 *   - 400 { error: 'no_profile' }                          authed but no
 *                                                          Profile row
 *                                                          (pre-onboarding
 *                                                          race)
 *   - 200 { data: Transaction[], meta: {...} }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = listTransactionsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  const { cursorId, cursorDate, limit, ...rawFilters } = parsed.data;
  const cursor =
    cursorId !== undefined && cursorDate !== undefined ? { id: cursorId, date: cursorDate } : null;

  /*
   * Strip undefined keys — `exactOptionalPropertyTypes: true` makes
   * the destructured `rawFilters` non-assignable to
   * `TransactionListFilters` whose fields use `?:` without explicit
   * `| undefined`. Conditional spreads rebuild the object with only
   * the defined keys present.
   */
  const filters = {
    ...(rawFilters.source !== undefined ? { source: rawFilters.source } : {}),
    ...(rawFilters.reconciliationStatus !== undefined
      ? { reconciliationStatus: rawFilters.reconciliationStatus }
      : {}),
    ...(rawFilters.dateFrom !== undefined ? { dateFrom: rawFilters.dateFrom } : {}),
    ...(rawFilters.dateTo !== undefined ? { dateTo: rawFilters.dateTo } : {}),
    ...(rawFilters.amountMin !== undefined ? { amountMin: rawFilters.amountMin } : {}),
    ...(rawFilters.amountMax !== undefined ? { amountMax: rawFilters.amountMax } : {}),
    ...(rawFilters.merchantNit !== undefined ? { merchantNit: rawFilters.merchantNit } : {}),
    ...(rawFilters.q !== undefined ? { q: rawFilters.q } : {}),
  };

  const result = await withTenant({ profileId: profile.id, userId: user.id }, () =>
    transactionRepo.list({
      cursor,
      ...(limit !== undefined ? { limit } : {}),
      filters,
    }),
  );

  return NextResponse.json({
    data: result.data,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor
        ? {
            id: result.nextCursor.id,
            /*
             * Serialize the cursor date as YYYY-MM-DD since the
             * underlying column is `@db.Date` (no time-of-day).
             * Clients pass it back as-is on the next request.
             */
            date: result.nextCursor.date.toISOString().slice(0, 10),
          }
        : null,
    },
  });
}
