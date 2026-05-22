import 'server-only';
import { withTenant } from '@/lib/db/tenant-context';
import { healthScoreRepo, transactionRepo } from '@/lib/db/repositories';
import { computeHealthScore, healthScoreWindow, snapshotToFactorsJson } from './engine';
import { generateImprovements } from './improvements';
import type { FactorTransaction } from './types';
import type { HealthScoreSnapshot } from './engine';

/**
 * Compute + persist a fresh Health Score snapshot for a profile
 * (Phase 6/7 Batch 10).
 *
 * Flow:
 *   1. Read the last 6 months of tenant-scoped transactions via
 *      `transactionRepo.listAllForReports` (already exists from
 *      Batch 6 — reuse rather than re-query).
 *   2. Read the prior `HealthScore.score` so `previousScore` lands
 *      on the new row.
 *   3. Compute the snapshot with the pure `computeHealthScore`.
 *   4. Generate rule-based improvement actions (no AI in this batch).
 *   5. Insert the parent `HealthScore` + dependent `HealthScoreAction`
 *      rows atomically via `healthScoreRepo.createWithActions`.
 *
 * Returns the persisted snapshot + the prior snapshot's score (the
 * caller — recompute API in Batch 11 — surfaces the delta to the
 * user).
 *
 * Callable from request handlers (with a user-scoped tenant context)
 * and from job handlers / cron paths (constructs its own
 * `withTenant({ profileId, userId: null }, ...)` wrapper).
 */

interface RowFromDb {
  date: Date;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: { toNumber: () => number };
  merchantName: string | null;
  merchantNit: string | null;
  metadata: unknown;
}

function toFactorTransactions(rows: RowFromDb[]): FactorTransaction[] {
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    amount: r.amount.toNumber(),
    merchantName: r.merchantName,
    merchantNit: r.merchantNit,
    metadata: r.metadata,
  }));
}

export interface RecomputeArgs {
  profileId: string;
  /** Optional clock for tests. Defaults to current time. */
  now?: Date;
  /** `DAILY` for the future scheduled cron, `ON_DEMAND` for user-triggered. */
  period: 'DAILY' | 'ON_DEMAND';
}

export interface RecomputeResult {
  snapshot: HealthScoreSnapshot;
  healthScoreId: string;
  actionsCount: number;
}

export async function recomputeHealthScore(args: RecomputeArgs): Promise<RecomputeResult> {
  const now = args.now ?? new Date();

  return withTenant({ profileId: args.profileId, userId: null }, async () => {
    const window = healthScoreWindow(now);
    const transactionsRaw = await transactionRepo.listAllForReports({
      from: window.from,
      to: window.to,
    });
    /*
     * `transactionRepo.listAllForReports` returns `Transaction[]`
     * whose `amount` is `Prisma.Decimal` — structurally compatible
     * with `RowFromDb.amount` (we only need `.toNumber()`), so the
     * cast is implicit through `RowFromDb[]`-shaped destructuring.
     */
    const transactions = toFactorTransactions(transactionsRaw);

    const previous = await healthScoreRepo.findLatestForProfile();
    const previousScore = previous?.score ?? null;

    const snapshot = computeHealthScore({ transactions, now, previousScore });
    const improvements = generateImprovements(snapshot);

    const persisted = await healthScoreRepo.createWithActions({
      profileId: args.profileId,
      score: snapshot.score,
      previousScore: snapshot.previousScore,
      factors: snapshotToFactorsJson(snapshot),
      period: args.period,
      computedAt: snapshot.computedAt,
      actions: improvements.map((action) => ({
        profileId: args.profileId,
        actionType: action.actionType,
        description: action.description,
        estimatedImpact: action.estimatedImpact,
        priority: action.priority,
      })),
    });

    return {
      snapshot,
      healthScoreId: persisted.healthScore.id,
      actionsCount: persisted.actions.length,
    };
  });
}
