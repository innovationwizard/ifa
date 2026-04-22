import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * GET /api/v1/transactions/[id] — canonical transaction detail.
 *
 * Returns the transaction with:
 *   - `felData` / `tpvData` sidecars (present per source)
 *   - Both reconciliation sides, each with the matched counterparty's
 *     own sidecar eagerly loaded
 *   - Related journal entries + their lines referencing this
 *     transaction (with the Account's code/name/type inlined)
 *   - Full TransactionAudit trail for the "Auditoría" tab
 *
 * Security:
 *   - 401 for anonymous requests.
 *   - 400 for a malformed id (non-UUID — Prisma would reject this
 *     downstream anyway, but a clean 400 beats a validation
 *     exception bubbling up).
 *   - 404 whenever the row is missing OR belongs to a different
 *     tenant. Both cases produce identical responses so there is no
 *     id enumeration.
 *
 * Audit sequencing: the TransactionAudit query deliberately runs AFTER
 * the tenant-verified Transaction fetch. `TransactionAudit` has no
 * `profileId` column and can't be tenant-auto-scoped by the Prisma
 * extension; leaning on the upstream null check is how we stay safe.
 */

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const awaited = await context.params;
  const parsed = paramsSchema.safeParse(awaited);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id', issues: parsed.error.issues }, { status: 400 });
  }
  const { id } = parsed.data;

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  const detail = await withTenant({ profileId: profile.id, userId: user.id }, async () => {
    const transaction = await transactionRepo.findDetailById(id);
    if (!transaction) return null;
    const [journalEntries, audits] = await Promise.all([
      transactionRepo.listRelatedJournalEntries(id),
      transactionRepo.listAuditById(id),
    ]);
    return { transaction, journalEntries, audits };
  });

  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}
