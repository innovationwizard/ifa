import { accountRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import {
  CHART_OF_ACCOUNTS_TEMPLATE,
  type ChartAccountTemplate,
} from '../../../prisma/seed/chart-of-accounts';

/**
 * Seed the NIIF-PYME starter chart of accounts for a newly created
 * organization (called from the onboarding flow S-2.11).
 *
 * Idempotent: re-running on an org that already has seeded accounts
 * produces no duplicates thanks to the `(organizationId, code)` unique
 * constraint combined with `skipDuplicates: true`.
 *
 * Two-pass strategy: Account has a self-referential parent FK, and
 * `createMany` doesn't return rows, so we can't resolve parent IDs in
 * one shot.
 *   Pass 1 — insert every account without parent linkage
 *   Pass 2 — resolve parent IDs by code and link each row
 * Total work is O(N) inserts + O(N) small updates, acceptable for a
 * one-time seed (~50 rows per org).
 *
 * Tenancy: this function establishes a `withTenant` scope internally
 * using the passed organizationId. `userId = null` marks the inserts
 * as system-initiated (the AuditLog rows will carry a null userId),
 * which matches the semantics of onboarding creating the default
 * chart on the user's behalf.
 */
export async function seedChartOfAccounts(organizationId: string): Promise<void> {
  await withTenant({ organizationId, userId: null }, async () => {
    // Pass 1 — bulk insert every account without parent linkage.
    await accountRepo.createMany({
      data: CHART_OF_ACCOUNTS_TEMPLATE.map((row) => ({
        organizationId,
        code: row.code,
        name: row.name,
        type: row.type,
        isSystemAccount: true,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    // Pass 2 — resolve parent IDs by code and link each row.
    const rows = await accountRepo.findMany({
      where: { isSystemAccount: true },
      select: { id: true, code: true, parentId: true },
    });
    const byCode = new Map(rows.map((row) => [row.code, row]));

    const updates: { id: string; parentId: string }[] = [];
    for (const template of CHART_OF_ACCOUNTS_TEMPLATE) {
      if (!template.parentCode) continue;
      const self = byCode.get(template.code);
      const parent = byCode.get(template.parentCode);
      if (!self || !parent) continue;
      if (self.parentId === parent.id) continue; // already linked
      updates.push({ id: self.id, parentId: parent.id });
    }

    for (const { id, parentId } of updates) {
      await accountRepo.update({
        where: { id },
        data: { parentId },
      });
    }
  });
}

export type { ChartAccountTemplate };
