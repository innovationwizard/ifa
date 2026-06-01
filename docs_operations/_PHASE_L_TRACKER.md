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

- **Active batch:** L3 — Settings (account hygiene)
- **Active sub-batch:** _(at §6.2 wall — email-change re-auth decision; awaiting founder direction)_
- **Last commit relevant to Phase L:** `dc5b542` (L3.3 profile-card + updateProfile).
- **Next concrete action:** Founder picks the L3.4 re-auth posture. Question surfaced in chat. IFA is passwordless (magic-link + Google OAuth), so the only meaningful "re-auth" is a magic link to the CURRENT email — Supabase's default `updateUser({email})` already (a) sends a confirmation link to the new email and (b) notifies the old email of the change, which covers the simplest threat model without an extra round trip.
- **Blockers:** §6.2 (email-change re-auth) — open question.
- **Files in flight (uncommitted edits):** none.

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
- [x] **L1.8** — `src/components/imports/csv-import-wizard.tsx`: add "Confirma el mapeo" step + editable per-column dropdowns · `6daee54` · 2026-05-22
- [x] **L1.9** — wire wizard to L1.7 endpoint (replace the in-wizard heuristic with a server call) · `e4d9c30` · 2026-05-22
- [x] **L1.10** — surface AI-source banner + per-column `reason` in PreviewStep. _(Re-scoped: original was "imports.mapping.\* i18n block" but L1.8 + L1.9 already added the critical UI keys. L1.10 now extends `previewing` state with `perFieldConfidence`, propagates from `runExtractor`, renders a banner when `source === 'ai'/'mixed'`, and shows the AI's per-column reason text under each select.)_ · `c342695` · 2026-05-22
- [x] **L1.11** — `tests/e2e/api-imports-parse.spec.ts`: e2e auth-401 contract for the parse endpoint (3 tests pinning auth-before-validation order). _(Originally scoped as a UI-flow e2e; rescoped to auth-spec to match the existing pattern — no signed-in Playwright fixture exists in this repo.)_ · `0fffe74` · 2026-05-22
- ~~**L1.11.5**~~ (dropped — founder decided 2026-05-22 to defer RTL for PreviewStep's AI banner / reason rendering. PreviewStep's added surface is small + exercised by manual launch testing. Future regression risk acknowledged. Reversal: add this sub-batch if a regression actually happens.)
- [x] **L1.12** — Gate sweep + tracker update (mark L1 done in §3 + §5 + §1) + commit message proposal. **L1 batch closed.** · `35f50fc` · 2026-06-01

**L1 dependencies:** B2 (Anthropic SDK wrapper) ✓, B5 (transactionRepo import path) ✓, existing csv-import-wizard ✓ — all from Phase 6/7.

### Batch L2 — PDF ingestion via the L1 pipeline (11 sub-batches)

> See [\_PHASE_L_PLAN.md §2 L2](./_PHASE_L_PLAN.md#batch-l2--pdf-ingestion-via-the-l1-pipeline).

- [x] **L2.1** — Choose PDF lib (pdf-parse vs pdfjs-dist) + add dep; document choice in a comment. _Decision (2026-06-01): **unpdf** picked over pdfjs-dist-direct + pdf-parse after `deep-research` workflow report (101 agents, 25 verified claims). Full rationale in [\_PDF_LIB_RESEARCH.md](./_PDF_LIB_RESEARCH.md). Added unpdf@^1.6.2._ · `5f58479` · 2026-06-01
- [x] **L2.2** — `src/lib/ingestion/pdf-extract.ts`: pure server-side PDF buffer → text rows transformation · `35bbbca` · 2026-06-01
- [x] **L2.3** — `src/lib/ingestion/ai-detect.ts` (extend): add "prose-mode" system prompt for free-text → structured rows (cached separately from CSV mode) · `abc9fac` · 2026-06-01
- [x] **L2.4** — `src/lib/ingestion/extractor.ts` (extend): add `extractFromPdf(buffer)` entry that chains pdf-extract → ai-detect prose-mode · `651ca78` · 2026-06-01
- [x] **L2.5** — `src/components/imports/csv-import-wizard.tsx` (extend): widen `<input accept>` to include `.pdf`, branch parse step on MIME type · `9c70c7c` · 2026-06-01
- [x] **L2.6** — `src/app/api/v1/imports/parse-pdf/route.ts`: server endpoint accepting PDF upload → returning ExtractorResult. _5s hard timeout omitted — Vercel function runtime ceiling handles long extractions; soft per-route timeout judged overengineering for MVP._ · `0e63894` · 2026-06-01
- [x] **L2.6.5** — `src/app/api/v1/imports/parse-pdf/route.test.ts`: auth gating (401 anon, 400 `no_profile`), content-type/empty/oversize body guards (400/400/413), `pdf_extract_failed` (400 when extractor throws), happy path (200 with orchestrator result). _(Inserted because L2.6 lands without a route-test sibling — mirrors L1.7.5's insert pattern.)_ · `1591262` · 2026-06-01
- [x] **L2.7** — `src/messages/es-GT.json`: `imports.pdfHelp.*` block (incl. "guardar como PDF" guidance for printable web pages) — shipped `imports.pdfHelp.printTip` + IdleStep render; rest of block deferred post-L2 (L2.5 already covered upload.prompt/hint). · `69e62d4` · 2026-06-01
- [x] **L2.8** — `src/lib/ingestion/pdf-extract.test.ts` + extend extractor tests for PDF input path. _Structural-only scope (founder decision 2026-06-01); mocks unpdf and the orchestrator's collaborators. Real-fixture tests follow as L2.8.5 when §6.1 samples land._ · `6c7adb7` · 2026-06-01
- [ ] **L2.8.5** — Real-fixture pdf-extract tests against anonymized GT bank PDFs. **CARRIED FORWARD as documented debt (founder decision 2026-06-01)** — blocked on §6.1 founder outreach.
- [ ] **L2.9** — **Founder action:** collect 2–3 anonymized real PDF samples. **CARRIED FORWARD** — blocked on §6.1 (founder collects).
- [ ] **L2.10** — `tests/e2e/imports-pdf.spec.ts`: e2e spec uploading a fixture PDF. **CARRIED FORWARD** — blocked on L2.9.
- [x] **L2.11** — Gate sweep + tracker update + commit. **L2 batch closed PARTIALLY** with L2.8.5/L2.9/L2.10 explicitly carried forward as documented debt. _(awaiting push)_

**L2 dependencies:** L1 done. L2.9/L2.10/L2.8.5 carried forward; do NOT block L3+ batches.

### Batch L3 — Settings — account hygiene (12 sub-batches, OUTLINE — refine on entry)

> See [\_PHASE_L_PLAN.md §2 L3](./_PHASE_L_PLAN.md#batch-l3--settings-page-account-hygiene).

- [x] **L3.1** — Schema: add `Profile.deletedAt` + `ProfileMember.deletedAt` if not already there; `pnpm db:push` _(code shipped; `db:push` against prod is a founder action that follows the push)_ · `2212dfb` · 2026-06-01
- [x] **L3.2** — `src/app/(app)/configuracion/page.tsx`: shell with 4 sections · `8bb12a4` · 2026-06-01
- [x] **L3.3** — `src/components/settings/profile-card.tsx` + `updateProfile` action · `dc5b542` · 2026-06-01
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

- 2026-06-01 — **L2 BATCH CLOSED PARTIALLY via L2.11** — `ef79340` — 8 sub-batches shipped (L2.1 → L2.8 + L2.6.5). 3 sub-batches carried forward as documented debt: L2.8.5 (real-fixture pdf-extract tests), L2.9 (founder samples), L2.10 (PDF e2e). All blocked on §6.1 founder outreach. Full partial gate sweep: vitest 619/619, playwright chromium 41/41, next build ✓, typecheck ✓, lint 0 errors. Net code added in L2: pdf-extract module + ai-detect prose-mode + extractor PDF entry + parse-pdf route + 4 test files + 3 i18n keys + wizard PDF branch + 1 dep (unpdf) + 1 deep-research-driven decision doc. PDF preview-UI adaptation noted as known-limitation post-L2.
- 2026-06-01 — L3.3 closed — `dc5b542` — Perfil section (`src/app/(app)/configuracion/actions.ts` new + `src/components/settings/profile-card.tsx` new + page.tsx wiring + i18n); `updateProfile` server action (Zod-validated displayName/dpiNumber/dateOfBirth); 4-state client form (idle / submitting / saved / error); revalidates `/configuracion` + `/dashboard` (dashboard greets by displayName). 619/619 tests still pass.
- 2026-06-01 — Interjection (Prisma config) — `ed2d5a8` — migrated `package.json#prisma#seed` → `prisma.config.ts` to address Prisma 7 deprecation warning. Minimum-change: only seed command moves; schema path + datasource URL keep defaults. Verified by `pnpm db:generate` → "Loaded Prisma config from prisma.config.ts" (warning gone). Behavior note: Prisma now skips auto-loading .env when a config file is present; we already wrap with `dotenv -e .env.local --` in every `pnpm db:*` script so this is unaffected.
- 2026-06-01 — L3.2 closed — `8bb12a4` — `/configuracion` shell (`src/app/(app)/configuracion/page.tsx`); replaced ModulePlaceholder with 4-section Card shell (Perfil → Cuenta → Tus datos → Eliminar, delete last so user scrolls past everything else first); new `settings.*` i18n block; new `tests/e2e/configuracion.spec.ts` auth-proxy spec (1 test).
- 2026-06-01 — L3.1 closed — `2212dfb` — schema additions for soft-delete (`prisma/schema.prisma`); `Profile.deletedAt` + `ProfileMember.deletedAt` (both `DateTime?`, additive, zero data loss); prod synced via founder-run `pnpm db:push` 2026-06-01.
- 2026-06-01 — L2.8 closed — `6c7adb7` — structural PDF tests (`src/lib/ingestion/pdf-extract.test.ts` new + `extractor.test.ts` extended); 11 new tests pinning pdf-extract's pure-transformation contract (happy, empty, errors-propagate w/ ORIGINAL Error instance) + extractFromPdf branch (trace merge, empty-pages 'fallback' vs 'matched', orchestrator re-throws). 37/37 ingestion tests pass. Real-fixture coverage deferred to L2.8.5.
- 2026-06-01 — L2.7 closed — `69e62d4` — print-to-PDF tip in IdleStep (`src/messages/es-GT.json` + `src/components/imports/csv-import-wizard.tsx`); single `imports.pdfHelp.printTip` key in tú-register Spanish + `<p>` below the dropzone covering the "printable web pages" case. Scope smaller than original `imports.pdfHelp.*` block plan because L2.5 already covered `upload.prompt/hint`; remaining PDF i18n deferred post-L2.
- 2026-06-01 — L2.6.5 closed — `1591262` — parse-pdf route tests (`src/app/api/v1/imports/parse-pdf/route.test.ts`); 11 mocked-extractor tests pinning auth gating (401/400; extractor NOT called), content-type guard (rejects JSON, accepts suffix + case-insensitive), body guards (empty 400, oversize 413), extractor-throws → 400 `pdf_extract_failed` with message echo (incl. non-Error throw via String(err) for defense), happy path (200 ExtractorResult shape preserved + body forwarded as Uint8Array).
- 2026-06-01 — L2.6 closed — `0e63894` — parse-pdf route (`src/app/api/v1/imports/parse-pdf/route.ts`); POST raw `application/pdf` body → `extractFromPdf` → `ExtractorResult` JSON; auth gating 401/400, content-type guard 400, empty/oversize body 400/413, `pdf_extract_failed` 400 (extractor throws). 200 even on AI-failed path (wizard branches). No Zod (binary body), no soft timeout (Vercel ceiling).
- 2026-06-01 — L2.5 closed — `9c70c7c` — wizard accepts PDF + branches by MIME (`src/components/imports/csv-import-wizard.tsx`); `isPdfFile` helper (MIME-first, filename-extension fallback); `<input accept>` widened; new `runPdfExtractor` POSTs raw bytes to `/api/v1/imports/parse-pdf` (404 until L2.6); preview-UI adaptation for PDF deferred as known-limitation post-L2.6; +2 i18n key updates (`upload.prompt`, `upload.hint`).
- 2026-06-01 — L2.4 closed — `651ca78` — extractor orchestrator gains PDF entry (`src/lib/ingestion/extractor.ts`); new `extractFromPdf(buffer)` chains pdf-extract → aiDetectProse + merges traces. Types union extended: `ExtractorStepTrace.step` now `'heuristic' | 'ai' | 'pdf'`. Throws semantics documented at file level: extractFromCsv never throws; extractFromPdf MAY throw on corrupt/encrypted PDFs (route catches).
- 2026-06-01 — L2.3 closed — `abc9fac` — ai-detect grows prose mode (`src/lib/ingestion/ai-detect.ts`); CSV constants renamed (`SYSTEM_PROMPT` → `SYSTEM_PROMPT_CSV`, `AiResponseSchema` → `AiCsvResponseSchema`); shared `PerFieldConfidenceSchema` + `NotesSchema` extracted; new `aiDetectProse({pages})` with caps (20 pages × 4000 chars × 30 rows); empty-pages short-circuits to failed without a Claude call; same defensive failure contract. Existing 10 CSV tests still pass.
- 2026-06-01 — L2.2 closed — `35bbbca` — pdf-extract.ts (`src/lib/ingestion/pdf-extract.ts`); pure async `extractPdfText(buffer) → {pages: string[], totalPages, durationMs}` wrapping `unpdf.extractText`. Locked: errors propagate (opposite of ai-detect's never-throw contract — PDF parsing failures are user-action errors). Tests deferred to L2.8.
- 2026-06-01 — L2.1 closed — `5f58479` — chose `unpdf@^1.6.2` over pdfjs-dist-direct + pdf-parse via the `deep-research` workflow (101 agents, 25 adversarially-verified claims, 20 confirmed / 5 killed). Full report at `docs_operations/_PDF_LIB_RESEARCH.md`. Open question (load-bearing for L2.8–L2.10): zero GT-specific empirical evidence — must test against real BAC/Industrial/Banrural samples via §6.1 founder outreach.
- 2026-06-01 — **L1 BATCH CLOSED via L1.12** — `35f50fc` — 13 sub-batches shipped (L1.1 → L1.11 + L1.2.5 + L1.6.5 + L1.7.5; L1.11.5 dropped). Full gate sweep: vitest 597/597, playwright chromium 41/41, next build ✓, typecheck ✓, lint 0 errors. Net code added in L1: 5 ingestion modules + 5 ingestion tests + 1 API route + 1 API-route test + 1 e2e spec + 1 wizard refactor + 5 i18n keys. Ready to advance to L2 (PDF ingestion via the L1 pipeline).
- 2026-05-22 — L1.11 closed — `0fffe74` — e2e auth spec for `/api/v1/imports/parse` (`tests/e2e/api-imports-parse.spec.ts`); 3 anonymous-401 tests pinning auth-runs-before-Zod and auth-runs-before-body-parse order
- 2026-05-22 — L1.10 closed — `c342695` — AI-source banner + per-column reason in PreviewStep (`src/components/imports/csv-import-wizard.tsx`); previewing state gains `perFieldConfidence`; banner when `source === 'ai'/'mixed'`; per-column reason rendered under select when present; +1 i18n key
- 2026-05-22 — L1.9 closed — `e4d9c30` — wizard wired to parse endpoint (`src/components/imports/csv-import-wizard.tsx`); dropped in-wizard `detectColumns`; new `detecting` state w/ spinner; `runExtractor` POSTs to `/api/v1/imports/parse`; previewing state carries `source`; defensive fallbacks for missing bank/mapping; +2 i18n keys; locked no-silent-fallback behavior on server error
- 2026-05-22 — L1.8 closed — `6daee54` — wizard editable mapping (`src/components/imports/csv-import-wizard.tsx`); per-column `<select>` over 7 canonical fields; live `validateMapping` disables confirm + lists missing fields; `onConfirm` signature changed to receive corrected mapping; +2 i18n keys
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
