import type { HealthScore, HealthScoreAction, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * `HealthScore` + `HealthScoreAction` repository (Phase 6/7 Batch 10).
 *
 * Tenant-scoped: callers MUST be inside `withTenant(...)`. The
 * tenancy extension auto-injects `profileId`.
 *
 * The MVP write path is the `createWithActions` helper below — a
 * single Prisma `$transaction` that inserts the parent `HealthScore`
 * row and the dependent `HealthScoreAction` rows atomically, so a
 * partial write can never leave actions orphaned from their score.
 *
 * `update`/`delete` deliberately omitted: scores are immutable
 * snapshots. The recompute API (Batch 11) creates a new row rather
 * than overwriting the prior one.
 */

export interface CreateHealthScoreInput {
  profileId: string;
  score: number;
  previousScore: number | null;
  factors: Prisma.InputJsonValue;
  period: 'DAILY' | 'ON_DEMAND';
  computedAt: Date;
  metadata?: Prisma.InputJsonValue;
  actions: {
    profileId: string;
    actionType: string;
    description: string;
    estimatedImpact: number;
    priority: number;
  }[];
}

export interface CreateHealthScoreResult {
  healthScore: HealthScore;
  actions: HealthScoreAction[];
}

export const healthScoreRepo = {
  /**
   * Atomic create: parent `HealthScore` + dependent
   * `HealthScoreAction` rows in a single `$transaction`. If the
   * action insert fails, the score insert is rolled back too — no
   * orphaned actions ever land.
   */
  async createWithActions(input: CreateHealthScoreInput): Promise<CreateHealthScoreResult> {
    return prisma.$transaction(async (db) => {
      const healthScore = await db.healthScore.create({
        data: {
          profileId: input.profileId,
          score: input.score,
          previousScore: input.previousScore,
          factors: input.factors,
          period: input.period,
          computedAt: input.computedAt,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });

      const actions: HealthScoreAction[] = [];
      for (const action of input.actions) {
        const created = await db.healthScoreAction.create({
          data: {
            profileId: action.profileId,
            healthScoreId: healthScore.id,
            actionType: action.actionType,
            description: action.description,
            estimatedImpact: action.estimatedImpact,
            priority: action.priority,
          },
        });
        actions.push(created);
      }

      return { healthScore, actions };
    });
  },

  findLatestForProfile(): Promise<HealthScore | null> {
    /*
     * No `where: { profileId }` here — the tenancy extension injects
     * it. Caller MUST be inside `withTenant(...)`.
     */
    return prisma.healthScore.findFirst({
      orderBy: { computedAt: 'desc' },
    });
  },

  findHistoryForProfile(args: { limit?: number } = {}): Promise<HealthScore[]> {
    const limit = args.limit ?? 30;
    return prisma.healthScore.findMany({
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
  },

  findActionsForScore(healthScoreId: string): Promise<HealthScoreAction[]> {
    return prisma.healthScoreAction.findMany({
      where: { healthScoreId },
      orderBy: [{ estimatedImpact: 'desc' }, { priority: 'asc' }],
    });
  },

  /**
   * Mark a `HealthScoreAction` as COMPLETED — stamp `completedAt`
   * with the current time. The /dashboard/salud server action calls
   * this on the user's "Marcar como hecho" click. Tenancy extension
   * auto-injects `profileId` so a user can never complete another
   * tenant's action.
   */
  markActionCompleted(actionId: string): Promise<HealthScoreAction> {
    return prisma.healthScoreAction.update({
      where: { id: actionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  },

  /**
   * Mark a `HealthScoreAction` as DISMISSED. No timestamp — the
   * row's `updatedAt` carries that.
   */
  markActionDismissed(actionId: string): Promise<HealthScoreAction> {
    return prisma.healthScoreAction.update({
      where: { id: actionId },
      data: { status: 'DISMISSED' },
    });
  },

  count(args: Prisma.HealthScoreCountArgs = {}): Promise<number> {
    return prisma.healthScore.count(args);
  },
};

export type HealthScoreRepo = typeof healthScoreRepo;
