# Phase 6 + 7 Retrospective (INDIVIDUAL-tier MVP)

> Closed 2026-05-21. Scope: the 15-batch plan in
> [\_PHASE_6_7_PLAN.md](./_PHASE_6_7_PLAN.md), kicked off 2026-04-22.
> 101/101 acceptance items closed.

This doc is the "what to remember next time" companion to the plan.
It deliberately doesn't restate what shipped — git log and the plan
already do that. It captures **decisions that diverged from the
plan**, **debt we carried forward**, and **lessons worth repeating**.

## 1. Scope shipped

|                             |                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Batches                     | 15/15                                                                                        |
| Acceptance items            | 101/101                                                                                      |
| P67-tagged commits          | 16 (B1 → B15) + 2 supporting (`cf39496` docs, `61b20ef` ALS fix) + 1 demo freeze (`ff63423`) |
| Files touched               | 121                                                                                          |
| Diff size                   | ~15,374 insertions / ~33 deletions                                                           |
| Unit tests                  | 242 → 539 (+297, +123%)                                                                      |
| Playwright specs (chromium) | 20 → 38 (+18)                                                                                |
| Calendar time               | 2026-04-22 → 2026-05-21 (~4 weeks)                                                           |

## 2. Plan-vs-actual deltas (decisions made mid-flight)

These overrode the originally-specified design. Each cites the
research that justified the swap; the
[\_DATAVIZ_BEST_PRACTICES.md](./_DATAVIZ_BEST_PRACTICES.md) §7
implications table is the long-form record.

### 2.1 Radial gauge → linear bullet graph (B12)

Plan called for a half-circle gauge for the Health Score (0–1000).
Stephen Few's bullet-graph spec rejects radial encodings for
quantitative comparison: humans estimate angle worse than length,
and a gauge's arc wastes ~50% of pixel area on chrome that doesn't
encode data. Switched to a linear bullet with four tier-band
backgrounds + previous-period tick + comparison hairline. **Net
result:** a smaller, hand-rolled component (no Recharts dep), four
tier-bands always visible, WCAG 1.4.1-compliant (tier label rendered
adjacent to the number, never relies on color alone).

### 2.2 Radar chart → horizontal factor bars (B13)

Plan called for a Recharts RadarChart of the six factor sub-scores.
Same critique as gauges from NN/g + Few: circular charts are poor
for quantitative comparison; bars beat them on every axis except
"shape gestalt", which doesn't survive humans' weakness at
estimating angles. Switched to a horizontal BarChart sorted desc by
score, tier-colored. **Net result:** the visual ramp from
strongest → weakest is obvious without legend-hunting; factors
inherit the bullet's tier colors so red-amber-teal-deepteal means
the same thing app-wide.

### 2.3 Sankey deferred (not yet adopted)

Researched as a candidate for the cash-flow report. Rejected for
now — Sankey adds visual complexity without earning it at MVP
income/expense cardinality. Held open for re-consideration when
the BUSINESS tier ships and account-to-account flows become a
first-class concept.

### 2.4 `<Money>` primitive verification, not creation (B7)

Plan listed `<Money>` as a B7 build item. Discovered during
implementation that the primitive already existed and produced the
correct Banguat format (`Q 1,234.56` with NBSP). Closed the item by
verifying the existing 11 Money tests pin the format, rather than
shipping a duplicate. **An earlier draft of `_DATAVIZ_BEST_PRACTICES.md`
§3 claimed "no space" — corrected mid-phase to match CLDR locale data
and Banguat's own writing.**

### 2.5 AI improvement-action generator deferred → rule-based (B10)

Plan's B10 risk note called out the AI-generation path as the
expensive route. Shipped a rule-based fallback (6 per-factor rules
that compose Spanish copy from the breakdown's `inputs` map) as
the honest MVP path. **Reasoning:** rule-based is testable, has
zero per-recompute cost, and produces grammatically correct Spanish
in the user's tú-register every time. AI generation lands when the
rule library can't say something useful — not before.

### 2.6 Webpack chosen over Turbopack (mid-phase)

Triggered by an AsyncLocalStorage bug during the emergency demo
prep. Initial theory was Turbopack module-dual-loading; user
switched to webpack and the bug persisted. Real cause was ALS
context loss between `storage.run()` and Prisma extension
`getStore()` calls — fixed with a globalThis-cached storage + a
dev-only `__ifaTenantCtx` fall-open in `tenancy.ts`
(`61b20ef`). User kept webpack since Turbopack isn't proven more
stable than webpack for this app's shape; revisit if/when
Turbopack documents the ALS contract explicitly.

## 3. Technical decisions worth remembering

These weren't plan deviations — they're judgment calls inside the
batch boundaries that the next phase should inherit.

### 3.1 Job queue: Postgres > Redis for MVP

`PendingJob` table + `FOR UPDATE SKIP LOCKED` (B4). Per-worker
`claim()` with attempts/backoff/dead-letter. Trades latency
(Redis-grade sub-ms) for **one less infrastructure component to
operate**. Works fine until per-job throughput goes north of a few
hundred per minute — then revisit.

### 3.2 Tenant isolation: AsyncLocalStorage + Prisma extension

The model that survived: `withTenant({ profileId, userId }, () => ...)`
is the only legal way to read/write a TENANT_SCOPED_MODELS row.
The extension fail-closes on missing context (Profile, ProfileMember,
PendingJob are explicit allowlist exceptions). **Three escape
hatches exist on purpose:**

- `prismaUnscoped` for bootstrap (first-sign-in profile creation,
  job queue, admin routes). Restricted by ESLint to `src/lib/db/**`,
  `src/lib/jobs/**`, and `src/app/api/admin/**`. The B15 cron stays
  out of this list on purpose — it goes through `profileRepo` and
  `recomputeHealthScore`, which themselves own the unscoped access.
- Profile not being itself tenant-scoped — required to break the
  chicken-and-egg at sign-in.
- The dev-only `__ifaTenantCtx` fall-open from §2.6 — gated on
  `NODE_ENV !== 'production'`.

### 3.3 GT timezone month boundary

Most of the codebase pretends UTC = GT for date math (GT is
UTC−6 year-round, no DST). That's correct except in the 6h window
before midnight UTC at month edges. The dashboard is the one place
that matters: at 11pm GT on Dec 31, "this month" must read December,
not the empty-bucket January UTC has already entered. `currentMonthInGuatemala()`
(B14) does it right via `Intl.DateTimeFormat`. **If Phase 8 adds
another date-sensitive widget, it MUST use this helper, not raw
`getUTCMonth()`.**

### 3.4 Throttle: API gates, cron bypasses, cron stamps

The 1×/hour recompute throttle (B11) lives at the API route, not
in `recomputeHealthScore()`. The nightly cron (B15) calls the
engine directly (no throttle check) **and then stamps
`Profile.lastHealthScoreRecomputeAt`** so user-pressed "Recalcular"
requests inside the next hour 429-out. The score stays fresh
overnight and we don't burn AI tokens to recompute what's already
fresh.

### 3.5 Anomaly detection: per-merchant z-score with thresholds

Two methods: `new_merchant` (history ≤ 1) and `merchant_zscore`
(history ≥ 10, |zScore| > 3 strict). 2–9 history returns null —
sample's too small to call. Flat history (stdDev = 0) also
returns null — z-score would be undefined and the badge would
fire spuriously on every same-amount recurring charge. **Strict
`> 3` test fixtures use stdDev=1 inputs** because floating-point
makes `3 * Math.sqrt(15)` evaluate to `z=3.0000000000000004`.

### 3.6 Sub-score → tier-band scaling (B13)

Factor sub-scores are [0,100]. Overall score is [0,1000]. To keep
color semantics consistent (a factor scoring 45/100 should be the
same red as overall 450/1000), `factor-bars.tsx` does
`tierColor(scoreTier(subscore × 10))`. **This convention should
extend to any future factor surface** (gamification badges,
spotlight cards, AI improvement-action chips).

## 4. Carried-forward debt

These were knowingly punted. Listed so they don't get rediscovered
as "bugs":

| Item                                                             | Where                                                        | Trigger to address                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| AI improvement-action generator                                  | Plan B10 risk note; rule-based fallback in `improvements.ts` | When rules can't compose useful copy for an observed factor configuration (no current evidence; revisit when score-history data lands) |
| Sankey chart                                                     | §2.3 above                                                   | BUSINESS tier ships, account-to-account flows become first-class                                                                       |
| Railway cron migration                                           | `cron-runner.ts` header                                      | Vercel /api/cron/health-score hits the 60s ceiling (~500 active profiles at ~100ms each)                                               |
| Demo kit semicircle gauge                                        | `demo/` (frozen kit)                                         | Next demo-kit refresh — flagged in B12 commit message                                                                                  |
| Multi-format ingestion (PDF, XLS, OFX, QIF)                      | EmptyDashboard CTA copy                                      | "Immediately-after-MVP follow-up" per Holy Grail memory                                                                                |
| Bank API connection                                              | Engineered for "overnight swap-readiness"                    | Former-bank-VP opens a door (project_bank_connection_strategy memory)                                                                  |
| pg_trgm GIN index for `Transaction.description` full-text search | `transactionRepo.list` comment                               | When table size makes the current ILIKE query degrade observably                                                                       |
| Periodic reaper for jobs stuck in RUNNING after worker crash     | `/api/cron/jobs` markFailed-fails branch                     | Production traffic; not material at MVP scale                                                                                          |
| BUSINESS-tier accounting/FEL reports                             | Plan §0 locked decision                                      | Phase 5 (Accounting) ships                                                                                                             |
| `react-hooks/incompatible-library` warning on TanStack Virtual   | `feed.tsx:172`                                               | TanStack ships a memoization-safe API                                                                                                  |

## 5. What worked well (repeat these)

- **One batch = one commit = one acceptance-item-checklist update.**
  Recoverable from `git log -p docs_operations/_PHASE_6_7_PLAN.md`
  alone. Cold context can pick up any batch.
- **Per-batch gate sweep ritual** (lint / typecheck / prettier /
  vitest / playwright chromium / next build, ALL green before
  proposing commit text) caught every issue before push.
- **Plan-deltas land in their own commit** (`cf39496`) when they
  precede the implementing batch — keeps the implementation
  commits clean.
- **Test counts grew with feature work, not separately** (+297
  unit tests over the phase). No "test-coverage catch-up" batches.
- **Research before swap.** The bullet/bars/Sankey decisions all
  cited primary sources (NN/g, Few, Tufte, Correll et al.) BEFORE
  swapping; the swaps stuck because the rationale was durable.
- **Honest fallbacks over flaky AI.** Rule-based improvement
  actions, deterministic recompute, single-source-of-truth
  throttle. AI is one path among several — never the only path.

## 6. What didn't work well (avoid these)

- **Demo prep ran past its time-box.** The 15-minute emergency
  demo turned into a multi-hour ALS debugging session. Frozen
  under `demo/` and out of the source tree, but the cost was
  real. Next time: if a demo needs the production tree to be in
  a non-production state, do it on a throwaway branch.
- **Incorrect doc claims surfaced in the moment.** The "no space"
  currency-format error in `_DATAVIZ_BEST_PRACTICES.md` §3 made
  it into a draft. Caught and corrected mid-phase, but the
  lesson is: cite primary sources (Banguat, CLDR) in the doc
  itself so the next reader can audit, don't paraphrase.
- **Commit subjects bear watching.** B13's commit went out with
  B12's subject template still in the title (`[P67-B12]` on a
  B13 diff). Caught + amended + force-pushed (`70adb64` →
  `c71e653`). The body had the right `Batch N closed, X/101`
  footer, which is what saved it.
- **Recharts ResponsiveContainer in jsdom returns width 0**, so
  in-DOM assertions on the rendered SVG silently pass-through
  with no chart mounted. The fix in B13 was to extract a pure
  helper (`buildFactorBarRows`) and test that. **Convention for
  Phase 8:** anything that goes through `ResponsiveContainer`
  needs its testable logic in a sibling pure function.

## 7. Open questions / handoff items

None blocking. The plan opened with "no open questions" and
closed the same way.

For Phase 8 planning: the data is now there to inform decisions
that were speculative in Phase 6/7. Specifically — once a few
weeks of `HealthScore` rows accumulate, the factor weights (B9's
`FACTOR_WEIGHTS`) can be re-tuned against observed score
distributions; if everyone scores 700+ we're undermeasuring, if
everyone scores below 400 we're punishing too hard.

## 8. Post-closure revisions

Decisions that landed after the phase officially closed
(2026-05-21) but that change shipped Phase 6/7 behavior.
Numbered with the ADR they reference.

- **ADR-001** ([\_DECISIONS.md](./_DECISIONS.md), 2026-05-22):
  Removed B4's every-minute `/api/cron/jobs` Vercel Cron entry.
  Job-queue drain becomes user-triggered via a "Procesar ahora"
  button (post-import CTA + `/transacciones` contextual banner).
  Reason: >99% of cron firings would do zero productive work at
  MVP traffic shape; Vercel free tier blocks sub-daily crons
  anyway. Endpoint stays as a manual ops drain. See ADR-001 for
  the full reasoning + the JSONB-filtered claim variant
  (`jobQueue.claimForProfile`).
- **ADR-002** ([\_DECISIONS.md](./_DECISIONS.md), 2026-05-22):
  Removed B15's daily `/api/cron/health-score` Vercel Cron entry
  too. Score auto-recomputes on dashboard visit when the cached
  score is >24h stale AND the 1×/hour throttle has cleared.
  `vercel.json`'s `crons` array is now removed entirely — the
  codebase is Vercel-Cron-free. Owner's stated risk tolerance for
  Vercel Cron reliability on free tier was zero. New helper module:
  [staleness.ts](../src/lib/intelligence/health-score/staleness.ts).
