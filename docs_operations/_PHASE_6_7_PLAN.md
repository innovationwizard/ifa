# IFA — Phase 6 + Phase 7 Build Plan (INDIVIDUAL-tier MVP)

> **Authoritative source for the next 15 batches.** This file is written so
> a future contributor (or a compacted Claude conversation) can pick up
> any batch from cold context — no chat history required. Each batch has
> goal, files, acceptance criteria, dependencies, and risk notes.

## 0. Locked decisions (from the 2026-04-22 planning turn)

These decisions overrode the build-plan-as-written. The full reasoning
sits in [docs/\_IFA_BUILD_PLAN.md](_IFA_BUILD_PLAN.md) §12 and §13, but
the deltas are:

1. **Phase 6 has been redefined for the INDIVIDUAL tier.** The
   build-plan reports (P&L, Balance Sheet, Cash Flow Statement, IVA,
   Bank Reconciliation Report, QuickBooks IIF/CSV) all depend on
   journal entries (Phase 5 — Accounting) and/or FEL data, neither of
   which exists in MVP. INDIVIDUAL users get a different report set
   computed directly off `Transaction` rows: monthly cash flow,
   spending-by-category, top merchants. The original BUSINESS-tier
   reports return when Phase 5 ships.

2. **Phase 7 Health Score factors have been redefined for the
   INDIVIDUAL tier.** The build-plan factors (Reconciliation
   Completeness, IVA Compliance, Accounting Timeliness, Financial
   Discipline) require FEL data, accounting data, or Phase 8
   gamification — none available in MVP. INDIVIDUAL users get a
   six-factor score computable from CSV-imported transactions + AI
   categorization. See §2 below.

3. **Schema changes are in scope.** New models: `MerchantCategory`,
   `PendingJob`. Applied via `pnpm db:push` per the current
   pre-pilot policy in [migrations.md](./migrations.md).

4. **AI categorization is in scope.** Anthropic budget acknowledged
   at ~USD $0.50 per first-time user (≈500 transactions × $0.001
   with prompt caching). Categorization is required for the Spending
   Concentration / Recurring Spending Ratio factor and for the
   Phase 6 spending-by-category report.

5. **No live users until Phase 7 is 100% complete.** Engineering
   ordering can be optimized for coherence (build infrastructure
   bottom-up) without worrying about user-visible progress at each
   step.

6. **Plan location:** this file. Progress log lives at the bottom.

7. **Batch granularity:** one batch = one commit. ~15 batches total,
   each sized like a Phase 3 story (S-3.x).

8. **Commit policy:** user executes commits manually
   (per [memory: feedback_commits](~/.claude/projects/-Users-jorgeluiscontrerasherrera-Documents--git-ifa/memory/feedback_commits.md)).
   Claude proposes commit text + updates this file's progress log
   in the same batch.

## 1. Phase 6 redefinition — INDIVIDUAL-tier reports

| Report                         | Source data                        | Status                                |
| ------------------------------ | ---------------------------------- | ------------------------------------- |
| Monthly Cash Flow              | `Transaction.{amount, date, type}` | In scope (Batch 7)                    |
| Spending by Category           | `Transaction.category` (post-AI)   | In scope (Batch 7)                    |
| Top Merchants                  | `Transaction.merchantName/Nit`     | In scope (Batch 7)                    |
| ~~Income Statement (P&L)~~     | Journal entries                    | Deferred — needs Phase 5              |
| ~~Balance Sheet~~              | Journal entries                    | Deferred — needs Phase 5              |
| ~~Cash Flow Statement (NIIF)~~ | Journal entries                    | Deferred — needs Phase 5              |
| ~~IVA Report~~                 | FEL DTE data                       | Deferred — needs Phase 10             |
| ~~Bank Reconciliation Report~~ | Two-sided reconciliation           | Deferred — needs Phase 4 + accounting |
| ~~QuickBooks export~~          | Accounting                         | Deferred — needs Phase 5              |
| ~~SAT XML~~                    | —                                  | Deferred per locked D-7               |

All reports use the existing [`/reportes`](<../src/app/(app)/reportes>) module-placeholder route. They render off the new aggregation primitives (Batch 6) and never invent data — empty periods show "Sin datos para este periodo."

## 2. Phase 7 factor set — INDIVIDUAL-tier Health Score

Score range stays **0–1000** per scaffolding §8.1. Each factor outputs
a 0–100 sub-score; weighted sum × 10 = final.

| #   | Factor                   | Weight | Inputs                                         | High-level formula                                                                                     |
| --- | ------------------------ | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Spending Discipline      | 20%    | Monthly expense totals, last 6 months          | `100 * 1 / (1 + CV(monthly_expenses))` — lower coefficient-of-variation = higher score                 |
| 2   | Income Stability         | 20%    | Monthly income totals, last 6 months           | `100 * 1 / (1 + CV(monthly_income))`                                                                   |
| 3   | Savings Rate             | 20%    | Last 3 months income + expenses                | `clamp((avg_income − avg_expenses) / avg_income, 0, 0.30) / 0.30 × 100` — caps at 30% rate = 100 score |
| 4   | Cash Flow Consistency    | 15%    | Monthly net cash flow, last 6 months           | `100 * 1 / (1 + CV(monthly_net_flow))`                                                                 |
| 5   | Recurring Spending Ratio | 15%    | Last 3 months expenses + merchant aggregation  | `recurring_txn_count / total_txn_count × 100` — recurring = same merchant ≥3 times in window           |
| 6   | Anomaly Rate             | 10%    | Last 3 months, with anomaly flags from Batch 8 | `100 − min(100, anomaly_count / total_txn_count × 1000)` — 10% anomalies = 0 score                     |

**Tier bands** (used for color coding in the gauge UI):

- `0–399` Crítico (red, `--color-ifa-error`)
- `400–599` En riesgo (gold, `--color-ifa-gold-500`)
- `600–799` Estable (teal, `--color-ifa-teal-500`)
- `800–1000` Excelente (deep teal, `--color-ifa-teal-600`)

**Minimum data thresholds:** each factor needs at least 3 months of
relevant transactions. Profiles with less data return a score with
`partial: true` and a "Faltan datos" banner — never a misleading
fully-weighted score.

**Future BUSINESS-tier factors** (Reconciliation Completeness, IVA
Compliance, Accounting Timeliness, Financial Discipline) re-enter
the formula when their upstream data sources ship. Profile type
gates the factor set: INDIVIDUAL uses these 6, BUSINESS uses the
build-plan 7 once the data flows exist.

## 3. Schema additions (Batch 1)

### `MerchantCategory`

Per-Profile cache of AI categorization results. Lookup key is
`(profileId, merchantNitOrNameNormalized)`.

```prisma
enum CategorySource {
  AI
  USER
}

model MerchantCategory {
  id                 String         @id @default(uuid(7)) @db.Uuid
  profileId          String         @db.Uuid
  /// Either nit (preferred when present) or a normalized merchant name.
  /// Normalization: lower-case, accent-stripped, whitespace-collapsed.
  lookupKey          String
  category           String
  source             CategorySource @default(AI)
  /// 0..1 from Claude; null for USER overrides.
  aiConfidence       Float?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  @@unique([profileId, lookupKey], name: "uniq_profile_lookup_key")
  @@index([profileId])
  @@map("merchant_categories")
}
```

Add to `TENANT_SCOPED_MODELS` in `src/lib/db/tenancy.ts`.

### `PendingJob`

Generic Postgres-backed job queue used by Batch 4. Polled by a Vercel
Cron once a minute; processed in chunks.

```prisma
enum JobType {
  CATEGORIZE_TRANSACTION
  DETECT_ANOMALY
}

enum JobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

model PendingJob {
  id          String    @id @default(uuid(7)) @db.Uuid
  type        JobType
  /// Tenant context restored from `payload.profileId` when the job runs.
  payload     Json      @db.JsonB
  status      JobStatus @default(PENDING)
  attempts    Int       @default(0)
  scheduledAt DateTime  @default(now())
  lockedAt    DateTime?
  /// Hostname / function id of the worker holding the row.
  lockedBy    String?
  lastError   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, scheduledAt])
  @@index([type, status])
  @@map("pending_jobs")
}
```

**NOT** tenant-scoped — the job queue is process-shared; tenant
identity flows through the payload and the worker restores tenant
context via `withTenant(payload.profileId, ...)` before processing.

### `Transaction.metadata` shape additions (no schema change required)

The existing `metadata` JSONB on `Transaction` already carries
S-3.11 duplicate flags. Batch 8 (anomaly detection) extends it
with:

```ts
{
  // ...existing keys...
  anomaly?: {
    detectedAt: string;       // ISO timestamp
    zScore: number;           // |z| > 3 triggers the flag
    method: 'merchant_zscore' | 'new_merchant';
    dismissed?: boolean;      // user-set
  };
}
```

No schema migration; reads stay through `readAnomalyMetadata` (Batch 8 helper).

## 4. Batch plan (15 batches)

Each batch is one commit. Each acceptance-criterion checkbox is one
"item" for the dual progress indicator at the bottom of this file.

### Batch 1 — Schema: MerchantCategory + PendingJob

**Goal:** Schema groundwork for AI categorization (Batch 3) and the
job queue (Batch 4). Single `db:push` against Supabase prod.

**Files:**

- `prisma/schema.prisma` — two new models, two new enums
- `src/lib/db/tenancy.ts` — add `MerchantCategory` to
  `TENANT_SCOPED_MODELS`

**Acceptance criteria (5 items):**

- [ ] Prisma schema validates (`pnpm db:format`)
- [ ] `pnpm db:push --accept-data-loss` applies cleanly with the
      pre-push diff reviewed and no unexpected destructive changes
- [ ] `pnpm db:generate` regenerates client; types resolve
- [ ] `MerchantCategory` listed in `TENANT_SCOPED_MODELS`
- [ ] Full gate sweep green (lint, typecheck, prettier, vitest, build, e2e)

**Risk notes:**

- Pre-push diff must be empty except for the two new tables + two
  new enums (per the safety pattern from the 2026-04-21 push).
- No data backfill required.

---

### Batch 2 — Anthropic client wrapper

**Goal:** Install `@anthropic-ai/sdk`, create the singleton client
with prompt caching, retry-with-backoff, and structured cost telemetry.
No business logic yet.

**Files:**

- `package.json` — `@anthropic-ai/sdk` dependency
- `src/lib/ai/claude.ts` — client factory, retry wrapper, model
  constants (`MODEL_OPUS = 'claude-opus-4-7'`,
  `MODEL_HAIKU = 'claude-haiku-4-5-20251001'`)
- `src/lib/ai/claude.test.ts` — retry + error-path unit tests with a
  mocked SDK
- `src/lib/env.ts` — surface `getAnthropicEnv()` if not already
  present (existing `getServerEnv().anthropicApiKey` may suffice;
  verify, don't duplicate)

**Acceptance criteria (6 items):**

- [ ] `getClaudeClient()` returns a cached singleton; never reads
      `ANTHROPIC_API_KEY` from a client bundle
- [ ] `callClaudeWithRetry(args)` retries on 5xx + 429 with
      exponential backoff (3 attempts, 200ms / 800ms / 3200ms)
- [ ] Cost telemetry: every call emits a single `console.log` line
      with `{model, inputTokens, outputTokens, cacheReadTokens,
    cacheWriteTokens, latencyMs}` (structured logging; replace
      with proper observer in a later story)
- [ ] Unit tests: retry on 500 then succeed, fail after 3 attempts,
      `getClaudeClient` is the same instance across calls
- [ ] No `console.log` of any prompt or response content (only the
      cost numbers)
- [ ] Full gate sweep green

**Risk notes:**

- Use prompt caching per Anthropic docs. Stable system prompts +
  tool definitions go into cached blocks; only variable transaction
  data crosses on each call.
- The CLAUDE.md sysprompt names `claude-opus-4-7` /
  `claude-haiku-4-5-20251001` as current model IDs. Lock those in
  the constants; don't pin to dated suffixes.

---

### Batch 3 — AI categorization service

**Goal:** `categorizeMerchant(profileId, merchant)` resolves to a
category string. Checks `MerchantCategory` cache first; on miss,
calls Claude Haiku with a structured-output prompt, writes the
result to the cache.

**Files:**

- `src/lib/ai/categorization.ts` — main service + lookup-key
  normalization helper
- `src/lib/ai/categorization.test.ts` — cache hit, cache miss,
  Claude error fallback (returns null, never throws)
- `src/lib/db/repositories/merchant-category.ts` — repo with
  `findByLookupKey`, `upsert`
- `src/lib/db/repositories/index.ts` — re-export

**Acceptance criteria (7 items):**

- [ ] `normalizeLookupKey(merchant)` is pure, deterministic, and
      handles NIT-preferred / name-fallback / empty inputs
- [ ] Cache hit returns the cached category with zero Claude calls
- [ ] Cache miss calls `MODEL_HAIKU` with a system prompt cached
      across calls
- [ ] AI response parsed via Zod; malformed responses log + return
      null (never poison the cache with garbage)
- [ ] On cache write, `source: 'AI'` and `aiConfidence: 0..1` are
      both populated
- [ ] Unit tests cover all four paths (hit, miss→success, miss→AI
      error, miss→malformed)
- [ ] Full gate sweep green

**Risk notes:**

- Category vocabulary: start with a fixed 12-category list seeded
  in code (`src/lib/ai/categories.ts`): Alimentación, Transporte,
  Vivienda, Salud, Servicios, Entretenimiento, Restaurantes, Ropa,
  Educación, Compras, Trabajo, Otros. Claude returns one of these
  exactly; reject anything else.
- Prompt-cache hit rate target ≥90% — system prompt + category
  list are stable, only `{merchantName, merchantNit?}` varies.

---

### Batch 4 — Job queue infrastructure + Vercel Cron drain

**Goal:** Postgres-backed job queue (uses `PendingJob` from Batch 1)
with enqueue/dequeue/markDone/markFailed primitives. Cron endpoint
drains the queue every minute.

**Files:**

- `src/lib/jobs/queue.ts` — `enqueue`, `claim` (atomic
  SELECT-FOR-UPDATE-SKIP-LOCKED), `markDone`, `markFailed`,
  `requeueOrDeadLetter`
- `src/lib/jobs/handlers/index.ts` — dispatcher: maps `JobType` →
  handler function. Stub handlers for `CATEGORIZE_TRANSACTION` and
  `DETECT_ANOMALY` (real implementations in Batch 5 and 8).
- `src/app/api/cron/jobs/route.ts` — GET endpoint that processes up
  to N jobs and returns a summary. Auth via `x-vercel-cron-signature`
  or a static `CRON_SECRET` (env var).
- `vercel.json` — cron schedule entry (every minute)
- `src/lib/jobs/queue.test.ts` — unit tests for the state machine

**Acceptance criteria (7 items):**

- [ ] `enqueue(type, payload)` inserts a row with status PENDING
- [ ] `claim(workerId, limit)` atomically marks PENDING rows
      RUNNING with `lockedBy = workerId, lockedAt = now()` using
      `SELECT ... FOR UPDATE SKIP LOCKED` — verified via two
      concurrent calls in a test
- [ ] `markFailed` increments `attempts`; row is dead-lettered
      after 3 failures
- [ ] Cron endpoint requires `CRON_SECRET` header; returns 401
      otherwise
- [ ] Cron processes up to 25 jobs per invocation, isolates per-job
      failures (one failing job doesn't crash the batch)
- [ ] Unit tests cover claim contention, retry-then-success,
      dead-letter
- [ ] Full gate sweep green

**Risk notes:**

- `SELECT FOR UPDATE SKIP LOCKED` requires session-mode Postgres
  (DIRECT_URL). The cron route uses `prismaUnscoped` to bypass the
  tenancy filter (jobs are tenant-agnostic at the queue level).
- Vercel free-tier cron is 1× per day; Pro gives 1-minute. If
  we're on free, document the gap and run drains via on-demand
  API instead until upgrade.

---

### Batch 5 — Categorization auto-trigger + backfill

**Goal:** Every new `Transaction` insert enqueues a categorization
job. A one-shot admin route backfills jobs for transactions
imported before this batch.

**Files:**

- `src/lib/db/repositories/transaction.ts` — `createManualWithAudit`
  and `createManyFromImport` enqueue a `CATEGORIZE_TRANSACTION` job
  per inserted row
- `src/lib/jobs/handlers/categorize-transaction.ts` — pulls
  `transactionId` from payload, runs `categorizeMerchant`, writes
  the result to `Transaction.category` + `aiCategoryConfidence`
- `src/lib/jobs/handlers/index.ts` — register the real handler
- `src/app/api/admin/backfill-categorization/route.ts` — POST
  endpoint, dev-only auth, enqueues a categorization job for every
  Transaction with `category IS NULL`. Returns count.
- Integration test in `tests/e2e/api-jobs.spec.ts` (anonymous → 401
  on admin route)

**Acceptance criteria (6 items):**

- [ ] New manual transaction creates 1 PendingJob row
- [ ] CSV import of N rows creates exactly N PendingJob rows in a
      single `createMany`
- [ ] Categorize handler is idempotent — re-running for the same
      transactionId is a no-op when category already set
- [ ] Admin backfill endpoint requires `CRON_SECRET` + `?confirm=yes`
      query param (defense against accidental fire)
- [ ] Cron drain processes a categorization job end-to-end: row
      gains `category` + `aiCategoryConfidence`
- [ ] Full gate sweep green

**Risk notes:**

- Race: a Transaction insert + its categorization job both happen
  in the same withTenant scope, but the cron worker runs without
  tenant context until it reads the payload. Tenant context is
  restored _inside the handler_ via `withTenant(payload.profileId,
payload.userId, fn)`.
- If the categorization service returns null (cache miss + AI
  failure), the handler marks the job FAILED (retries later).
  Transaction.category stays null.

---

### Batch 6 — Aggregation primitives

**Goal:** Pure functions that turn Transaction rows into
report-ready summaries. No DB writes, no UI.

**Files:**

- `src/lib/reports/aggregations.ts` —
  - `monthlyCashFlow(transactions, { from, to })` → `{ month, income, expense, net }[]`
  - `spendingByCategory(transactions, { from, to })` → `{ category, total, percent, count }[]`
  - `topMerchants(transactions, { from, to, limit })` → `{ merchantName, merchantNit, total, count }[]`
- `src/lib/reports/aggregations.test.ts` — synthetic-isolated
  fixtures, deterministic outputs
- `src/lib/db/repositories/transaction.ts` — `listAllForReports(args)`
  returning all rows in a date range (used by the reports UI;
  bypasses cursor pagination)

**Acceptance criteria (6 items):**

- [ ] Each aggregation function is pure — same input → same output
- [ ] Empty input → empty array (never null, never `undefined`)
- [ ] `monthlyCashFlow` fills missing months in range with zeros
- [ ] `spendingByCategory` groups `null` category into "Sin
      categoría" (never drops rows)
- [ ] `topMerchants` falls back to NIT when name is null; groups by
      first non-null identifier
- [ ] Unit tests cover edge cases: single transaction, single month,
      cross-year range, all-null categories, negative amounts

---

### Batch 7 — Reports UI (hub + 3 reports)

**Goal:** `/reportes` hub with three working reports. Each report is
a server component using Batch 6 primitives + Recharts visualization.

**Files:**

- `src/app/(app)/reportes/page.tsx` — hub with cards linking to each
  report. Replaces existing module placeholder.
- `src/app/(app)/reportes/flujo/page.tsx` — Monthly Cash Flow
- `src/app/(app)/reportes/gastos/page.tsx` — Spending by Category
- `src/app/(app)/reportes/comercios/page.tsx` — Top Merchants
- `src/components/reports/period-picker.tsx` — client component for
  date-range selection (URL-synced like the feed's filters)
- `src/components/reports/cash-flow-chart.tsx` — Recharts BarChart
- `src/components/reports/category-pie.tsx` — Recharts PieChart
- `src/components/reports/merchants-table.tsx` — table component
- `src/messages/es-GT.json` — `reports.*` block

**Acceptance criteria (8 items):**

- [ ] Hub page lists 3 report cards; each links to its detail page
- [ ] Each report has URL-synced period (defaults: last 6 months)
- [ ] Empty period shows "Sin datos para este periodo" — never a
      blank chart
- [ ] Negative amounts (expenses) render with the IFA accounting
      convention (parentheses) via the existing `<Money>` primitive
- [ ] Categories without an AI label group into "Sin categoría" so
      the user sees real counts during the categorization rollout
- [ ] All copy in tú register, lower-elementary Spanish
- [ ] Print stylesheet keeps the chart on one page (basic — full
      print polish is a follow-up)
- [ ] Full gate sweep green

**Risk notes:**

- Install Recharts if not present (`pnpm add recharts`).
- Reports page is `(app)` so auth + profile + tenant gating is
  inherited.
- Performance: `listAllForReports` returns un-paginated. For 12
  months of CSV-imported transactions (~1k rows for a typical
  individual user) this is fine. Document the upper bound; revisit
  if a user has 10k+ rows per quarter.

---

### Batch 8 — Anomaly detection

**Goal:** Per-merchant z-score detection + new-merchant flag.
Writes to `Transaction.metadata.anomaly`. Runs as a `DETECT_ANOMALY`
job after every transaction insert.

**Files:**

- `src/lib/intelligence/anomalies.ts` — pure function
  `detectAnomaly(transaction, merchantHistory)` returning
  `{ method, zScore } | null`
- `src/lib/intelligence/anomalies.test.ts` — synthetic fixtures
- `src/lib/jobs/handlers/detect-anomaly.ts` — handler that loads
  merchant history, runs detection, updates `metadata.anomaly`
- `src/lib/db/repositories/transaction.ts` — auto-enqueue
  DETECT_ANOMALY job on insert (alongside the CATEGORIZE job)
- Helpers `readAnomalyMetadata` + `hasActiveAnomalyFlag` in
  `src/lib/transactions/anomaly-detection.ts` (mirror the
  `duplicate-detection.ts` shape)

**Acceptance criteria (6 items):**

- [ ] New merchant (≤1 historical occurrence) → method:
      `'new_merchant'`, zScore: 0
- [ ] Merchant with ≥10 history: amount outside ±3σ → method:
      `'merchant_zscore'`, zScore: signed
- [ ] In-range amounts → returns null (no flag written)
- [ ] Unit tests: cover both methods, edge case `< 10 history`
      (no flag, no error), exactly-at-3σ (not flagged)
- [ ] Anomaly flag visible on feed row (same pattern as duplicate
      flag — small badge)
- [ ] Full gate sweep green

**Risk notes:**

- Detection only runs _after_ a transaction exists (job queue), so
  the feed row may briefly show un-flagged then update once the
  cron drains. Acceptable for MVP.
- User-dismiss path mirrors the duplicate-dismiss action from
  S-3.11 — set `metadata.anomaly.dismissed = true`.

---

### Batch 9 — Health Score factor library

**Goal:** Six pure factor functions matching §2's table. Heavily
tested with synthetic-isolated fixtures (real data later via
end-to-end test).

**Files:**

- `src/lib/intelligence/health-score/factors/spending-discipline.ts`
- `src/lib/intelligence/health-score/factors/income-stability.ts`
- `src/lib/intelligence/health-score/factors/savings-rate.ts`
- `src/lib/intelligence/health-score/factors/cash-flow-consistency.ts`
- `src/lib/intelligence/health-score/factors/recurring-spending.ts`
- `src/lib/intelligence/health-score/factors/anomaly-rate.ts`
- `src/lib/intelligence/health-score/factors/index.ts` — exports +
  `FACTOR_WEIGHTS` constant
- One `.test.ts` per factor
- `src/lib/intelligence/health-score/README.md` — formulas, weight
  table, citation notes

**Acceptance criteria (8 items):**

- [ ] Each factor signature: `(input: FactorInput) → { score: number, partial: boolean, inputs: Record<string, number> }`
- [ ] `partial: true` when input data is below the minimum
      threshold; in that case `score` is still computed but the
      caller weights it accordingly
- [ ] Each factor is pure — no DB, no IO, no Date.now() (clock is
      injected)
- [ ] Score values clamp to `[0, 100]`
- [ ] README documents every formula with worked example
- [ ] Per-factor tests cover: happy path, empty input, all-zero
      input, single-month input, edge values
- [ ] `FACTOR_WEIGHTS` sums to 100
- [ ] Full gate sweep green

---

### Batch 10 — Health Score engine + persistence

**Goal:** Compose the six factors into a 0–1000 score; persist a
`HealthScore` row + improvement-action proposals.

**Files:**

- `src/lib/intelligence/health-score/engine.ts` —
  `computeHealthScore(profileId, now)` reads transactions
  (last 6 months) + computes all six factors + scales to 0–1000.
  Returns `{ score, previousScore, factors, partial, computedAt }`
- `src/lib/intelligence/health-score/persist.ts` — writes
  `HealthScore` row, fills `previousScore` from the most recent
  prior row
- `src/lib/intelligence/health-score/improvements.ts` — pure
  function that produces 2–4 `HealthScoreAction` candidates from
  the factor breakdown (e.g., "Tu Ahorro está en 30%. Sube a 50%
  para ganar 50 puntos."). No AI yet — rule-based, transparent
- `src/lib/intelligence/health-score/engine.test.ts` — integration
  test with synthetic-isolated fixtures
- `src/lib/db/repositories/health-score.ts` — repo with `create`,
  `findLatestForProfile`, `findHistoryForProfile`
- `src/lib/db/repositories/index.ts` — re-export

**Acceptance criteria (7 items):**

- [ ] Engine output is deterministic for a fixed clock + fixed
      transaction set
- [ ] `partial: true` propagates from any factor; surface count
      of partial factors
- [ ] Persist writes `HealthScore` + N `HealthScoreAction` rows in
      a single Prisma `$transaction`
- [ ] `previousScore` correctly carried from the latest prior row
      (null if first computation)
- [ ] Improvement actions sorted by `estimatedImpact DESC`
- [ ] No AI calls in this batch (improvements are rule-based)
- [ ] Full gate sweep green

**Risk notes:**

- AI-generated improvement copy can land later — keep the rule-
  based version as the fallback so users always see something
  honest.

---

### Batch 11 — Score recompute API + history API

**Goal:** HTTP endpoints to trigger recompute and read history.

**Files:**

- `src/app/api/v1/intelligence/health-score/route.ts` —
  - `POST` triggers recompute. Rate-limited to 1× per Profile per
    hour via a `RECOMPUTE_THROTTLE_MS` key on `Profile.metadata` or
    a `last_health_score_request_at` column? **Decision:** store
    `Profile.lastHealthScoreRecomputeAt: DateTime?` — single
    additive column, no JSONB juggling. (Add to schema in this
    batch; second `db:push`.)
  - `GET` returns latest + N-month history
- `src/lib/validators/health-score.ts` — query schema for `GET`
- `tests/e2e/api-health-score.spec.ts` — anonymous → 401, valid
  body → 429 throttle on second call within an hour

**Acceptance criteria (7 items):**

- [ ] POST requires auth; 401 anonymous
- [ ] POST 429 with `Retry-After` header when within throttle
      window
- [ ] POST returns `{ data: HealthScore }` with the freshly-
      persisted row
- [ ] GET returns `{ data: HealthScore, history: HealthScore[] }`
- [ ] Schema migration applies cleanly (`db:push`)
- [ ] E2E tests pass for both 401 paths
- [ ] Full gate sweep green

---

### Batch 12 — Gauge UI component

**Goal:** Reusable `<HealthScoreGauge>` component. Recharts
RadialBarChart, animated, color-zone-aware.

**Files:**

- `src/components/health-score/gauge.tsx` — props: `{ score,
previousScore?, partial? }`; renders gauge with tier band color
- `src/components/health-score/tier.ts` — `scoreTier(score)` →
  `'critico' | 'enRiesgo' | 'estable' | 'excelente'` + color
  constant
- `src/components/health-score/tier.test.ts` — boundary tests
  (399→crítico, 400→enRiesgo, 599→enRiesgo, 600→estable, 799→
  estable, 800→excelente)
- `src/components/health-score/gauge.test.tsx` — RTL snapshot of
  the rendered SVG structure (verifies color + numeric value)

**Acceptance criteria (7 items):**

- [ ] Gauge renders a numeric score + tier label inside the arc
- [ ] Trend arrow shown when `previousScore` is set (up = teal,
      down = warning gold; never red — accessibility)
- [ ] `partial: true` shows a "Faltan datos" pill instead of the
      trend arrow
- [ ] aria-label includes the score + tier in Spanish so screen
      readers don't rely on color
- [ ] 600ms animation on mount; respects `prefers-reduced-motion`
- [ ] All six tier boundaries unit-tested
- [ ] Full gate sweep green

---

### Batch 13 — Score detail page

**Goal:** `/dashboard/salud` — full Health Score view with gauge,
factor radar, history line chart, improvement actions.

**Files:**

- `src/app/(app)/dashboard/salud/page.tsx` — server component
- `src/components/health-score/factor-radar.tsx` — Recharts
  RadarChart over the six factor scores
- `src/components/health-score/history-chart.tsx` — Recharts
  LineChart of score over time
- `src/components/health-score/improvement-list.tsx` —
  improvement actions list + "Marcar como hecho" + "Descartar"
  buttons
- `src/app/(app)/dashboard/salud/actions.ts` — server actions
  for `complete` / `dismiss` improvement actions
- `src/messages/es-GT.json` — `healthScore.*` block (factor names,
  formulas, action labels)

**Acceptance criteria (8 items):**

- [ ] Page renders gauge + radar + history + actions vertically on
      mobile, two-column on desktop
- [ ] Radar chart axes are translated factor names (not technical
      keys)
- [ ] Clicking a factor on the radar reveals its formula + current
      inputs (collapsible card)
- [ ] Improvement actions sorted by estimated impact, with the
      points-impact number visible
- [ ] `complete` and `dismiss` actions revalidate the page
- [ ] No score yet → "Calcula tu primer puntaje" CTA → fires the
      POST recompute endpoint
- [ ] All copy in tú register, lower-elementary Spanish
- [ ] Full gate sweep green

---

### Batch 14 — Dashboard wire-up

**Goal:** Replace the dashboard placeholder with the real MVP view
for users with transactions: gauge widget + recent-activity list +
monthly summary widget + quick links to reports.

**Files:**

- `src/app/(app)/dashboard/page.tsx` — branch: zero transactions →
  S-2.9 empty state (already shipped); non-zero → render the new
  dashboard
- `src/components/dashboard/score-widget.tsx` — wraps `<HealthScoreGauge>`
  with a link to `/dashboard/salud`
- `src/components/dashboard/monthly-summary.tsx` — current-month
  income/expense/net using `monthlyCashFlow` from Batch 6
- `src/components/dashboard/recent-activity.tsx` — last 10
  transactions, links to detail
- `src/messages/es-GT.json` — `dashboard.*` (extends existing)

**Acceptance criteria (6 items):**

- [ ] Zero-transaction users still see the S-2.9 empty state
      unchanged
- [ ] Non-zero users see gauge prominently above the fold
- [ ] No score yet → gauge shows "Sube tu primer estado de cuenta"
      empty state with a "Calcular ahora" button
- [ ] Monthly summary respects the current-month boundary in
      `America/Guatemala`
- [ ] Recent-activity rows match the feed's row style for
      consistency
- [ ] Full gate sweep green

---

### Batch 15 — Nightly cron stub (Railway-ready)

**Goal:** `/api/cron/health-score` that recomputes scores for every
active Profile. Triggered by Vercel Cron at 02:00 GT in MVP. When
user count hits the Railway threshold (per
[memory: project_compute_constraints](~/.claude/projects/-Users-jorgeluiscontrerasherrera-Documents--git-ifa/memory/project_compute_constraints.md)),
this endpoint becomes the trigger that Railway calls.

**Files:**

- `src/app/api/cron/health-score/route.ts` — auth via `CRON_SECRET`,
  iterates active Profiles, calls `computeHealthScore` for each,
  isolates per-profile failures
- `vercel.json` — cron entry `0 8 * * *` (02:00 GT = 08:00 UTC)
- `src/lib/intelligence/health-score/cron-runner.ts` — orchestration
  helper (loop + isolation + summary)
- Add header comment in `cron-runner.ts` documenting the
  Railway migration path: when this hits Vercel's 60s ceiling,
  Railway calls this same endpoint with `Authorization: Bearer
$CRON_SECRET`; no other code changes needed.

**Acceptance criteria (6 items):**

- [ ] Endpoint requires `CRON_SECRET`; 401 otherwise
- [ ] Per-profile failures don't crash the batch; failed profile
      ids logged with the error
- [ ] Each profile's recompute respects the 1× / hour throttle
      from Batch 11 (cron bypasses it via a `force: true` flag)
- [ ] Summary returned: `{ totalProfiles, succeeded, failed,
    durationMs }`
- [ ] Vercel cron config registers the schedule
- [ ] Full gate sweep green

**Risk notes:**

- The 60s Vercel limit means this works for ≲500 profiles assuming
  ~100ms per recompute. Beyond that, the cron migrates to Railway
  per the locked memory.

---

## 5. Total item count

| Batch                          | Items                           |
| ------------------------------ | ------------------------------- |
| 1 Schema                       | 5                               |
| 2 Anthropic client             | 6                               |
| 3 Categorization service       | 7                               |
| 4 Job queue + cron             | 7                               |
| 5 Auto-trigger + backfill      | 6                               |
| 6 Aggregation primitives       | 6                               |
| 7 Reports UI                   | 8                               |
| 8 Anomaly detection            | 6                               |
| 9 Factor library               | 8                               |
| 10 Engine + persistence        | 7                               |
| 11 Recompute API + history API | 7                               |
| 12 Gauge UI                    | 7                               |
| 13 Score detail page           | 8                               |
| 14 Dashboard wire-up           | 6                               |
| 15 Nightly cron                | 6                               |
| **Total**                      | **100 items across 15 batches** |

## 6. Progress log

Format: `[checkbox] Batch N — Name · X/Y in batch · A/100 overall · commit <sha> · YYYY-MM-DD`.
Update this list at the end of every batch before the commit. The commit
that closes a batch MUST include this file's updated progress log so
state is recoverable from `git log -p docs/_PHASE_6_7_PLAN.md`.

- [x] Batch 1 — Schema additions · 5/5 in batch · 5/100 overall · commit `<pending>` · 2026-04-22 - schema validated (`pnpm db:format`) - `db:push --accept-data-loss` applied to Supabase prod, diff was purely additive (3 enums + 2 tables + 4 indexes; no DROP, no ALTER COLUMN) - `db:generate` refreshed client - `MerchantCategory` added to `TENANT_SCOPED_MODELS` in `src/lib/db/tenancy.ts` - smoke count: `{ merchantCategories: 0, pendingJobs: 0 }` — tables reachable - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 242/242 ✓ playwright 60/60 ✓ next build ✓
- [ ] Batch 2 — Anthropic client wrapper · 0/6 in batch · 0/100 overall
- [ ] Batch 3 — AI categorization service · 0/7 in batch · 0/100 overall
- [ ] Batch 4 — Job queue infrastructure · 0/7 in batch · 0/100 overall
- [ ] Batch 5 — Auto-trigger + backfill · 0/6 in batch · 0/100 overall
- [ ] Batch 6 — Aggregation primitives · 0/6 in batch · 0/100 overall
- [ ] Batch 7 — Reports UI · 0/8 in batch · 0/100 overall
- [ ] Batch 8 — Anomaly detection · 0/6 in batch · 0/100 overall
- [ ] Batch 9 — Health Score factor library · 0/8 in batch · 0/100 overall
- [ ] Batch 10 — Health Score engine + persistence · 0/7 in batch · 0/100 overall
- [ ] Batch 11 — Recompute API + history API · 0/7 in batch · 0/100 overall
- [ ] Batch 12 — Gauge UI component · 0/7 in batch · 0/100 overall
- [ ] Batch 13 — Score detail page · 0/8 in batch · 0/100 overall
- [ ] Batch 14 — Dashboard wire-up · 0/6 in batch · 0/100 overall
- [ ] Batch 15 — Nightly cron stub · 0/6 in batch · 0/100 overall

## 7. Open questions (none right now)

Everything was answered in the 2026-04-22 planning turn. New
questions surfaced during a batch get appended here with the batch
number that raised them.
