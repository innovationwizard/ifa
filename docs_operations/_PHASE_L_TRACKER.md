# Phase L — Live progress tracker

> **THIS DOC IS THE SOURCE OF TRUTH FOR PHASE L EXECUTION STATE.**
> Conversations compact. Context windows roll. This file does not.
>
> **If you're a fresh Claude picking up cold:** read §0 first.
> **If you're the founder checking status:** §1 is the quick-resume header.

---

## §0 — Compaction-survival protocol (read this first if cold)

You are picking up Phase L work from cold context. Do these steps in order:

1. **Read the spec.** [\_PHASE_L_PLAN.md](./_PHASE_L_PLAN.md) is the
   what + why for each batch. Don't skip — it has 10 locked decisions
   you must obey.
2. **Read the ADRs.** [\_DECISIONS.md](./_DECISIONS.md) — ADR-001
   (no jobs cron) and ADR-002 (no Vercel Cron at all). Decisions
   already made; do not re-litigate.
3. **Read §1 of THIS doc.** The "Current focus" block tells you
   which batch + sub-batch is in flight, what was last committed,
   what files are mid-edit, what blockers exist.
4. **Read the in-flight files** if §1 lists any. They reflect the
   actual state of the work, not what the conversation said.
5. **Verify nothing was lost.** Run `git status` + `git diff` to see
   any uncommitted edits. Compare against §1's "Files in flight" —
   they should match. If they don't, surface to the user before
   proceeding.
6. **Verify the last gate sweep.** Run `pnpm typecheck && pnpm lint`
   to confirm the codebase is in a clean state (or, if mid-sub-batch,
   to confirm the staged work doesn't regress).
7. **Continue from the next concrete action** listed in §1. Update
   §1 as you go. Update the status checkboxes in §3 as sub-batches
   close. Never batch up status updates — update on each sub-batch
   completion.

**The non-negotiables:**

- Every code-affecting sub-batch ends with a gate sweep
  (lint/typecheck/prettier/vitest/build/playwright) and a commit
  message proposal in chat to the founder. The founder runs the
  commit + push.
- After the founder reports a push, update §1 + the relevant
  status checkbox in §3 + the §5 history log in the same turn.
- If a sub-batch is too big to commit atomically, split it.
- Never erase progress. If a sub-batch turns out wrong, ADD a
  "L?.?-revised" entry instead of deleting the old one.

---

## §1 — Current focus

> **The only block in this file that changes between sub-batches.**
> Keep it terse and concrete.

- **Active batch:** L1 — Universal AI-assisted ingestion engine
- **Active sub-batch:** L1.8 — DONE locally, awaiting founder commit + push
- **Last commit relevant to Phase L:** `cf90104` (L1.7.5 route tests)
- **Next concrete action:** Founder commits L1.8 (editable mapping in `csv-import-wizard.tsx` + 2 new i18n keys). After push, this doc advances to L1.9 (wire the wizard to the L1.7 `/api/v1/imports/parse` endpoint — replaces the in-wizard `detectColumns(headers)` call with a `fetch` to the new server route, surfaces orchestrator confidence + AI-extracted mapping).
- **Blockers:** §6.1 still open. L1.9 unblocked (server-call wiring).
- **Files in flight (uncommitted edits):** `src/components/imports/csv-import-wizard.tsx` (modified) + `src/messages/es-GT.json` (2 new keys: `imports.preview.missingFields`, `imports.preview.mapLabel`)

---

## §2 — Sub-batch granularity policy

- **Detailed sub-batches** are listed for L1 + L2 (about to start).
- **Outline sub-batches** are listed for L3–L7 (refine when each
  batch starts; lock in detail at that point, update this doc).
- **Each sub-batch is commit-sized** — one focused change, one
  commit, one update to this tracker.
- **Sub-batch IDs are stable.** Once assigned, never reuse. If a
  sub-batch is dropped, mark it `~~L?.?~~ (dropped — reason)`.
  If revised, add a new `L?.?-rev` entry.

---

## §3 — Sub-batch status

### Batch L1 — Universal AI-assisted ingestion engine (12 sub-batches)

> See [\_PHASE_L_PLAN.md §2 L1](./_PHASE_L_PLAN.md#batch-l1--universal-ai-assisted-ingestion-engine-csv--ai-extractor--confidence--user-confirm)
> for goal/architecture/acceptance.

- [x] **L1.1** — `src/lib/ingestion/types.ts`: `ExtractorResult`, `ColumnMapping`, `ColumnConfidence`, `ExtractorTrace` types · `0ce0925` · 2026-05-22
- [x] **L1.2** — `src/lib/ingestion/heuristic-detect.ts`: wraps existing `src/lib/imports/column-detect.ts`, adds explicit confidence score · `39d9f94` · 2026-05-22
- [x] **L1.2.5** — `src/lib/ingestion/projection.ts`: extract the shared `projectCsvSample(rows, mapping) → ExtractedRow[]` helper so L1.3's ai-detect doesn't duplicate it. Refactor heuristic-detect to import from the shared module. _(Inserted between L1.2 and L1.3 when L1.3 surfaced the duplication.)_ · `aa3ea88` · 2026-05-22
- [x] **L1.3** — `src/lib/ingestion/ai-detect.ts`: Claude Haiku call w/ cached system prompt + Zod-validated response · `4f6f518` · 2026-05-22
- [x] **L1.4** — `src/lib/ingestion/extractor.ts`: orchestrator (heuristic → AI fallback when confidence < threshold) · `236d9f1` · 2026-05-22
- [x] **L1.5** — `src/lib/ingestion/ai-detect.test.ts`: 6+ tests (happy, malformed JSON, low-confidence return, refusal, schema-violation, prompt-cache breakpoint check) — shipped 10 tests · `b210340` · 2026-05-22
- [x] **L1.6** — `src/lib/ingestion/extractor.test.ts`: 4+ tests (heuristic-confident path, AI-fallback path, AI-fails-fallback, empty-sample defensive) — shipped 7 tests · `b9e26fa` · 2026-05-22
- [x] **L1.6.5** — `src/lib/ingestion/heuristic-detect.test.ts`: pin `SIGNATURE_PER_COLUMN_CONFIDENCE` + `GENERIC_PER_COLUMN_CONFIDENCE` constants; signature-match → conf 1.0 (BAC, `BANCO_INDUSTRIAL`); generic keyword → conf 0.7; all-ignore headers → outcome 'fallback'; sample projection. _(Inserted because L1.6 mocks the heuristic entirely and therefore does not pin its behavior, contradicting heuristic-detect.ts's own comment promising L1.6 coverage.)_ · `04a530f` · 2026-05-22
- [x] **L1.7** — `src/app/api/v1/imports/parse/route.ts`: server endpoint accepting sample → returning ExtractorResult · `d9d29ac` · 2026-05-22
- [x] **L1.7.5** — `src/app/api/v1/imports/parse/route.test.ts`: auth gating (401 anon, 400 `no_profile`), Zod validation (400 malformed payload, 400 invalid JSON), happy path (200 with orchestrator result, mocked `extractFromCsv`). _(Inserted because the original L1 list jumped from L1.7 to L1.8 without route-test coverage; auth + payload regressions are the kind of thing that should not ship to prod without a unit test.)_ · `cf90104` · 2026-05-22
- [ ] **L1.8** — `src/components/imports/csv-import-wizard.tsx`: add "Confirma el mapeo" step + editable per-column dropdowns
- [ ] **L1.9** — wire wizard to L1.7 endpoint (replace the in-wizard heuristic with a server call)
- [ ] **L1.10** — `src/messages/es-GT.json`: `imports.mapping.*` block (Spanish copy for confirm step)
- [ ] **L1.11** — `tests/e2e/imports-mapping.spec.ts`: e2e spec for the low-confidence path (mock-bank CSV → confirm step renders)
- [ ] **L1.12** — Gate sweep + tracker update (mark L1 done in §3 + §5 + §1) + commit message proposal

**L1 dependencies:** B2 (Anthropic SDK wrapper) ✓, B5 (transactionRepo import path) ✓, existing csv-import-wizard ✓ — all from Phase 6/7.

### Batch L2 — PDF ingestion via the L1 pipeline (11 sub-batches)

> See [\_PHASE_L_PLAN.md §2 L2](./_PHASE_L_PLAN.md#batch-l2--pdf-ingestion-via-the-l1-pipeline).

- [ ] **L2.1** — Choose PDF lib (pdf-parse vs pdfjs-dist) + add dep; document choice in a comment
- [ ] **L2.2** — `src/lib/ingestion/pdf-extract.ts`: pure server-side PDF buffer → text rows transformation
- [ ] **L2.3** — `src/lib/ingestion/ai-detect.ts` (extend): add "prose-mode" system prompt for free-text → structured rows (cached separately from CSV mode)
- [ ] **L2.4** — `src/lib/ingestion/extractor.ts` (extend): add `extractFromPdf(buffer)` entry that chains pdf-extract → ai-detect prose-mode
- [ ] **L2.5** — `src/components/imports/csv-import-wizard.tsx` (extend): widen `<input accept>` to include `.pdf`, branch parse step on MIME type
- [ ] **L2.6** — `src/app/api/v1/imports/parse-pdf/route.ts`: server endpoint accepting PDF upload → returning ExtractorResult. 5s hard timeout.
- [ ] **L2.7** — `src/messages/es-GT.json`: `imports.pdfHelp.*` block (incl. "guardar como PDF" guidance for printable web pages)
- [ ] **L2.8** — `src/lib/ingestion/pdf-extract.test.ts` + extend extractor tests for PDF input path
- [ ] **L2.9** — **Founder action:** collect 2–3 anonymized real PDF samples from beta users; add to `tests/fixtures/pdf-statements/` with a README naming the bank for each
- [ ] **L2.10** — `tests/e2e/imports-pdf.spec.ts`: e2e spec uploading a fixture PDF → confirm step → commit
- [ ] **L2.11** — Gate sweep + tracker update + commit

**L2 dependencies:** L1 done; L2.9 needs founder samples before L2.8/L2.10 can be honest.

### Batch L3 — Settings — account hygiene (12 sub-batches, OUTLINE — refine on entry)

> See [\_PHASE_L_PLAN.md §2 L3](./_PHASE_L_PLAN.md#batch-l3--settings-page-account-hygiene).

- [ ] **L3.1** — Schema: add `Profile.deletedAt` + `ProfileMember.deletedAt` if not already there; `pnpm db:push`
- [ ] **L3.2** — `src/app/(app)/configuracion/page.tsx`: shell with 4 sections
- [ ] **L3.3** — `src/components/settings/profile-card.tsx` + `updateProfile` action
- [ ] **L3.4** — `src/components/settings/account-card.tsx`: email change flow (re-auth required)
- [ ] **L3.5** — `src/components/settings/account-card.tsx`: password reset trigger (Supabase default for L3; L4 may brand)
- [ ] **L3.6** — `src/components/settings/data-card.tsx` + `exportData` action (ZIP: transactions.csv + health_scores.csv + profile.json)
- [ ] **L3.7** — `src/components/settings/delete-card.tsx` + `softDelete` action (type-email-to-confirm)
- [ ] **L3.8** — `src/lib/db/repositories/profile.ts` (extend): `softDelete(profileId)` + `deletedAt: null` filter on `findById` etc.
- [ ] **L3.9** — `src/messages/es-GT.json`: `settings.*` block
- [ ] **L3.10** — Unit tests for each server action
- [ ] **L3.11** — e2e: auth-redirect spec for `/configuracion` + happy-path for data-export
- [ ] **L3.12** — Gate sweep + tracker update + commit

**L3 dependencies:** L4 makes email flows branded (L3 ships with Supabase defaults; L4 swaps).

### Batch L4 — Transactional email infrastructure (12 sub-batches, OUTLINE)

> See [\_PHASE_L_PLAN.md §2 L4](./_PHASE_L_PLAN.md#batch-l4--transactional-email-infrastructure-resend).

- [ ] **L4.1** — `package.json`: add `resend` dep
- [ ] **L4.2** — `.env.example` + `vercel-setup.md`: `RESEND_API_KEY` row
- [ ] **L4.3** — `src/lib/env.ts`: validate `RESEND_API_KEY` (required in prod, optional in dev)
- [ ] **L4.4** — `src/lib/email/client.ts`: singleton Resend client
- [ ] **L4.5** — `src/lib/email/send.ts`: `sendEmail({to, template, props})` with retry + telemetry
- [ ] **L4.6** — `src/lib/email/templates/welcome.tsx` (or .ts)
- [ ] **L4.7** — `src/lib/email/templates/email-change-confirmation.ts`
- [ ] **L4.8** — `src/lib/email/templates/password-reset.ts` (decide: shim Supabase vs full custom — default Supabase default for MVP)
- [ ] **L4.9** — `src/lib/email/templates/billing-receipt.ts` (L5 will trigger)
- [ ] **L4.10** — `src/lib/email/templates/billing-dunning.ts` (L5 will trigger)
- [ ] **L4.11** — Wire-ups: welcome on onboarding completion + email-change confirmation in L3 actions
- [ ] **L4.12** — Tests + gate sweep + tracker update + commit

**L4 dependencies:** none blocking; integrates with L3 + L5.

### Batch L5 — Stripe live: trial → paid $1/mo (14 sub-batches, OUTLINE)

> See [\_PHASE_L_PLAN.md §2 L5](./_PHASE_L_PLAN.md#batch-l5--stripe-live-trial--paid-1mo-collection).

- [ ] **L5.1** — `src/lib/billing/stripe.ts`: singleton Stripe client (lazy env read)
- [ ] **L5.2** — `prisma/schema.prisma`: new `StripeEventLog` mini-table for webhook idempotency (decide vs piggybacking PendingJob)
- [ ] **L5.3** — `src/app/api/stripe/webhook/route.ts`: signature verification scaffolding
- [ ] **L5.4** — Webhook handler: `checkout.session.completed`
- [ ] **L5.5** — Webhook handler: `customer.subscription.updated/deleted`
- [ ] **L5.6** — Webhook handler: `invoice.payment_failed/succeeded` → L4 receipt/dunning
- [ ] **L5.7** — `src/app/api/billing/checkout/route.ts`: POST creates Checkout Session
- [ ] **L5.8** — `src/app/api/billing/portal/route.ts`: POST creates customer-portal session
- [ ] **L5.9** — `src/app/(app)/configuracion/facturacion/page.tsx`: billing settings section
- [ ] **L5.10** — `src/components/billing/paywall.tsx`: soft + hard gate UI
- [ ] **L5.11** — `src/app/(app)/layout.tsx` (extend): compute `gateState` per request, render banner or redirect
- [ ] **L5.12** — Unit tests for each webhook handler
- [ ] **L5.13** — e2e: anonymous → /precios renders; authed PAST_DUE → soft-gate banner
- [ ] **L5.14** — Gate sweep + tracker update + commit

**L5 dependencies:** L4 (receipt + dunning emails); L3 (`/configuracion` parent shell).

### Batch L6 — Pre-launch polish (7 sub-batches, OUTLINE)

> See [\_PHASE_L_PLAN.md §2 L6](./_PHASE_L_PLAN.md#batch-l6--pre-launch-polish-privacy-terms-support-walkthrough).

- [ ] **L6.1** — Audit `src/app/privacidad/page.tsx`: add Stripe + Resend + Anthropic as data processors
- [ ] **L6.2** — Audit `src/app/terminos/page.tsx`: add deletion + export rights
- [ ] **L6.3** — `src/app/(public)/contacto/page.tsx`: support mailto + response expectations
- [ ] **L6.4** — Feedback link wiring from "tu banco no funcionó" path (L1/L2 extension)
- [ ] **L6.5** — Footer updates: add `/contacto`
- [ ] **L6.6** — **Founder action:** fresh-user walkthrough; capture every blocker as a sub-task here; address each
- [ ] **L6.7** — Gate sweep + tracker update + commit

**L6 dependencies:** L3 + L4 + L5 (so policies honestly describe what we do).

### Batch L7 — Launch checklist (10 sub-batches, OUTLINE)

> See [\_PHASE_L_PLAN.md §2 L7](./_PHASE_L_PLAN.md#batch-l7--launch-checklist).

- [ ] **L7.1** — `docs_operations/_LAUNCH_CHECKLIST.md`: scaffolding
- [ ] **L7.2** — `src/app/sitemap.ts` + `robots.ts` (SEO hygiene; defensive disallow on `/api/*` etc.)
- [ ] **L7.3** — **Founder action:** Stripe LIVE-mode verification ceremony (real card, $1 charge)
- [ ] **L7.4** — **Founder action:** Resend domain DNS verification (SPF + DKIM)
- [ ] **L7.5** — **Founder action:** Supabase prod backup verified < 24h
- [ ] **L7.6** — **Founder action:** end-to-end smoke test from fresh browser
- [ ] **L7.7** — Domain decision recording (vercel.app subdomain vs custom)
- [ ] **L7.8** — Open-signup confirmation (per ADR or pinned in batch notes)
- [ ] **L7.9** — Sentry decision: minimal wire OR document "deferred" with reason
- [ ] **L7.10** — Final go/no-go ceremony + tracker close + commit

**L7 dependencies:** all prior L batches.

---

## §4 — Totals

| Batch     | Sub-batches | Acceptance items (from plan) |
| --------- | ----------- | ---------------------------- |
| L1        | 12          | 8                            |
| L2        | 11          | 7                            |
| L3        | 12          | 8                            |
| L4        | 12          | 7                            |
| L5        | 14          | 8                            |
| L6        | 7           | 6                            |
| L7        | 10          | 7                            |
| **Total** | **78**      | **51**                       |

Sub-batches are commit-units. Acceptance items are user-visible
done-criteria. They do not map 1:1 — one sub-batch may satisfy
multiple acceptance items, or several sub-batches may be needed
to satisfy one acceptance item.

---

## §5 — History log (append-only)

Each entry is one line: `YYYY-MM-DD HH:MM — L?.? closed — <sha> — <one-line summary>`.
Newest at top. Never delete; append only.

- 2026-05-22 — L1.7.5 closed — `cf90104` — parse route tests (`src/app/api/v1/imports/parse/route.test.ts`); 8 mocked-orchestrator tests pinning auth gating, payload validation (all failure paths verify extractMock NOT called), happy path verbatim forwarding
- 2026-05-22 — L1.7 closed — `d9d29ac` — parse route (`src/app/api/v1/imports/parse/route.ts`); POST `{headers, sampleRows}` → ExtractorResult; auth-gated 401/400; Zod-validated payload; calls extractFromCsv; no commit (mapping-only)
- 2026-05-22 — L1.6.5 closed — `04a530f` — heuristic-detect tests (`src/lib/ingestion/heuristic-detect.test.ts`); 9 tests pinning constants (1.0 + 0.7), BAC + BANCO_INDUSTRIAL signatures, generic fallback, defensive paths, sample projection
- 2026-05-22 — L1.6 closed — `b9e26fa` — extractor orchestrator tests (`src/lib/ingestion/extractor.test.ts`); 7 mocked-step tests pinning heuristic-confident skip, AI-fallback escalation, trace merge, failed-AI propagation, threshold boundary at 0.9
- 2026-05-22 — L1.5 closed — `b210340` — ai-detect tests (`src/lib/ingestion/ai-detect.test.ts`); 10 mocked-Claude tests pinning the three locked guarantees (never-throws, sample-from-caller, hallucinated-header-filter) + request shape + cap
- 2026-05-22 — L1.4 closed — `236d9f1` — extractor orchestrator (`src/lib/ingestion/extractor.ts`); `extractFromCsv` single entry point; `HEURISTIC_CONFIDENCE_THRESHOLD = 0.9`; heuristic-first w/ AI fallback when below threshold; trace merge
- 2026-05-22 — L1.3 closed — `4f6f518` — Claude Haiku CSV column extractor (`src/lib/ingestion/ai-detect.ts`); tú-register Spanish system prompt w/ `cache_control: ephemeral`; Zod-validated response w/ defensive failure (never throws); hallucinated-header filter; cost telemetry in trace
- 2026-05-22 — L1.2.5 closed — `aa3ea88` — extract `projectCsvSample` shared helper (`src/lib/ingestion/projection.ts`); refactor heuristic-detect to import; pre-emptive de-dup before L1.3's ai-detect would have duplicated
- 2026-05-22 — L1.2 closed — `39d9f94` — heuristic-detect wrapper (`src/lib/ingestion/heuristic-detect.ts`); adapts legacy `detectColumns` → `ExtractorResult`; per-column confidence (signature=1.0, generic=0.7); sample projection from `Record<header,cell>[]` → `ExtractedRow[]`; trace step
- 2026-05-22 — L1.1 closed — `0ce0925` — ingestion pipeline shared types (`src/lib/ingestion/types.ts`); re-exports `CanonicalField`/`ColumnMapping`/`DetectedBank` from existing column-detect; adds `ExtractorSource`, `ColumnConfidence`, `ExtractedRow`, `ExtractorStepTrace`, `ExtractorTrace`, `ExtractorResult`

---

## §6 — Active blockers

Items requiring founder input or external action before specific
sub-batches can proceed. Cross-referenced to
[\_PHASE_L_PLAN.md §6](./_PHASE_L_PLAN.md#6-open-questions).

- ~~**§6.1 — Bank-sample collection strategy**~~ **RESOLVED 2026-05-22:**
  Founder collects CSV + PDF samples from 3–5 beta users BEFORE
  L1.5/L1.6 begin. Outreach runs IN PARALLEL with my L1.2–L1.4
  implementation work. Samples land in `tests/fixtures/bank-statements/`
  (CSV) and `tests/fixtures/pdf-statements/` (PDF) with a README
  per directory naming each bank. **Founder action open** — track
  outreach progress here:
  - [ ] User 1 sample collected — bank: \_\_\_
  - [ ] User 2 sample collected — bank: \_\_\_
  - [ ] User 3 sample collected — bank: \_\_\_
  - [ ] User 4 sample collected — bank: \_\_\_ (optional)
  - [ ] User 5 sample collected — bank: \_\_\_ (optional)
- **§6.2 — Email-change re-auth required?** (blocks L3.4): yes
  by default; confirm in-batch.
- **§6.3 — Supabase vs custom password-reset email** (blocks
  L4.8): default Supabase for MVP; confirm in-batch.
- **§6.4 — Stripe event dedup table or piggyback?** (blocks
  L5.2): default new mini-table; confirm in-batch.
- **§6.5 — Domain decision timing** (blocks L7.7 wording, also
  affects L4 DNS work if custom domain chosen): vercel.app
  subdomain or custom?
- **§6.6 — Sentry minimal wire or defer?** (blocks L7.9): default
  defer for beta scale; confirm in-batch.

Resolve a blocker → strike its line and move it to §5 history.

---

## §7 — Out of scope reminders (do not drift here)

Mirrors [\_PHASE_L_PLAN.md §3](./_PHASE_L_PLAN.md#3-whats-in-vs-out-vs-deferred).
Repeated in this tracker because compacted Claudes are tempted to
"helpfully" add scope.

- Phase 5 (Accounting) — NO
- Phase 8 (Gamification) — NO
- FEL / TPV — NO (BUSINESS-tier post-launch)
- Bank API integrations — NO (post-launch, overnight-swap-ready
  per memory)
- Custom report builder, what-if simulator, scheduled emailed
  reports — NO
- Capacitor mobile shell — NO
- Dark mode — NO
- Multi-currency beyond GTQ/USD — NO
- Country adapters (SV, HN, CR, etc.) — NO
- Sentry / PostHog / Better Stack full wiring — NO (L7.9 decides
  minimal-or-defer)
- Vercel Cron — NO (ADR-002, settled)

---

_Last tracker update: 2026-05-22, tracker-creation turn. No sub-batches closed yet._
