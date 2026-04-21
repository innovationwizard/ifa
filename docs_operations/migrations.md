# Database migrations — operational procedure

> **Current state (MVP, pre-pilot):** schema is maintained via `prisma db push`
> against a single Supabase project (`ifa`, `main` branch). No migration history
> exists in the database yet. This is intentional for the solo-dev, zero-live-
> users phase; see §S-1.2 and locked D-5 of the build plan.
>
> **When migrations become mandatory:** before the **first real pilot user**
> onboards and inserts production data we are not willing to lose. At that
> point, follow §2 to transition.

## 1. Current workflow (`db push`)

For Phase 1 and early Phase 2 development:

```bash
# Edit prisma/schema.prisma, then:
pnpm db:format       # auto-format + validate the schema
pnpm db:push         # apply directly to Supabase, regenerate client
pnpm db:seed         # re-run global seeds (badge / mission catalogs)
```

`db push` is **not** tracked in git as migration files — the schema itself is
the source of truth. This is acceptable because:

- Solo builder: there is no parallel work to serialize against other devs
- Zero live production data: any destructive schema change can be reconciled
  by re-seeding
- Single environment: `main` branch of the Supabase project IS production

### Limits of `db push`

- No rollback story: `db push` is one-way
- No auditable change log: reviewers cannot see the SQL that will run
- Cannot express raw SQL that Prisma's schema syntax doesn't cover
  (partial indexes, pg_trgm GIN indexes, triggers) — these wait for §2

## 2. Transition to formal migrations

Execute this once, when the first pilot is about to onboard:

### 2.1 Baseline the existing schema

Generate a migration file that captures the schema currently in the Supabase
database, then mark it as already applied so Prisma's migration tracker
starts from a clean-but-already-deployed state.

```bash
# 1. Create the migration directory and baseline SQL
mkdir -p prisma/migrations/0_init

# 2. Diff the empty state against the current schema and write as SQL.
#    `--from-empty` means "pretend nothing is there"; `--to-schema-datamodel`
#    points at our current schema file.
pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

# 3. Mark that migration as already applied in Supabase — we are NOT
#    re-running the SQL against the live DB; we are telling Prisma "this
#    migration's effect is already in place."
pnpm exec dotenv -e .env.local -- prisma migrate resolve --applied 0_init
```

Commit the `prisma/migrations/` directory to git. Remove the `db:push` shortcut
from day-to-day workflow (it still works for scratch experiments, but every
schema change going forward produces a migration).

### 2.2 Add the raw-SQL indexes that Prisma's schema cannot express

Currently deferred per §S-1.7:

- Partial index on `transactions.merchantNit WHERE merchantNit IS NOT NULL`
- pg_trgm GIN index on `transactions.description` for search (§S-3.12)
- Partial unique index on `xp_events` for daily-cap login idempotency (§S-8.2)

Add each as its own migration:

```bash
mkdir -p prisma/migrations/$(date -u +%Y%m%d%H%M%S)_partial_indexes
# Write the CREATE INDEX statements into migration.sql, then:
pnpm db:migrate:deploy
```

## 3. Forward workflow (post-transition)

After §2, every schema change follows this cycle:

```bash
# 1. Edit prisma/schema.prisma
# 2. Create a migration locally (DOES apply to your local/dev DB)
pnpm db:migrate --name descriptive_snake_case_name

# 3. Review the generated SQL in prisma/migrations/<timestamp>_<name>/
# 4. Commit schema + migration file to git
# 5. Open PR; CI runs `prisma migrate deploy` in a preview env
# 6. Merge; CI applies migration to production Supabase via `prisma migrate deploy`
```

## 4. Pre-migration safety checklist

Before any `prisma migrate deploy` against the production (main-branch)
Supabase:

- [ ] **Snapshot the database.** In Supabase dashboard → Project → Database →
      Backups → create a manual backup and record the snapshot ID in the PR
      description. (PITR is enabled on the Pro plan; this manual snapshot is
      the explicit rollback anchor for this migration specifically.)
- [ ] **Read the generated SQL** in the migration file, not just Prisma's
      summary. Destructive operations (`DROP COLUMN`, `DROP TABLE`,
      `ALTER COLUMN ... TYPE`) need explicit justification in the PR.
- [ ] **Verify on a dry-run DB first.** Copy the production snapshot into a
      throwaway Supabase project (or a local Postgres via Supabase CLI) and
      run `prisma migrate deploy` there. Confirm the app boots and a smoke
      query (`SELECT count(*) FROM organizations`) returns the expected
      number.
- [ ] **Announce migration window.** Post to the ops channel 15 minutes
      before. For MVP this is trivially you-telling-you; still do it for the
      habit and for the paper trail.

## 5. Deploy to production

```bash
# From your local machine, against .env.local pointing at the production
# Supabase (since we have a single project). In CI this runs against
# DATABASE_URL + DIRECT_URL set by Vercel's environment for production.
pnpm db:migrate:deploy
```

Verify immediately:

```bash
# Smoke: confirm a query against a stable table returns expected count
pnpm exec dotenv -e .env.local -- prisma db execute --stdin <<'SQL'
SELECT (SELECT count(*) FROM organizations) AS orgs,
       (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM badges) AS badges;
SQL
```

## 6. Rollback procedure

Prisma does **not** have a built-in `migrate down`. Rollback options, in order
of preference:

### 6.1 Compensating migration (preferred)

Author a new migration that undoes the problematic change:

```bash
# Example: undo a recent ADD COLUMN
pnpm db:migrate --name rollback_xyz_column_addition
# Edit the generated SQL to DROP the column
pnpm db:migrate:deploy
```

Advantages: keeps migration history linear and auditable. This is the
expected path for 95% of rollbacks.

### 6.2 Restore from snapshot (nuclear)

If the migration corrupted data in a way that a compensating migration
cannot repair:

1. In Supabase dashboard → Database → Backups → restore the snapshot
   recorded in the PR description (§4).
2. Manually mark the bad migration as `rolled-back` in Prisma:

   ```bash
   pnpm exec dotenv -e .env.local -- prisma migrate resolve --rolled-back <migration-name>
   ```

3. Commit a revert of the offending schema change in git.

This path loses any writes that landed between snapshot and restore.
Communicate to affected users explicitly; do not silently lose data.

### 6.3 Supabase PITR (post-pilot, paid-plan)

Once PITR is enabled (pre-launch checklist): restore the DB to a specific
timestamp before the migration applied. Same cleanup as §6.2 for Prisma's
tracker.

## 7. `.env.local` discipline during migrations

`prisma migrate deploy` reads `DATABASE_URL` and `DIRECT_URL` from the
environment. Our scripts pipe `.env.local` in via `dotenv-cli`. Before a
production migration:

- **Confirm the URLs** in `.env.local` point at the **production** Supabase,
  not a staging/test project. Print and sanity-check the host:

  ```bash
  grep -E '^DATABASE_URL|^DIRECT_URL' .env.local | sed 's/:[^:@]*@/:***@/'
  ```

- **Never commit** `.env.local` — it is gitignored, but double-check with
  `git status` before running the migration.

## 8. What NOT to do

- ❌ Edit committed migration files after they have been applied to
  production. Author a new migration instead.
- ❌ Run `prisma migrate reset` against production. This DROPS THE DATABASE.
- ❌ Use `db push` on production once migrations are in place — it bypasses
  the history table and makes Prisma's migrate refuse to work on subsequent
  pulls.
- ❌ Skip the snapshot in §4 because "it's a small change." Compensating
  migrations in §6.1 presume the problem is detectable; a silent data
  corruption is only recoverable via §6.2.

## 9. Revision log for this document

| Date       | Editor  | Change                                           |
| ---------- | ------- | ------------------------------------------------ |
| 2026-04-21 | Initial | Written as part of S-1.14 of the MVP build plan. |
