# IFA — Phase 6 + Phase 7 Build Plan (INDIVIDUAL-tier MVP)

> **Authoritative source for the next 15 batches.** This file is written so
> a future contributor (or a compacted Claude conversation) can pick up
> any batch from cold context — no chat history required. Each batch has
> goal, files, acceptance criteria, dependencies, and risk notes.
>
> **Companion research:** [\_DATAVIZ_BEST_PRACTICES.md](./_DATAVIZ_BEST_PRACTICES.md)
> — sourced design + tech-stack rationale that drove the bullet-graph
> (not gauge) decision in Batch 12 and the `<Money>`/es-GT format
> requirement in Batch 7.

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

**Tier bands** (used for color coding wherever the score is rendered — bullet graph in Batch 12, sparklines, dashboard cards):

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
- [ ] All currency rendering goes through the `<Money>` primitive
      ([src/components/primitives/money.tsx](../src/components/primitives/money.tsx)),
      not ad-hoc string formatting. Verify the output conforms to the
      Banco de Guatemala convention surfaced in research:
      `Q 1,234.56` — `Q` prefix, U+00A0 non-breaking space, comma
      thousands, period decimal — exactly what
      `Intl.NumberFormat('es-GT', { currencyDisplay: 'narrowSymbol' })`
      emits (see [\_DATAVIZ_BEST_PRACTICES.md §3](./_DATAVIZ_BEST_PRACTICES.md)).
      Negative amounts render in Latin-American accounting convention
      (parentheses); the primitive already does this
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

### Batch 12 — Bullet graph UI component

**Goal:** Reusable `<HealthScoreBullet>` component. Linear (not
radial) bullet graph encoding actual score + qualitative tier bands

- previous-month comparison tick, per Stephen Few's design spec.
  Replaces the originally-planned radial gauge — gauges are
  documented anti-patterns for scored values (space-inefficient, fail
  at comparison). See
  [\_DATAVIZ_BEST_PRACTICES.md §1.3 + §1.5 + §2](./_DATAVIZ_BEST_PRACTICES.md)
  for the research that drove this change.

Hand-rolled SVG (≈80 lines). No Recharts dependency for this
component — Recharts' radial primitives aren't a fit, and a custom
linear track is simpler than fighting the lib.

**Files:**

- `src/components/health-score/bullet.tsx` — props: `{ score,
previousScore?, partial? }`; renders a horizontal track with the
  four tier bands as background, the actual score as a vertical
  marker, and the previous-month score (when provided) as a small
  tick above the track
- `src/components/health-score/tier.ts` — `scoreTier(score)` →
  `'critico' | 'enRiesgo' | 'estable' | 'excelente'` + color
  constant per tier (red / amber / teal / deep-teal)
- `src/components/health-score/tier.test.ts` — boundary tests
  (399→crítico, 400→enRiesgo, 599→enRiesgo, 600→estable,
  799→estable, 800→excelente)
- `src/components/health-score/bullet.test.tsx` — RTL snapshot of
  the rendered SVG structure: tier-band rects, score marker
  position, previous-period tick position, aria-label text

**Acceptance criteria (8 items):**

- [ ] Horizontal track 0–1000 with four tier bands as background
      fills (Crítico red, En riesgo amber, Estable teal, Excelente
      deep teal — see [\_DATAVIZ_BEST_PRACTICES.md §1.3](./_DATAVIZ_BEST_PRACTICES.md))
- [ ] Actual score rendered as a vertical marker over the bands,
      with the numeric value + Spanish tier label adjacent (never
      relies on color alone — WCAG SC 1.4.1)
- [ ] `previousScore` (when set) renders as a smaller tick above
      the track at its position, with a hairline connecting it to
      the actual-score marker (the "comparación" cue from §1.5)
- [ ] `partial: true` shows a "Faltan datos" pill instead of the
      previous-period tick
- [ ] aria-label includes the score + tier in Spanish ("Puntaje 720
      de 1000, Estable") so screen readers don't rely on visual
      encoding
- [ ] 600ms animation on the marker position only; respects
      `prefers-reduced-motion`
- [ ] All six tier boundaries unit-tested
- [ ] Full gate sweep green

**Risk notes:**

- The originally-planned `<HealthScoreGauge>` semicircle survives
  in the demo kit ([demo/src/components/demo/financial-overview.tsx](../demo/src/components/demo/financial-overview.tsx))
  for the panic-mode emergency path; it is NOT updated here because
  the kit is a frozen snapshot. When the kit is next refreshed,
  the gauge should be replaced with this bullet component too.

---

### Batch 13 — Score detail page

**Goal:** `/dashboard/salud` — full Health Score view with the
bullet graph (Batch 12), factor radar, history line chart, and
improvement actions.

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

- [ ] Page renders bullet graph + radar + history + actions
      vertically on mobile, two-column on desktop
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
for users with transactions: Health Score bullet-graph widget +
recent-activity list + monthly summary widget + quick links to
reports.

**Files:**

- `src/app/(app)/dashboard/page.tsx` — branch: zero transactions →
  S-2.9 empty state (already shipped); non-zero → render the new
  dashboard
- `src/components/dashboard/score-widget.tsx` — wraps `<HealthScoreBullet>`
  (Batch 12) with a link to `/dashboard/salud`
- `src/components/dashboard/monthly-summary.tsx` — current-month
  income/expense/net using `monthlyCashFlow` from Batch 6
- `src/components/dashboard/recent-activity.tsx` — last 10
  transactions, links to detail
- `src/messages/es-GT.json` — `dashboard.*` (extends existing)

**Acceptance criteria (6 items):**

- [ ] Zero-transaction users still see the S-2.9 empty state
      unchanged
- [ ] Non-zero users see the Health Score bullet graph prominently
      above the fold
- [ ] No score yet → bullet graph shows "Sube tu primer estado de
      cuenta" empty state with a "Calcular ahora" button
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
| 12 Bullet graph UI             | 8                               |
| 13 Score detail page           | 8                               |
| 14 Dashboard wire-up           | 6                               |
| 15 Nightly cron                | 6                               |
| **Total**                      | **101 items across 15 batches** |

## 6. Progress log

Format: `[checkbox] Batch N — Name · X/Y in batch · A/101 overall · commit <sha> · YYYY-MM-DD`.

> Total rose from 100 → 101 on 2026-05-21 when Batch 12 was retitled
> "Bullet graph UI component" with 8 acceptance items (vs the original
> gauge plan's 7). Historical entries below keep their `/100` denominator
> as a snapshot of what the plan was at that commit. New entries should
> use `/101`. See [\_DATAVIZ_BEST_PRACTICES.md §7](./_DATAVIZ_BEST_PRACTICES.md)
> for the change rationale.
> Update this list at the end of every batch before the commit. The commit
> that closes a batch MUST include this file's updated progress log so
> state is recoverable from `git log -p docs/_PHASE_6_7_PLAN.md`.

- [x] Batch 1 — Schema additions · 5/5 in batch · 5/100 overall · commit `<pending>` · 2026-04-22 - schema validated (`pnpm db:format`) - `db:push --accept-data-loss` applied to Supabase prod, diff was purely additive (3 enums + 2 tables + 4 indexes; no DROP, no ALTER COLUMN) - `db:generate` refreshed client - `MerchantCategory` added to `TENANT_SCOPED_MODELS` in `src/lib/db/tenancy.ts` - smoke count: `{ merchantCategories: 0, pendingJobs: 0 }` — tables reachable - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 242/242 ✓ playwright 60/60 ✓ next build ✓
- [x] Batch 2 — Anthropic client wrapper · 6/6 in batch · 11/100 overall · commit `<pending>` · 2026-05-21 - `@anthropic-ai/sdk@0.97.1` installed - `src/lib/ai/claude.ts` exports `MODEL_OPUS='claude-opus-4-7'`, `MODEL_HAIKU='claude-haiku-4-5-20251001'`, singleton `getClaudeClient()` (lazy env read, `maxRetries: 0` so our loop owns retries), `callClaudeWithRetry()` with 3-retry exponential backoff (200/800/3200 ms) on 5xx + 429, structured cost telemetry that emits only `{event, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, latencyMs}` — never prompt/response content - `_resetClaudeClientForTesting()` test seam - `src/lib/ai/claude.test.ts` covers 10 paths: model constants, first-attempt success, telemetry shape + privacy invariant (no `ping`/`"ok"` in log line), cache-counter defaults, 500→retry, 429→retry, exhaust 3 retries→rethrow APIError, no-retry on 400, no-retry on non-APIError, singleton identity - vitest mock of `@/lib/env` for module-load env throw; `@vitest-environment node` directive for SDK's browser guard - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 252/252 ✓ playwright 60/60 ✓ next build ✓
- [x] Batch 3 — AI categorization service · 7/7 in batch · 18/100 overall · commit `<pending>` · 2026-05-21 - `src/lib/ai/categories.ts` ships the 12-label closed vocabulary (`CATEGORIES` const + `isCategory` guard) - `src/lib/ai/categorization.ts` exports `normalizeLookupKey()` (pure: NIT-preferred, name-fallback with NFD accent-strip + whitespace-collapse) and `categorizeMerchant(profileId, merchant)` (cache hit → return; miss → Claude Haiku w/ stable system prompt under `cache_control: ephemeral`, Zod-validated against `CATEGORIES`, malformed/throw → null, success → `MerchantCategory.create({source:'AI', aiConfidence})`; unique-key race re-fetches the winner) - `src/lib/db/repositories/merchant-category.ts` exposes `findByLookupKey`/`create`/`count` (deliberately narrow: no upsert until USER override surface lands) - 14 unit tests cover the 4 required paths (hit, miss→success, miss→AI-error, miss→malformed) plus normalization edges, out-of-vocab rejection, confidence out-of-range, empty lookup key, and the concurrent-write race - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 266/266 ✓ playwright 60/60 ✓ next build ✓
- [x] Batch 4 — Job queue infrastructure · 7/7 in batch · 25/100 overall · commit `<pending>` · 2026-05-21 - `src/lib/jobs/queue.ts` exports `jobQueue` with `enqueue`, `claim` (raw SQL with `FOR UPDATE SKIP LOCKED` against `prismaUnscoped`), `markDone`, `markFailed` (atomic UPDATE: bumps attempts, dead-letters at MAX_ATTEMPTS=3, otherwise requeues with 30s→2m backoff), and `countByStatus` - `src/lib/jobs/handlers/index.ts` ships the JobType → handler dispatch table with stubs for `CATEGORIZE_TRANSACTION` (Batch 5) and `DETECT_ANOMALY` (Batch 8) + `_registerHandlerForTesting` seam - `src/app/api/cron/jobs/route.ts` GET handler: Bearer-token auth via `CRON_SECRET` (fail-closed if env unset), claims up to 25 jobs per invocation, per-job try/catch isolation so one throwing handler doesn't crash the batch, even tolerates markFailed itself throwing (logs + counts as failed). Returns `{workerId, claimed, completed, failed, durationMs}` - `vercel.json` registers `* * * * *` cron schedule pointing at /api/cron/jobs (Pro tier; free tier falls back to daily per Vercel limits) - `eslint.config.mjs` adds `src/lib/jobs/**` to the `no-restricted-imports` ignores (queue is DB-adjacent infrastructure) - Unit tests: 11 in `src/lib/jobs/queue.test.ts` (enqueue, claim SQL shape + limit-0 short-circuit, markDone, markFailed atomic update + error truncation, countByStatus), 7 in `src/app/api/cron/jobs/route.test.ts` (4 auth + 4 processing-loop incl. per-job isolation + markFailed-throws survival) - E2E tests: 3 cron-auth specs in `tests/e2e/api-cron-jobs.spec.ts` × 3 browsers = 9 - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 284/284 ✓ playwright 69/69 ✓ next build ✓
- [x] Batch 5 — Auto-trigger + backfill · 6/6 in batch · 31/100 overall · commit `<pending>` · 2026-05-21 - `transactionRepo.createManualWithAudit` enqueues 1 `CATEGORIZE_TRANSACTION` job after the insert/audit transaction commits; skipped when the caller already supplied `category`. Enqueue failure is non-fatal (warn-logged) so a transient queue blip doesn't roll back the row - `transactionRepo.createManyFromImport` switched from `createMany` to `createManyAndReturn` to get inserted rows back; bulk-enqueues a job per inserted (skipDuplicates-aware) row via the new `jobQueue.enqueueMany` - `src/lib/ai/categorization.ts` return type widened from `Category | null` to `CategorizationResult | null` ({category, confidence}); the categorize-transaction handler needs the confidence to write `Transaction.aiCategoryConfidence`. Existing 14 tests updated to assert the richer shape - `src/lib/jobs/handlers/categorize-transaction.ts` validates payload via Zod (transactionId + profileId, both UUIDs); reads the row via `prismaUnscoped` scoped by both ids (cross-tenant safety); idempotent (no-ops when `category` is already set or row was deleted); calls `categorizeMerchant` then writes `category` + `aiCategoryConfidence`; throws on null result so queue retries kick in - `src/lib/jobs/handlers/index.ts` swaps the stub for the real handler - `src/app/api/admin/backfill-categorization/route.ts` POST endpoint requires Bearer `CRON_SECRET` AND `?confirm=yes`; scans `category IS NULL` across all tenants and bulk-enqueues. Returns `{scanned, enqueued, durationMs}` - `eslint.config.mjs` adds `src/app/api/admin/**` to `no-restricted-imports` ignores (admin endpoints read cross-tenant by design) - Unit tests: 7 handler tests (malformed payload x2, missing tx, idempotency, success, null confidence USER override, scope verification, null result throws) + 8 admin-route tests (auth + confirm guard + happy path + empty scan) = 15 new - E2E: 3 admin-auth specs in `tests/e2e/api-admin-backfill.spec.ts` × 3 browsers = 9 - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 299/299 ✓ playwright 78/78 ✓ next build ✓
- [x] Batch 6 — Aggregation primitives · 6/6 in batch · 37/100 overall · commit `<pending>` · 2026-05-21 - `src/lib/reports/aggregations.ts` exports three pure functions: `monthlyCashFlow(transactions, {from, to})` fills missing months with zeros, excludes TRANSFER, sums INCOME/EXPENSE per YYYY-MM, returns `{month, income, expense, net}[]` sorted oldest→newest; `spendingByCategory(transactions, {from, to})` filters to EXPENSE only, collapses null/empty/whitespace category into `UNCATEGORIZED_LABEL = "Sin categoría"`, divide-by-zero guard on percent, sorted by total desc; `topMerchants(transactions, {from, to, limit})` filters to EXPENSE only, groups by name with NIT fallback (with `UNKNOWN_MERCHANT_LABEL` sentinel when both missing), backfills missing identifiers across sightings of the same merchant, clamps to limit - All amounts accepted as `Prisma.Decimal | number | string` so the functions are usable from synthetic test fixtures AND from real Prisma rows without conversion - `transactionRepo.listAllForReports({from, to})` added: tenant-scoped bulk fetch with date filter, no pagination (reports compute over the full set in memory) - 30 unit tests in `src/lib/reports/aggregations.test.ts` covering: empty-input, invalid range, single-tx, single-month, cross-year, range inclusivity, TRANSFER exclusion, null/empty/whitespace category handling, divide-by-zero, name+nit backfill, limit clamping (incl. ≤0), Decimal/number/string amount input, negative-amount sums - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 329/329 ✓ playwright 78/78 ✓ next build ✓
- [x] Batch 7 — Reports UI · 8/8 in batch · 45/101 overall · commit `<pending>` · 2026-05-21 - `src/lib/reports/period.ts` URL-synced period parser: `1m`/`3m`/`6m`/`12m`/`custom`, defaults to `6m`, custom requires valid `from`+`to` ISO dates with `from ≤ to`, normalizes everything to midnight UTC. 15 unit tests cover defaults, fallbacks, year-crossing, round-trip serialization - `src/lib/reports/rollup.ts` collapses long-tail categories into one "Otros" bucket past top N (default 6), preserving total/percent/count sums. 5 unit tests - `src/components/reports/period-picker.tsx` client component: segmented control matching Copilot's `Mes / 3M / 6M / Año / Personalizado` convention, URL-syncs via `router.replace({scroll:false})`, strips stale `from`/`to` when leaving custom, aria-pressed on active, ≥36×44 px touch targets. 6 RTL tests (mocking next/navigation + next-intl) - `src/components/reports/cash-flow-chart.tsx` Recharts ComposedChart: grouped bars (ingresos teal + gastos red) + line overlay (neto navy), y-axis pinned at 0 per Correll et al. anti-truncation research, tooltip via `formatMoney` - `src/components/reports/category-bar-chart.tsx` Recharts horizontal BarChart, colorblind-safe Tableau 10 palette, y-axis pinned at 0 - `src/components/reports/empty-state.tsx` activation-style empty state with upload CTA (per dataviz §5.1 #8 — never flat charts) - `/reportes` hub: 3 cards (BarChart3/PieChart/Store icons) linking to detail pages, responsive grid - `/reportes/flujo` server component: monthlyCashFlow → stat row (totalIncome/totalExpense/totalNet/monthsCount via `<Money>`) + ComposedChart + accessible HTML table mirror - `/reportes/gastos` server component: spendingByCategory + rollupCategories(limit=6) + horizontal bar + table mirror with Total row - `/reportes/comercios` server component: topMerchants(limit=10) as a table only (per research — top-merchants is a list, not a chart) - `src/messages/es-GT.json` adds `reports.*` block: hub, period labels, empty state, per-report titles/subtitles/columns/captions in tú-register lower-elementary Spanish - `src/app/globals.css` `@media print` block: hides sidebar/topbar/paywall/picker, flattens backgrounds, sets `break-inside: avoid` on cards - `recharts@^3.8.1` added as a real prod dep (was demo-only before) - `<Money>` primitive verified to produce `Q 1,234.56` exactly matching Banguat convention; existing 11 Money tests already pin this - 3 e2e auth-proxy specs × 3 browsers + 3 routes + 1 query-preservation = 15 - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 355/355 ✓ playwright 93/93 ✓ next build ✓
- [x] Batch 8 — Anomaly detection · 6/6 in batch · 51/101 overall · commit `<pending>` · 2026-05-21 - `src/lib/intelligence/anomalies.ts` pure `detectAnomaly({amount, merchantHistory})` returns `{method, zScore} | null`. Two methods: `new_merchant` (history ≤ 1, zScore=0), `merchant_zscore` (history ≥ 10, |zScore| > 3 strict). Returns null for 2–9 history (insufficient sample), for in-range amounts, and for flat-history (stdDev=0) to avoid divide-by-zero noise - `src/lib/transactions/anomaly-detection.ts` mirrors `duplicate-detection.ts`: `readAnomalyMetadata` (defensive shape validation, drops bad-typed fields), `hasActiveAnomalyFlag` (method set AND not dismissed) - `src/lib/jobs/handlers/detect-anomaly.ts` real handler: Zod-validated payload, cross-tenant-safe `findFirst`, idempotency short-circuit when `anomaly.method` already present, EXPENSE-only filter, NIT-preferred / name-fallback merchant join, history excludes self via `id: {not: ...}`, JSONB-merge-on-update preserves duplicate-detection siblings - Auto-enqueue wired in `transactionRepo.createManualWithAudit` (single `enqueueMany` for both CATEGORIZE + DETECT) and `createManyFromImport` (bulk enqueueMany for N×2 jobs) - `src/lib/jobs/handlers/index.ts` swaps the stub for the real handler; dispatch table fully wired - Feed badge: `src/components/transactions/feed.tsx` adds `anomalyMethod` to FeedRow, renders red `Activity` badge for `merchant_zscore` and teal `Sparkles` badge for `new_merchant` (mirrors the duplicate-badge styling). i18n keys `feed.anomalyBadge` ("Movimiento inusual") + `feed.newMerchantBadge` ("Comercio nuevo") - Unit tests: 17 detectAnomaly (new-merchant, in-between history, z-score above/below/exactly-3σ, stdDev=0 degenerate, sort-independence, negative-history) + 12 anomaly-detection metadata helpers (bad-input defensive paths, dismissed flag, sibling-key coexistence) + 10 handler tests (malformed payload, missing tx, idempotency, non-EXPENSE skip, NIT-vs-name preference, new-merchant write, z-score write, in-range no-update, sibling-metadata preservation, cross-tenant scoping) = 39 new - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 394/394 ✓ playwright 93/93 ✓ next build ✓
- [x] Batch 9 — Health Score factor library · 8/8 in batch · 59/101 overall · commit `<pending>` · 2026-05-21 - `src/lib/intelligence/health-score/types.ts` shared `FactorInput`/`FactorResult`/`FactorFn`/`FactorKey` shapes; `FactorTransaction` narrow input shape decoupled from Prisma's full Transaction row - `src/lib/intelligence/health-score/helpers.ts` shared math + windowing: `clamp`, `coefficientOfVariation` (sample stdDev, divide-by-zero guards), `lastNMonthsWindow`, `isInRange`, `bucketByMonth` (parallels Batch 6's monthlyCashFlow but on the narrow factor shape), `merchantKey` (NIT-preferred, name-fallback — matches categorization + anomaly conventions), `monthsWithExpense`/`monthsWithIncome` for partial-threshold checks - Six pure factor functions in `factors/`: spendingDiscipline (20%, 6mo, CV-based), incomeStability (20%, 6mo), savingsRate (20%, 3mo, 30%-target ceiling per LatAm benchmark), cashFlowConsistency (15%, 6mo, net CV), recurringSpending (15%, 3mo, ≥3 same-merchant occurrences), anomalyRate (10%, 3mo, ×1000 multiplier with hasActiveAnomalyFlag from Batch 8) - Each factor: pure, clock-injected via `now`, score clamped [0,100], `partial:true` below 3mo-of-data (or 10 expense-row) threshold, `inputs` map exposes formula transparency for the UI's "why?" expansion - `factors/index.ts` exports `FACTORS` registry + `FACTOR_WEIGHTS` const (pinned test: sum === 100, keys === FactorKey union) so the engine (Batch 10) reads reflectively - `README.md` documents every formula with worked examples (saint vs. chaos for CV, target/half/zero/negative for savings rate, recurring + anomaly walkthroughs), citations (30% target, 3σ threshold, sample stdDev choice), and the contribute-a-factor checklist - Unit tests: 21 helpers + 6 spending-discipline + 5 income-stability + 7 savings-rate + 4 cash-flow-consistency + 6 recurring-spending + 6 anomaly-rate + 5 index-registry = 60 new - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 454/454 ✓ playwright 93/93 ✓ next build ✓
- [x] Batch 10 — Health Score engine + persistence · 7/7 in batch · 66/101 overall · commit `<pending>` · 2026-05-21 - `src/lib/intelligence/health-score/engine.ts` exports pure `computeHealthScore({transactions, now, previousScore})`: iterates `FACTORS` registry, weights × scores → /10 → integer score in [0, 1000]. Returns `{score, previousScore, factors[], partial, partialFactorCount, computedAt}` — deterministic for fixed input. Also exports `snapshotToFactorsJson` (serializer for the JSONB column) and `healthScoreWindow(now)` (canonical 6mo window) - `src/lib/intelligence/health-score/improvements.ts` rule-based generator: 6 per-factor rules (one per FactorKey, sanity-tested), each builds Spanish tú-register copy from the breakdown's `inputs` map. Selection: skip factors with score ≥ 90 OR partial=true (no honest suggestion possible), rank by `estimatedImpact DESC` (= `(target − current) × weight / 10`), cap at 4, fallback to lowest-scoring non-partial factors when nothing strict survives - `src/lib/db/repositories/health-score.ts` exposes `createWithActions` (atomic `$transaction`: parent HealthScore + N HealthScoreAction rows, rollback together if any insert fails), `findLatestForProfile`, `findHistoryForProfile`, `findActionsForScore`, `count`. Re-exported from `repositories/index.ts` - `src/lib/intelligence/health-score/persist.ts` glue: `recomputeHealthScore({profileId, now, period})` wraps everything in `withTenant({profileId, userId: null}, ...)`, reads transactions via `transactionRepo.listAllForReports` (Batch 6), fills `previousScore` from `findLatestForProfile`, computes snapshot, generates improvements, writes atomically. Returns `{snapshot, healthScoreId, actionsCount}` - Unit tests: 9 engine (determinism, in-range score, breakdown shape, previousScore passthrough, partial propagation, snapshotToFactorsJson, healthScoreWindow) + 6 improvements (rule-coverage sanity, sorting, ≥90 skip, partial skip, integer-impact, Spanish-copy register) = 15 new on top of B9's 60 - No AI calls in this batch (improvement copy is rule-based per the plan's risk note — stays as the honest fallback when AI generation lands later) - gate sweep: lint ✓ typecheck ✓ prettier ✓ vitest 471/471 ✓ playwright 93/93 ✓ next build ✓
- [ ] Batch 11 — Recompute API + history API · 0/7 in batch · 0/100 overall
- [ ] Batch 12 — Bullet graph UI component · 0/8 in batch · 0/100 overall
- [ ] Batch 13 — Score detail page · 0/8 in batch · 0/100 overall
- [ ] Batch 14 — Dashboard wire-up · 0/6 in batch · 0/100 overall
- [ ] Batch 15 — Nightly cron stub · 0/6 in batch · 0/100 overall

## 7. Open questions (none right now)

Everything was answered in the 2026-04-22 planning turn. New
questions surfaced during a batch get appended here with the batch
number that raised them.
