import { defineConfig } from 'prisma/config';

/**
 * Prisma config file. Migrated from `package.json#prisma` (deprecated
 * in Prisma 6.x; removed in Prisma 7) on 2026-06-01.
 *
 * Only `migrations.seed` is set — all other config (schema path,
 * datasource URL) keeps its defaults:
 *   - schema: defaults to `./prisma/schema.prisma` (where ours lives).
 *   - datasource.url: read from `process.env.DATABASE_URL` via the
 *     `env("DATABASE_URL")` directive inside `schema.prisma`. We don't
 *     duplicate it here.
 *
 * Env loading: `pnpm db:*` scripts in package.json wrap commands with
 * `dotenv -e .env.local --`, so by the time Prisma loads this config,
 * env vars are already in `process.env`. The seed command itself
 * keeps the same `dotenv -e .env.local --` prefix so its child
 * process inherits .env.local explicitly (no behavior change vs the
 * old `package.json#prisma#seed`).
 */
export default defineConfig({
  migrations: {
    seed: 'dotenv -e .env.local -- tsx prisma/seed.ts',
  },
});
