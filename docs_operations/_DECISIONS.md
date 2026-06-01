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

---

## ADR-002 — No Vercel Cron at all; Health Score auto-recomputes on dashboard visit when stale

**Date:** 2026-05-22
**Status:** Adopted, replacing the `/api/cron/health-score` daily Vercel
Cron entry that shipped in
[Phase 6/7 Batch 15](./_PHASE_6_7_PLAN.md#batch-15--nightly-cron-stub-railway-ready)
(`f9eb7d6`, 2026-05-21).

### Context

B15 shipped a daily `0 8 * * *` Vercel Cron firing
`GET /api/cron/health-score` to recompute every active profile's
Health Score overnight. The design rationale was "user opens
dashboard in the morning, sees a fresh score".

The owner has had Vercel Cron fail reliably across previous
projects. On free tier specifically:

- No SLA — best-effort scheduling, no retry on failure
- ~hours of log retention (failures age out before discovery)
- Cron can be silently disabled if the project hits any usage limit
- `CRON_SECRET` was never set in this project, so all cron
  invocations would have 401'd anyway (separate finding from
  ADR-001 prep)

ADR-001 already removed the `/api/cron/jobs` schedule. This ADR
removes the second and final cron entry, eliminating Vercel Cron
as a dependency entirely.

### Decision

Remove the `/api/cron/health-score` cron entry from `vercel.json`.
Replace its UX guarantee ("fresh score on first dashboard view of
the day") with **synchronous auto-recompute inside the dashboard
server components when the latest score is stale**.

Concretely, both `/dashboard` (B14 widget) and `/dashboard/salud`
(B13 detail page) check on every render:

```
if (latest score exists
    AND latest.computedAt is older than STALENESS_THRESHOLD_MS (24h)
    AND throttleRemainingMs(profile.lastHealthScoreRecomputeAt) === 0):
  await recomputeHealthScore({ profileId, period: 'DAILY' })
  stamp profile.lastHealthScoreRecomputeAt = now
  re-read latest score for this render
```

The recompute is synchronous (awaited) so the page renders with the
fresh score in the same response. Cost: 100–300ms added to the
first dashboard load per ~24h cycle, invisible to the user (they're
parsing the page anyway). Subsequent loads within the cycle hit
the throttle short-circuit and use the cached row.

### Reasoning

- **No external scheduler = no external failure surface.** The score
  freshness contract is enforced by the same request path that
  renders the data. If the page renders, the score is fresh (or
  the throttle prevented a recompute, which is itself fresh-by-
  definition).
- **Owner's risk tolerance for Vercel Cron is zero.** Stated
  explicitly: "If it fails at least once, we are out definitely."
  Per "production-first" + "don't assume", we cannot promise
  Vercel Cron will fire reliably on free tier. The honest move is
  to not depend on it.
- **The throttle already exists** (B11's
  `Profile.lastHealthScoreRecomputeAt` + 1×/hour window). Auto-
  recompute reuses it for free — no new state, no new abstractions.
- **The empty-state behavior stays.** A user with NO score yet
  still sees the "Calcula tu primer puntaje" CTA from B13. Auto-
  recompute only fires when a `latest` row already exists. First
  recompute remains user-triggered (explicit consent to spend
  AI tokens on a fresh-cold compute).
- **Symmetric with ADR-001.** Both crons removed; both endpoints
  kept as manual ops drains; both surfaces become user-triggered.
  The codebase is now Vercel-Cron-free.

### What stays in place

- **`/api/cron/health-score/route.ts`** stays as a manual ops drain
  (curl-able with `CRON_SECRET`). 4 unit + 9 e2e tests untouched.
  Same shape as `/api/cron/jobs` after ADR-001.
- **`cron-runner.ts` + `runHealthScoreCron`** stay — they're the
  implementation the manual drain calls. Per-profile isolation +
  Railway-migration header remain valid; just no longer fired by
  Vercel Cron.
- **B11's recompute API + throttle** unchanged.
- **B13's "Calcular ahora" button** unchanged — explicit refresh
  still works.

### Consequences

- New helper `src/lib/intelligence/health-score/staleness.ts`:
  `isStale(score, now)`, `canAutoRecompute(lastRecomputeAt, now)`,
  `maybeRecomputeStale(...)`. All pure where possible.
- `/dashboard/salud` server component adds one branch: if stale +
  throttle allows, await recompute then re-read latest.
- `/dashboard` server component does the same so the widget
  surfaces fresh data without requiring the user to navigate to
  the detail page first.
- `vercel.json` now has `"crons": []` (or the key removed
  entirely). No scheduled invocations at all.
- The 1×/hour throttle becomes the upper bound on auto-recompute
  cost: at most 24 recomputes per profile per day even if 24
  different users hit the dashboard at 24 different hours.
  Realistic upper bound at MVP scale: ~1 recompute per active
  user per day.

### Reversal trigger

If we ever need scheduled work that CANNOT be lazily triggered
(e.g., emailed digests with "your weekly score" — the user must
not need to log in for the email to send), reintroduce a
scheduler at that point. The two candidates would be:

1. **External scheduler hitting the existing HTTP endpoint**
   (Railway cron, GitHub Actions, EasyCron, etc.) — same
   endpoint, same auth, just not Vercel Cron.
2. **Reintroduce Vercel Cron** only if the project has moved to
   Pro and the owner re-evaluates risk tolerance.

This ADR does not preclude either path. It just removes Vercel
Cron from the MVP critical path.

---

## ADR-003 — Bank-grade security posture: tightest available, never "good enough for MVP"

**Date:** 2026-06-01
**Status:** Adopted. Applies to every security-shaped decision in
the codebase, retroactive and forward.

### Context

Surfaced at the start of L3.4 (email-change re-auth). When the
implementation choice between "Supabase default flow" and
"magic-link re-auth on current email before any change" came up,
the founder's response was unambiguous:

> "This app handles people's and businesses' BANKING INFO!
> It needs to be AT LEAST AS SECURE AS A BANK!!! TIGHTEST
> SECURITY IS A MUST!!!!!!!!!!"

(Verbatim, 2026-06-01.)

This isn't a one-off scoping decision for one sub-batch. IFA
stores users' personal + business banking history; the threat
model is "would a Guatemalan bank's CISO sign off on this?"
A breach would be reputation-ending; the cost of "extra friction"
is rounding-error compared to the cost of a security incident.

### Decision

On every security-shaped decision in IFA's codebase, the default
is the **tightest available primitive**, not the smallest-MVP
scope. This applies to:

- Auth flows (sign-in, sign-out, session refresh)
- Re-auth gates on sensitive mutations (email change, password
  change, account deletion, payment-method change, data export)
- Session lifetimes + idle-timeout
- Use of platform-native primitives (Supabase MFA / nonce /
  re-auth, Stripe Radar, etc.) instead of rolled-our-own
- Rate limiting on auth + sensitive routes
- Audit logging for state-changing security operations
- Route gating (server-side, not client-side)
- CSRF / XSS / clickjacking hardening
- Secret handling (env-var only, never logged, never echoed)

### How this applies to L3.4 specifically

Email change uses a **two-step nonce flow** anchored on Supabase's
`auth.reauthenticate()` primitive:

1. User opens email-change form, types the new email.
2. Server action sends a 6-digit nonce to the user's **current**
   email via `supabase.auth.reauthenticate()`. (Mitigation:
   proves the request originator has access to the CURRENT inbox,
   not just the active session.)
3. User enters the code in the form within ~15 min.
4. Server action calls `supabase.auth.updateUser({email, nonce})`.
   Supabase verifies the nonce and triggers its own confirmation-
   link flow to the NEW email.
5. New email becomes active after the user clicks the new-email
   confirmation link. The old email also receives a notification
   from Supabase (defense in depth).

Three independent factors must succeed: session cookie + current-
email access + new-email access. Stealing one isn't enough.

### How this applies going forward

Any future sub-batch with a security-shaped choice (L3.5 password
flow, L3.6 data export, L3.7 account deletion, L4.x email-link
security, L5.x Stripe webhook idempotency / signature checks, all
of L6/L7) MUST:

- Pick the tightest primitive available.
- Document the chosen primitive + the threat model it mitigates
  in a file-level docblock.
- Reference this ADR.
- If a "good enough for MVP" path is available AND the user
  explicitly chooses it via AskUserQuestion, document the
  deviation as a per-sub-batch carve-out (NOT a general loosening
  of this ADR).

### Reversal trigger

If the user ever explicitly says "loosen security here for X
reason," that's a per-decision carve-out documented in the
relevant sub-batch — NOT a reversal of this ADR. To reverse this
ADR globally would require explicit founder direction and an
ADR-NNN supersession entry. Default until then: tightest.

### Related

- Memory: `feedback_security_posture.md` — captures the verbatim
  rule + how to apply for future Claude sessions.
- `_THE_RULES.MD` — the constitution this ADR enforces in the
  security domain (production-first, enterprise-grade, no
  corners cut).
