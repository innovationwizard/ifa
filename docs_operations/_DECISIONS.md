# Architectural decision log

> Numbered, dated, append-only. Each entry captures a decision made
> _after_ a build plan closed (or outside of any plan) that durably
> shapes the codebase. Plan-internal decisions stay in the relevant
> `_PHASE_*_PLAN.md` and `_PHASE_*_RETROSPECTIVE.md`.

---

## ADR-001 — No cron for job-queue draining; user-triggered "Procesar ahora" button instead

**Date:** 2026-05-22
**Status:** Adopted, replacing the `* * * * *` Vercel Cron entry that shipped in
[Phase 6/7 Batch 4](./_PHASE_6_7_PLAN.md#batch-4--job-queue-infrastructure)
(`0a566db`, 2026-05-21).

### Context

Batch 4 shipped a Postgres-backed `PendingJob` queue plus a Vercel
Cron firing `GET /api/cron/jobs` every minute to drain it. Two job
types currently land in the queue:

- `CATEGORIZE_TRANSACTION` (B5) — one row enqueued per imported
  transaction by `transactionRepo.createManyFromImport`
- `DETECT_ANOMALY` (B8) — one row enqueued per imported transaction
  alongside the categorize job

Both job types are **deterministically tied to a user action** — a
CSV import. No other code path enqueues into this queue.

### Decision

Remove the `/api/cron/jobs` cron entry from `vercel.json`. Drain the
queue via a user-triggered `processPendingJobs()` server action
surfaced as a "Procesar ahora" button at two entry points:

1. **Post-import success state** (`<ResultStep>` in
   `csv-import-wizard.tsx`) — the moment the user is most aware that
   "something happens to the rows after import".
2. **Contextual banner on `/transacciones`** — appears only when the
   current profile has `PendingJob.status = 'PENDING'` rows. Catches
   the case where the user navigated away from the import wizard
   before draining.

Both buttons invoke the same server action, which scopes the queue
claim to the calling profile (via `payload->>'profileId'` filter on
the JSONB column).

### Reasoning

- **Wasted invocations.** A `* * * * *` cron wakes up 1,440 times
  per day. The job queue receives traffic only when a user imports
  a statement — typically a few times per week per user at MVP scale.
  That means **>99% of cron firings would do zero productive work**:
  empty `claim()` query, idle return, log entry, cost. Even at
  Vercel's per-invocation pricing this adds up; at MVP scale it
  buys nothing.
- **Predictable latency is better than polling latency.** Polling
  every minute means worst-case ~60s wait between import and
  categorized rows appearing in the feed. Button-triggered drain
  starts the moment the user clicks, with no wait. Better UX, less
  infrastructure.
- **Vercel free tier blocks `* * * * *`.** Vercel free tier caps
  cron granularity at daily. The schedule we shipped in B4 has
  never actually fired every minute in production; combined with
  `CRON_SECRET` having never been set (separate finding), the
  queue has not drained at all in prod since B4. Removing the
  schedule eliminates the silent-failure mode.
- **Tenant-scoped drain is honest.** A user-triggered button can
  scope its claim to the calling profile via
  `payload->>'profileId'`, which matches the codebase's overall
  tenancy posture (no cross-tenant leakage from user actions).
  A global cron drain doesn't have this property.

### What stays in place

- **`/api/cron/jobs/route.ts` HTTP endpoint stays.** Already secured
  behind `CRON_SECRET`, has 11 unit + 9 e2e tests. Becomes a manual
  ops drain (curl-able when needed) rather than a scheduled
  invocation. Zero ongoing cost; cheap backstop if the UI button
  is ever broken or ops needs to drain from a script.
- **`PendingJob` table + `jobQueue.{claim,markDone,markFailed}` API**
  unchanged. The button calls a tenant-scoped sibling
  (`claimForProfile`) using the same SQL pattern.
- **B5 + B8 enqueue paths unchanged.** Importing a CSV still
  enqueues N×2 jobs; the only difference is the user clicks
  "Procesar ahora" to drain instead of waiting for a cron.

### Consequences

- One server action + two UI components added.
- `jobQueue.claimForProfile(workerId, limit, profileId)` and
  `jobQueue.countPendingForProfile(profileId)` added — both use
  the same JSONB-filtered SQL pattern as `claim()`.
- The (`status`, `scheduledAt`) index on `pending_jobs` does not
  include the JSONB profileId filter. At MVP scale this is fine
  (table won't exceed a few hundred PENDING rows per user). When
  the table grows past ~10k PENDING rows, add a functional index:
  `CREATE INDEX ON pending_jobs (((payload->>'profileId')::uuid))
WHERE status = 'PENDING'`.
- The retrospective ([\_PHASE_6_7_RETROSPECTIVE.md](./_PHASE_6_7_RETROSPECTIVE.md))
  gets a post-closure revision note pointing at this ADR.

### Reversal trigger

If a future job type lands that is **not** user-triggered (e.g.,
"refresh stale merchant categories nightly", "rotate Anthropic API
key on a schedule"), reintroduce a cron at that point — but as a
purpose-specific endpoint for that job type, not a generic
queue-drainer. The current ADR is about THIS queue's THIS
traffic shape; it does not preclude a different queue with a
different shape.
