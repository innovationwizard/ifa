/**
 * Global seed runner.
 *
 * Populates the two GLOBAL catalogs that every organization references:
 *   - Badge  (S-1.13) — achievement definitions
 *   - Mission (S-1.12) — onboarding / weekly / monthly mission catalog
 *
 * Per-org seeds (NIIF-PYME chart of accounts) run at organization
 * creation via `seedChartOfAccounts(organizationId)` (S-1.11). They are
 * not triggered by this script.
 *
 * Idempotent: every row is inserted via `upsert` keyed by its stable
 * identifier (Badge.id / Mission.slug — see note below), so re-running
 * during development updates existing rows without duplicating them.
 *
 * Mission.slug vs id: the `Mission` model uses `id` as its PK (UUID) —
 * but its SEMANTIC identity is the `slug` field defined in
 * prisma/seed/missions.ts. We uniquely identify a mission at seed time
 * by `name` (unique-in-practice within the seed set) combined with
 * `type`. A more rigorous slug column on the model belongs to S-8.5
 * when the mission engine materializes.
 *
 * Run: `pnpm db:seed` (configured via package.json "prisma.seed").
 */

import { type Prisma, PrismaClient } from '@prisma/client';
import { BADGES_TEMPLATE } from './seed/badges';
import { MISSIONS_TEMPLATE } from './seed/missions';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Badges first — missions reference badgeRewardId.
  console.warn(`Seeding ${String(BADGES_TEMPLATE.length)} badges...`);
  for (const badge of BADGES_TEMPLATE) {
    // Cast condition to Prisma.InputJsonValue — the template types it
    // as Record<string, unknown> (JSON-compatible by construction) but
    // Prisma's static type is the recursive InputJsonValue. The two
    // agree at runtime; the cast just narrows the static checker.
    const condition = badge.condition as Prisma.InputJsonValue;
    await prisma.badge.upsert({
      where: { id: badge.id },
      create: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        iconName: badge.iconName,
        category: badge.category,
        condition,
        xpReward: badge.xpReward,
      },
      update: {
        name: badge.name,
        description: badge.description,
        iconName: badge.iconName,
        category: badge.category,
        condition,
        xpReward: badge.xpReward,
      },
    });
  }

  console.warn(`Seeding ${String(MISSIONS_TEMPLATE.length)} missions...`);
  for (const mission of MISSIONS_TEMPLATE) {
    // Identify the existing row by (type, name) since Mission has no
    // slug column yet. The seed set's (type, name) pairs are unique.
    const existing = await prisma.mission.findFirst({
      where: { type: mission.type, name: mission.name },
      select: { id: true },
    });
    const data = {
      type: mission.type,
      name: mission.name,
      description: mission.description,
      condition: mission.condition as Prisma.InputJsonValue,
      xpReward: mission.xpReward,
      badgeRewardId: mission.badgeRewardId,
      isActive: true,
    };
    if (existing) {
      await prisma.mission.update({ where: { id: existing.id }, data });
    } else {
      await prisma.mission.create({ data });
    }
  }

  console.warn('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
