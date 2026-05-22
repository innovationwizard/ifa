import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { prismaUnscoped } from '@/lib/db/prisma';
import { jobQueue } from '@/lib/jobs/queue';

/**
 * Admin backfill — `CATEGORIZE_TRANSACTION` jobs for older rows
 * (Phase 6/7 Batch 5).
 *
 * Scope: Transactions imported BEFORE Batch 5 wired auto-enqueueing
 * into `transactionRepo.{createManualWithAudit, createManyFromImport}`
 * have no categorization job. This route is a one-shot tool that
 * scans the table for rows where `category IS NULL` and enqueues a
 * `CATEGORIZE_TRANSACTION` job for each — across all tenants.
 *
 * Why a separate admin route (vs. a migration): keeping the
 * operation idempotent + bounded by an HTTP request budget lets us
 * run it under load, monitor its progress, and re-run if part of
 * the batch fails. A Prisma migration would lock the table.
 *
 * Authorization:
 *   1. `Authorization: Bearer ${CRON_SECRET}` — same secret the
 *      cron drain uses, so ops already has it.
 *   2. `?confirm=yes` query parameter — defense against accidental
 *      fire. A misconfigured monitor pinging the URL by mistake
 *      should not move data.
 *   3. Fail-closed when `CRON_SECRET` env is unset.
 *
 * Tenant scope: deliberately none. The route reads across all
 * tenants because it's an operator tool, not a user-facing
 * endpoint. The categorize-transaction handler re-establishes
 * per-tenant scope inside its body using `payload.profileId`.
 */

interface BackfillSummary {
  /** How many rows had `category IS NULL` at scan time. */
  scanned: number;
  /** Successful enqueues. Equals `scanned` on the happy path. */
  enqueued: number;
  /** Wall time end-to-end, including the SELECT scan. */
  durationMs: number;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${expected}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (request.nextUrl.searchParams.get('confirm') !== 'yes') {
    return NextResponse.json(
      {
        error: 'confirm_required',
        hint: 'Append ?confirm=yes to acknowledge a write operation.',
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();

  const rows = await prismaUnscoped.transaction.findMany({
    where: { category: null },
    select: { id: true, profileId: true },
  });

  const result = await jobQueue.enqueueMany(
    rows.map((row) => ({
      type: 'CATEGORIZE_TRANSACTION',
      payload: { transactionId: row.id, profileId: row.profileId },
    })),
  );

  const summary: BackfillSummary = {
    scanned: rows.length,
    enqueued: result.inserted,
    durationMs: Date.now() - startedAt,
  };
  return NextResponse.json(summary);
}
