# IFA — Phase L (Launch) Build Plan — INDIVIDUAL MVP, friends-and-family beta

> **Authoritative source for the launch batches.** Same format as
> [\_PHASE_6_7_PLAN.md](./_PHASE_6_7_PLAN.md) — written so a future
> contributor (or a compacted Claude conversation) can pick up any
> batch from cold context. Each batch has goal, files, acceptance
> criteria, dependencies, and risk notes.
>
> **Companion docs:**
> [\_PHASE_L_TRACKER.md](./_PHASE_L_TRACKER.md) — **live execution
> state.** This plan is the spec; the tracker is the source of truth
> for what's done, in-flight, blocked, or next. Updated on every
> sub-batch close. **Read the tracker first if picking up from
> compacted/cold context.** ·
> [\_DECISIONS.md](./_DECISIONS.md) (ADR-001 + ADR-002 — Vercel-Cron-
> free architecture) · [\_PHASE_6_7_RETROSPECTIVE.md](./_PHASE_6_7_RETROSPECTIVE.md)
> (state of the codebase entering Phase L)

## 0. Locked decisions (from the 2026-05-22 launch-planning turn)

These decisions are the constraints the plan is built against. Any
batch that contradicts them is the batch that's wrong — not the
decision.

1. **Target user is the non-financial-professional Guatemalan
   individual.** Below-elementary-school Spanish, tú register, no
   accounting jargon. Same persona as Phase 6/7 shipped against.
   See [memory: project_audience](~/.claude/projects/-Users-jorgeluiscontrerasherrera-Documents--git-ifa/memory/project_audience.md)
   and [project_core_thesis](~/.claude/projects/-Users-jorgeluiscontrerasherrera-Documents--git-ifa/memory/project_core_thesis.md).

2. **Launch shape is a friends-and-family beta** of 5–20 invited
   users. Definition of done: a friend can sign up, import their
   bank, see their Health Score, navigate the app, and trust it —
   all without the founder physically present. **Open signup** —
   anyone with the link can register. Bot/spam risk accepted at
   beta scale.

3. **No Vercel Cron** ([ADR-002](./_DECISIONS.md#adr-002--no-vercel-cron-at-all-health-score-auto-recomputes-on-dashboard-visit-when-stale)).
   `vercel.json` has no `crons` array. Any cron-shaped need MUST
   be served by user-triggered actions, auto-on-visit patterns,
   or external schedulers — never reintroduce Vercel Cron without
   re-deciding ADR-002.

4. **The ingestion pipeline must accept whatever the user uploads.**
   This is the load-bearing UX promise. We do NOT ship per-bank
   parsers; we ship a universal AI-assisted extraction pipeline
   that handles CSV, PDF, and any bank's column shape. When the
   extractor's confidence is low the user reviews + confirms
   before any row commits. The parser does not fail silently and
   does not drop data — it captures every row, surfaces every
   ambiguity, and lets the user resolve. ("The parser doesn't fail
   AND doesn't drop data" — `cross-project-etl-wisdom.md`.)

5. **Stripe is wired live from day one.** $1/mo individual price
   collected from real cards. 30-day trial → soft-gate → hard-gate
   per the existing `gate.ts` matrix. Stripe webhook handles the
   subscription lifecycle. No "we'll wire billing later".

6. **Bank API integrations are POST-launch.** Engineered for
   overnight swap-readiness per the locked memory, but not built
   in Phase L. Statement upload is the only ingestion path that
   ships now. See [memory: project_bank_connection_strategy](~/.claude/projects/-Users-jorgeluiscontrerasherrera-Documents--git-ifa/memory/project_bank_connection_strategy.md).

7. **FEL / TPV integrations are POST-launch and BUSINESS-tier.**
   Most individuals don't use FEL. Adapter scaffolding stays
   dormant until BUSINESS rollout.

8. **No gamification (Phase 8), no accounting (Phase 5), no
   custom-report builder, no mobile shell, no dark mode, no
   multi-currency, no country adapters.** Listed here so future
   batches don't drift.

9. **Schema changes are in scope when load-bearing.** Applied via
   `pnpm db:push` per the current pre-pilot policy in
   [migrations.md](./migrations.md). The transition to formal
   migrations triggers at first-pilot per that doc — Phase L is
   the last phase that gets to use `db:push`.

10. **Anthropic budget acknowledged.** Universal extraction uses
    Claude Haiku per import (cached system prompt → ~$0.005–$0.02
    per statement at typical sizes). Budget impact is real but
    bounded; no AI calls in the auto-recompute or render paths
    beyond what Phase 6/7 already shipped.

---

## 1. State of the codebase entering Phase L

What's already shipped and load-bearing for the launch:

- Auth: magic-link via Supabase ✓
- Onboarding: `/bienvenida` creates Profile + ProfileMember ✓
- Transactions feed: virtualized, URL-filtered, duplicate + anomaly
  badges ✓
- CSV import wizard: client-side preview + server-side commit;
  per-bank heuristic detection for BAC + Banco Industrial; bank-
  agnostic generic fallback ✓
- Reports: cash-flow, spending-by-category, top-merchants ✓
- Health Score: 6-factor engine, bullet graph, detail page, history,
  improvement actions, auto-recompute-on-visit when stale ✓
- Job queue: `PendingJob` table, user-triggered drain via
  "Procesar ahora" button (ADR-001) ✓
- Tenancy: AsyncLocalStorage + Prisma extension fail-closed ✓
- i18n: monolingual es-GT, tú register ✓
- Money primitive: `Q 1,234.56` format ✓

What's known-broken or load-bearing-but-incomplete:

- `Stripe*` env vars are optional; checkout/portal routes
  short-circuit. Billing collects nothing today.
- Settings page does not exist. No account deletion, no data
  export, no email change.
- No transactional email beyond Supabase magic-link send.
- `/privacidad` and `/terminos` exist but pre-date Stripe + Resend
  data flows — content needs audit.
- No `/contacto` support page.
- CSV import handles only `.csv` files. PDF / printable web pages /
  any non-CSV format = blocked at file picker.
- The CSV column-detect is heuristic; it auto-detects BAC + Banco
  Industrial layouts and falls back to a generic schema for others.
  "Generic" means it expects date/description/amount columns to
  exist with reasonable headers. A bank using non-standard column
  names or extra columns silently mis-maps or rejects.
- DEMO mode kit is frozen under `demo/` but not wired into a
  marketing surface.

What's deliberately out of scope (see §0 + §3 below):

- Accounting (Phase 5), gamification (Phase 8), settings polish
  (Phase 9), DEMO marketing surface (Phase 10), pre-launch audits
  (Phase 11), FEL/TPV adapters, bank APIs, BUSINESS tier, mobile
  shell.

---

## 2. Scope IN for Phase L

The seven batches below ship in order. Each is dependency-bounded
on the previous batch in places noted under "Dependencies".

### Batch L1 — Universal AI-assisted ingestion engine (CSV + AI extractor + confidence + user-confirm)

**Goal:** Replace the current per-bank-heuristic CSV detection with
a universal extraction pipeline that handles any CSV the user
uploads. The same pipeline becomes the foundation for L2's PDF
support. Honest by construction: low-confidence parses surface to
the user for review rather than committing silently.

**Architecture:**

```
File (CSV) ──► papaparse (client) ──► row sample (≤50 rows) ──►
  ┌─────────────────────────────────────────────┐
  │  ExtractorPipeline (server)                 │
  │   1. Try heuristic detect (current code)    │
  │      → if confidence ≥ THRESHOLD, return    │
  │   2. Otherwise call AI extractor (Haiku)    │
  │      with the row sample + headers          │
  │      → AI returns column mapping +          │
  │         per-column confidence               │
  │   3. Surface mapping + confidence to wizard │
  │      user confirms / corrects / cancels     │
  │   4. On user confirm, full file commits via │
  │      transactionRepo.createManyFromImport   │
  └─────────────────────────────────────────────┘
```

**Files:**

- `src/lib/ingestion/extractor.ts` — pipeline orchestrator. Pure
  function shape: `extractMapping(sample, fileMeta) → ExtractorResult`.
- `src/lib/ingestion/heuristic-detect.ts` — wraps the existing
  `src/lib/imports/column-detect.ts`. Returns a confidence score
  alongside the mapping (existing code returns mapping with no
  explicit confidence; we add it).
- `src/lib/ingestion/ai-detect.ts` — Claude Haiku-powered fallback.
  Uses the existing `callClaudeWithRetry` from B2. System prompt is
  cached (prompt-caching breakpoint). Returns mapping + per-column
  confidence + Spanish explanation strings the wizard can show.
- `src/lib/ingestion/types.ts` — `ExtractorResult`, `ColumnMapping`,
  `ColumnConfidence`, `ExtractorTrace` (for telemetry / debugging).
- `src/components/imports/csv-import-wizard.tsx` — extend the
  `previewing` stage to surface confidence + AI-suggested mapping
  when heuristic fails. New "Confirma el mapeo" step with editable
  per-column dropdowns.
- `src/messages/es-GT.json` — `imports.mapping.*` block: "no
  reconocimos algunas columnas, ¿es correcto?", per-column-type
  Spanish labels, "ajustar mapeo" button, etc.
- `src/lib/ingestion/extractor.test.ts` — unit coverage of the
  pipeline orchestrator with mocked heuristic + AI.
- `src/lib/ingestion/ai-detect.test.ts` — AI-detect tests with
  mocked Claude responses (happy path, malformed JSON, partial
  confidence, refusal).
- `tests/e2e/imports-mapping.spec.ts` — wizard renders the new
  confirm step when heuristic confidence is low.

**Acceptance criteria (8 items):**

- [ ] A CSV with the BAC layout still auto-detects without surfacing
      the confirm step (regression: heuristic-confident path keeps
      its current UX).
- [ ] A CSV with the Banco Industrial layout still auto-detects.
- [ ] A CSV with non-standard column names (e.g., "Movimiento",
      "Cargo", "Abono") routes to the AI extractor, AI returns a
      mapping, wizard surfaces the confirm step with editable
      dropdowns, user clicks "Listo", import proceeds.
- [ ] A CSV with ambiguous columns (e.g., two amount-like columns)
      surfaces both as candidates with confidence percentages; user
      picks one.
- [ ] A CSV the extractor cannot map at all returns an error state
      with a "tu banco no funcionó, avísanos" feedback link (does
      NOT silently drop the file).
- [ ] AI calls go through `callClaudeWithRetry` (B2 wrapper) — no
      direct SDK use. System prompt has `cache_control` breakpoint.
- [ ] Cost telemetry from B2 fires per import; logged tokens
      include `cacheReadTokens` after the second import.
- [ ] Full gate sweep green.

**Risk notes:**

- The AI extractor's accuracy on real-world Guatemalan bank exports
  is unverified at plan-write time. Mitigation: the confirm step
  is the safety net — user reviews before commit. If the AI
  consistently gets it wrong for a given bank shape, that bank
  goes into the heuristic detector as a per-bank case (the
  pipeline is already structured to allow this).
- Claude Haiku's structured-output reliability is good but not
  perfect. The AI-detect parser MUST validate against a Zod schema
  and fall through to the user-confirm error state on parse
  failure rather than throwing.
- Token budget per import: ~5K in + ~2K out at typical sizes →
  ~$0.005 per import. Acceptable.

**Dependencies:** B2 (Anthropic SDK wrapper), B5 (transactionRepo
import path), existing csv-import-wizard.

---

### Batch L2 — PDF ingestion via the L1 pipeline

**Goal:** A user uploading a PDF bank statement gets the same
"confirm the mapping" flow as a CSV upload. The L1 pipeline is
the integration point; PDF support is one new extractor at the
front of it.

**Files:**

- `package.json` — `pdf-parse` or `pdfjs-dist` dep (decide in batch
  based on output quality; default to `pdf-parse` for simplicity).
- `src/lib/ingestion/pdf-extract.ts` — pure server-side PDF →
  text-rows transformation. Pages → text → line tokenization → row
  candidates. Heuristics for "this line is a transaction" vs "this
  line is page chrome / header / footer / balance summary".
- `src/lib/ingestion/extractor.ts` (extend) — accept PDF input via
  a new `extractFromPdf(buffer)` entry that pipes PDF text through
  the AI extractor (the AI handles transaction-row inference from
  free text, not just CSV columns).
- `src/lib/ingestion/ai-detect.ts` (extend) — second mode:
  "structured-rows-from-prose" for PDF/HTML text input. New system
  prompt variant; cached separately.
- `src/components/imports/csv-import-wizard.tsx` (rename to
  `statement-import-wizard.tsx` if we want to reflect the broader
  scope; OK to leave the file name and just widen the wizard's
  accept attr + parsing branch). Update `<input accept>` to
  include `.pdf`, branch the parse step on MIME type.
- `src/app/api/v1/imports/parse-pdf/route.ts` — server endpoint
  that accepts the uploaded PDF, runs `pdf-extract` + the AI
  extractor, returns the proposed mapping + sample rows for the
  wizard's confirm step. (Existing CSV parse already runs
  client-side; PDF must run server-side because pdf-parse is a
  Node-only lib.)
- `src/messages/es-GT.json` — `imports.pdfHelp.*` block: "tu banco
  te dio un PDF? también lo aceptamos", "imprimiendo desde tu
  banco? usa 'guardar como PDF' en el navegador" (covers the
  printable-web-pages case).
- Tests as in L1 plus PDF-specific fixtures.

**Acceptance criteria (7 items):**

- [ ] A PDF bank statement from at least one Guatemalan bank parses
      end-to-end and inserts rows correctly (sample to be captured
      from a friend's actual statement before this batch closes —
      no synthetic fixtures).
- [ ] PDFs that aren't bank statements (random PDFs) route to the
      error state with the "tu banco no funcionó" feedback link.
- [ ] PDFs that ARE bank statements but the AI extractor can't
      reliably extract from surface to the confirm step with the
      best guess; user can correct.
- [ ] Wizard accepts `.pdf` and `.csv` and routes each to the right
      parser.
- [ ] Server-side PDF parsing has a hard timeout (5s default) so a
      malicious PDF can't tie up a function.
- [ ] No client-side PDF parsing (security: PDF parsers historically
      have CVEs; keep them off the user's browser).
- [ ] Full gate sweep green.

**Risk notes:**

- PDF extraction quality varies dramatically by bank. We may need
  bank-specific post-processing heuristics (per-bank line-grouping
  rules, for example) that the AI extractor can't infer. Plan:
  start with the AI handling everything; add per-bank rules ONLY
  when the AI consistently fails on real data.
- The "printable web pages" case is handled by user-guidance:
  tell them to use browser Print → Save as PDF. The result feeds
  into the PDF parser. No HTML-file parsing in L2.
- `pdf-parse` is unmaintained as of plan-write (last release 2018).
  `pdfjs-dist` is Mozilla's actively-maintained alternative but
  has a larger footprint. Decide in-batch based on extraction
  quality on real samples.

**Dependencies:** L1.

---

### Batch L3 — Settings page (account hygiene)

**Goal:** `/configuracion` exists and lets the user manage their
profile, change their email, reset their password, **delete their
account**, and **export all their data**. Beta users will not trust
a product without these.

**Files:**

- `src/app/(app)/configuracion/page.tsx` — server component, lists
  sections (Perfil, Cuenta, Datos, Eliminar). Auth-gated by the
  (app) layout.
- `src/app/(app)/configuracion/actions.ts` — server actions:
  `updateProfile`, `requestEmailChange`, `requestPasswordReset`,
  `requestAccountDeletion`, `exportData`.
- `src/components/settings/profile-card.tsx` — displayName, dpiNumber
  (optional), dateOfBirth (optional) edit form.
- `src/components/settings/account-card.tsx` — email + password
  reset via Supabase. Both flows trigger transactional emails (L4
  dep — if L4 not done, use Supabase's defaults).
- `src/components/settings/data-card.tsx` — "Descarga tus datos"
  CTA → triggers `exportData` server action → returns ZIP containing
  CSV of all transactions + CSV of all HealthScore snapshots +
  JSON of profile metadata.
- `src/components/settings/delete-card.tsx` — "Eliminar mi cuenta"
  flow: confirm by typing email; explicit warning about irreversibility;
  on confirm, server action soft-deletes the profile (sets
  `deletedAt`) and the user's session is destroyed.
- `src/lib/db/repositories/profile.ts` (extend) — `softDelete(profileId)`
  cascades: Profile.deletedAt set; ProfileMember.deletedAt set;
  transactions stay (immutable accounting record) but the profile
  becomes unreachable.
- `prisma/schema.prisma` (extend) — `Profile.deletedAt: DateTime?`
  - `ProfileMember.deletedAt: DateTime?` if not already there.
    Tenancy extension queries gain a `deletedAt: null` filter for
    Profile lookups (auth flow already passes through `profileRepo`).
- `src/messages/es-GT.json` — `settings.*` block with all copy in
  tú-register Spanish.
- Unit tests for each server action; e2e auth-redirect spec for
  `/configuracion`; e2e happy-path spec for data-export.

**Acceptance criteria (8 items):**

- [ ] `/configuracion` renders the 4 sections for authed users; 307
      to `/ingresar` for anonymous.
- [ ] Edit displayName + dpiNumber + dateOfBirth and save; refresh
      shows the new values.
- [ ] Trigger password reset; user receives an email with a working
      reset link (Supabase default OK in L3; branded in L4).
- [ ] Trigger email change; user receives a confirmation email at
      the NEW address; clicking confirms the change.
- [ ] "Descarga tus datos" downloads a ZIP with transactions.csv +
      health_scores.csv + profile.json; content matches the user's
      actual data.
- [ ] Account deletion: type email to confirm, on submit the profile
      is soft-deleted, session destroyed, user redirected to a
      "Cuenta eliminada" goodbye page. Subsequent login attempts
      with the same email get a clear "esta cuenta fue eliminada"
      message (or new-profile creation, decide in-batch).
- [ ] All copy is in tú-register, lower-elementary Spanish.
- [ ] Full gate sweep green.

**Risk notes:**

- Soft-delete vs hard-delete: per the build plan's S-9.7, profile
  removal is soft-delete to preserve audit trails. Confirmed for L3.
  Hard-delete (data purge after N days) is post-launch.
- Email change carries hijack risk if a user's session is stolen.
  Mitigation: require password re-entry (or magic-link re-auth)
  before the email-change action is callable. Decide in-batch.
- The data export endpoint is potentially expensive (full table
  scan of the user's transactions). Cap at, e.g., 100k rows; if a
  user has more, generate async and email a download link (defer
  the async path; cap is fine for MVP).

**Dependencies:** L4 (transactional email) makes the email-change

- password-reset flows branded; L3 ships with Supabase defaults
  if L4 hasn't landed yet.

---

### Batch L4 — Transactional email infrastructure (Resend)

**Goal:** Resend wired as the transactional-email provider. Five
templates ship: welcome (post-onboarding), email-change confirmation,
password reset (replaces Supabase default), billing receipt, billing
dunning (PAST_DUE → soft-gate warning).

**Files:**

- `package.json` — `resend` dep.
- `.env.example` + `vercel-setup.md` — `RESEND_API_KEY` row added.
- `src/lib/env.ts` — `RESEND_API_KEY` validated as required in
  production (optional in dev for offline work).
- `src/lib/email/client.ts` — singleton Resend client, mirrors
  `getClaudeClient()` pattern from B2.
- `src/lib/email/templates/` — one file per template. Each exports
  `{ subject, render(props) → { html, text } }`. Plain HTML +
  inline CSS; no email framework (defer until template count > ~10).
- `src/lib/email/send.ts` — `sendEmail({ to, template, props })`
  with retry + telemetry (mirrors `callClaudeWithRetry`).
- `src/lib/email/send.test.ts` — happy path, retry, telemetry shape.
- Wire-up points:
  - `src/app/api/auth/callback/route.ts` (or equivalent onboarding
    completion) → send welcome on first Profile creation.
  - `src/app/(app)/configuracion/actions.ts` → branded email-change
    - password-reset confirmations.
  - `src/app/api/stripe/webhook/route.ts` (L5 dep) → billing
    receipts + dunning.
- Unsubscribe handling — required for marketing-style mail; not
  required for transactional. Each template includes a footer
  noting "este correo es parte del servicio; no es promoción" so
  spam filters classify correctly.

**Acceptance criteria (7 items):**

- [ ] `RESEND_API_KEY` set in production; dev runs offline without
      it (logs would-be-sent emails to console).
- [ ] First sign-up triggers a welcome email to the new user.
- [ ] Email-change confirmation flow sends a branded email to the
      new address.
- [ ] Password-reset flow sends a branded email (replaces Supabase's
      default; we either use Supabase's hook to swap the sender, or
      shortcut Supabase and send our own — decide in-batch).
- [ ] All templates have valid HTML, plain-text fallback, and render
      in a major client smoke-test (Gmail web at minimum).
- [ ] Send failures retry once + log; UI flow does NOT block on
      send (server action returns success even if email queue
      fails — the user's state change committed).
- [ ] Full gate sweep green.

**Risk notes:**

- Supabase Auth's password-reset email is hard to fully customize
  without leaving Supabase Auth entirely. Two paths: (a) accept
  Supabase's branding for password reset and only customize the
  others; (b) implement our own password-reset (custom token table,
  custom email, custom reset page). Path (a) is the lower-risk
  MVP choice; (b) is a Phase-after addition. Default to (a).
- Resend free tier limits: 100 emails/day. At beta scale (≤20 users
  doing maybe 2 emails each per signup + occasional resets) this
  is fine. Upgrade trigger documented in-batch.
- Domain DNS: Resend requires SPF + DKIM records on the sending
  domain. If the domain decision in L7 lands late, use Resend's
  shared `resend.dev` subdomain temporarily; flip to the real
  domain when DNS is configured.

**Dependencies:** None blocking; integrates with L3 (settings) and
L5 (Stripe).

---

### Batch L5 — Stripe live: trial → paid $1/mo collection

**Goal:** Stripe is fully wired. The 30-day trial flows into real
$1/mo billing on day 30. Failed payments trigger PAST_DUE → soft-gate
→ hard-gate per the existing `gate.ts` matrix (B7-era code). A
real beta user signs up, gets billed $1 after 30 days, can manage
their card via the customer portal, can cancel.

**Files:**

- `.env.example` — already has `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_INDIVIDUAL_ID`, `STRIPE_PRICE_BUSINESS_ID`. No
  schema changes needed.
- `vercel-setup.md` — populate the Stripe envs in production with
  live keys (manual ops step; document in this batch's notes).
- `src/lib/billing/stripe.ts` — singleton Stripe client (lazy env
  read, like the Claude client).
- `src/app/api/stripe/webhook/route.ts` — verify signature, handle:
  - `checkout.session.completed` → mark Profile ACTIVE, set
    `stripeCustomerId` + `stripeSubscriptionId`.
  - `customer.subscription.updated` → mirror status to Profile.
  - `customer.subscription.deleted` → set CANCELED + `currentPeriodEnd`.
  - `invoice.payment_failed` → set PAST_DUE.
  - `invoice.payment_succeeded` → trigger receipt via L4.
- `src/app/api/billing/checkout/route.ts` — POST creates a Stripe
  Checkout Session for the individual plan, returns the URL.
- `src/app/api/billing/portal/route.ts` — POST creates a customer-
  portal session for managing card/cancel.
- `src/app/(app)/configuracion/facturacion/page.tsx` — billing
  section under settings. Shows: current plan, trial-days-remaining
  or next-billing-date, "gestionar pago" button → portal.
- `src/components/billing/paywall.tsx` — soft-gate banner + hard-gate
  redirect. The existing `gate.ts` decides which to render; this
  component is what renders.
- `src/app/(app)/layout.tsx` (extend) — for each request, compute
  `gateState`. soft-gate renders the banner; hard-gate redirects
  to `/precios`.
- Unit tests: webhook signature verification, each event-type
  handler. E2E: anonymous → /precios renders both plans (already
  exists from B7-era); authenticated user on PAST_DUE sees the
  soft-gate banner.

**Acceptance criteria (8 items):**

- [ ] A new user signing up enters TRIAL with `trialEndsAt = now + 30d`.
- [ ] User can navigate to `/precios` and click "Pasar a este plan"
      → redirected to Stripe Checkout → completes payment with a
      test card → returns to the app with their Profile flipped to
      ACTIVE.
- [ ] `/configuracion/facturacion` shows trial remaining or next-
      billing-date depending on state.
- [ ] "Gestionar pago" links to a working Stripe customer-portal
      session.
- [ ] Cancelling in the portal sets Profile to CANCELED with
      `currentPeriodEnd` populated; user retains access until that
      date, then transitions to EXPIRED.
- [ ] Payment failure event flips Profile to PAST_DUE; soft-gate
      banner renders for `SOFT_GATE_DURATION_DAYS`; after that,
      hard-gate.
- [ ] All money displayed via the `<Money>` primitive — $1, $20
      USD per the locked-pricing memory.
- [ ] Webhook signature verification: requests without a valid
      `Stripe-Signature` header 400; valid requests 200; unit-
      tested at the route level.

**Risk notes:**

- Stripe Checkout in TEST mode vs LIVE mode is a hard cutover —
  test customers won't carry over to live. Plan: validate the full
  flow in TEST against a real Stripe account (use Stripe's test
  cards), THEN swap env vars to live keys before the final beta
  launch. Document this gate in L7.
- The webhook endpoint MUST be idempotent (Stripe retries on 5xx).
  Use the `event.id` as a dedup key (check `PendingJob`-style or
  a small `StripeEventLog` table — decide in-batch; lean toward
  a new tiny table for clarity).
- USD pricing for a GT product: the user pays via card in USD.
  Stripe handles FX. Document the "card will be charged in USD"
  copy on `/precios` (may already be there from B7-era).
- The B7-era pricing tests pin "$1 individual / $20 business" — do
  not change without updating those tests.

**Dependencies:** L4 for branded receipt + dunning emails; L3 for
the `/configuracion/facturacion` placement.

---

### Batch L6 — Pre-launch polish: privacy, terms, support, walkthrough

**Goal:** Bring policies + support contact up to date with the new
data flows (Stripe, Resend, AI extraction), do a real fresh-user
walkthrough end-to-end, fix the gaps surfaced.

**Files:**

- `src/app/privacidad/page.tsx` — audit current content. Add:
  Stripe as a data processor (card data via Stripe, never our
  servers); Resend as a transactional-email processor; Anthropic
  as an AI processor (statement column extraction sends sampled
  rows to Claude). All in tú-register Spanish.
- `src/app/terminos/page.tsx` — audit current content. Confirm the
  pricing-change clause from B7 is still accurate. Add the
  account-deletion + data-export rights from L3.
- `src/app/(public)/contacto/page.tsx` — new. Simple page: support
  email (mailto:), a Spanish copy block explaining response
  expectations ("respondemos en uno o dos días").
- `src/components/transactions/feed.tsx` (extend) — when the AI
  extractor surfaces a "tu banco no funcionó" path (L1/L2), the
  in-product feedback link goes to the support email with a
  pre-filled subject including the bank name + file shape.
- (Implementation step, not a file) — fresh-user walkthrough. The
  founder (or a trusted friend) creates a brand-new account, walks
  every flow: signup → onboarding → import → dashboard → score
  detail → reports → settings → billing → delete. Every blocker
  becomes a sub-task within this batch.

**Acceptance criteria (6 items):**

- [ ] `/privacidad` mentions Stripe, Resend, Anthropic explicitly
      as data processors.
- [ ] `/terminos` covers account deletion + data export user rights.
- [ ] `/contacto` is reachable from the footer + the "tu banco no
      funcionó" path.
- [ ] Fresh-user walkthrough documented (markdown checklist in
      this batch's PR) with every blocker addressed.
- [ ] Footer links updated to include `/contacto` and any newly-
      added pages.
- [ ] Full gate sweep green.

**Risk notes:**

- The walkthrough surfaces unknown unknowns by definition. Budget
  half the batch's time for walkthrough fixes.
- Legal advice on the policies is out of scope — we'll ship with
  policies that are honest descriptions of what we do (Rule 1
  compliance) but not lawyer-reviewed. Flag for post-launch.

**Dependencies:** L3 + L4 + L5 for honest description of what
the policies need to cover.

---

### Batch L7 — Launch checklist

**Goal:** Verify everything works in production with real Stripe
live mode, real Resend domain, real Supabase prod. Run the final
smoke test. Flip the lights on.

**This batch is mostly operational, not code-writing. Acceptance
items are verification tasks the founder runs personally.**

**Files (small set):**

- `docs_operations/_LAUNCH_CHECKLIST.md` — checklist + status as
  this batch executes. Captures the verification outcomes so
  future launches have a template.
- `vercel.json` — confirm no `crons` array (per ADR-002).
- `src/app/sitemap.ts` / `robots.ts` — basic SEO hygiene if not
  present. Allow `/` + `/precios` + `/contacto` + `/privacidad` +
  `/terminos`; disallow `/dashboard/*` + `/transacciones/*` +
  `/api/*` (already private by auth, but defensive).
- A tiny `src/lib/observability/log.ts` if we want structured logs
  (decide in-batch; OK to defer if `console.error` is honest enough
  for beta scale). Doesn't have to wire anything external.

**Acceptance criteria (7 items):**

- [ ] Stripe in LIVE mode: founder signs up with a real card,
      verifies trial, fast-forwards in Stripe dashboard to trigger
      a real $1 charge, sees the charge land, sees the receipt
      arrive in inbox.
- [ ] Resend in production with the real sending domain (SPF + DKIM
      records configured); welcome email arrives in inbox (not
      spam) for a new sign-up.
- [ ] Supabase prod backup is configured (Supabase dashboard
      setting); founder verifies the most recent backup is < 24h
      old.
- [ ] Production smoke test from a NEW browser: anonymous sees the
      landing page, can navigate to `/precios` + `/contacto` +
      `/privacidad` + `/terminos`, can sign up, can import a real
      bank statement, can see their dashboard, can change settings,
      can delete the account.
- [ ] Domain decision documented (vercel.app subdomain stays for
      beta unless the founder bought a custom domain — either is
      fine, but the choice gets recorded).
- [ ] Beta invite mechanism: per ADR (or pinned in this batch's
      notes if not separately ADR'd), the launch is **open signup
      — anyone with the link can register**. Documented + reasoned.
- [ ] Final go/no-go ceremony: founder reviews the punch list, no
      unresolved blockers, signs off, sends the first beta invite
      link.

**Risk notes:**

- This batch is mostly checklist-running, but checklist-running has
  a way of finding bugs. Allow time for last-mile fixes.
- "Done" for the launch is "the first beta link goes out". Anything
  found AFTER that is post-launch debt, not L7 scope.

**Dependencies:** All prior L batches.

---

## 3. What's IN vs OUT vs DEFERRED

**IN (must ship in Phase L):**

- Universal ingestion engine (CSV + PDF + AI-assisted column
  mapping + user confirm flow)
- Settings page (profile, email change, password reset, account
  deletion, data export)
- Transactional email infrastructure (Resend) with 5 templates
- Stripe live billing ($1/mo individual, trial → paid)
- Privacy + terms + support polish
- Production launch checklist + first beta invites

**OUT (will NOT ship in Phase L):**

- Phase 5 (Accounting / Contabilidad)
- Phase 8 (Gamification — XP, streaks, missions, badges, leaderboard)
- Phase 9 (Settings polish beyond L3 — notifications config, audit
  log UI, etc.)
- Phase 10 (DEMO marketing surface beyond the frozen kit; FEL/TPV
  adapters)
- Phase 11 (Hardening audits — perf, a11y, security audit, runbook)
- BUSINESS-tier features (Canal Contable multi-org, team invitations,
  white-label, FEL/TPV)
- Bank API connections
- Custom report builder, what-if simulator, scheduled emailed
  reports
- Capacitor mobile shell, push notifications
- Dark mode
- Multi-currency beyond GTQ/USD
- Country adapters (SV, HN, CR, etc.)
- Sentry / PostHog / Better Stack full wiring (basic decision in
  L7 if any)
- Python FastAPI AI microservice (current in-process TS is fine
  for L1's per-import AI calls)

**DEFERRED (carry-over from P67 retrospective §4 — still deferred
unless naturally addressed by an L batch):**

- AI improvement-action generator (rule-based fallback stays;
  L1's extractor is a different AI use)
- Sankey chart (BUSINESS trigger)
- pg_trgm GIN index (load-driven)
- RUNNING-job reaper (load-driven)
- TanStack Virtual react-hooks warning (vendor fix)
- Multi-format ingestion beyond CSV+PDF: OFX, QIF, HTML-file
  parsing — guidance-only (browser print → PDF) in L2; native
  parsing post-launch

---

## 4. Total item count

| Batch                                 | Items                         |
| ------------------------------------- | ----------------------------- |
| L1 Universal ingestion engine         | 8                             |
| L2 PDF ingestion                      | 7                             |
| L3 Settings — account hygiene         | 8                             |
| L4 Transactional email infrastructure | 7                             |
| L5 Stripe live wiring                 | 8                             |
| L6 Pre-launch polish                  | 6                             |
| L7 Launch checklist                   | 7                             |
| **Total**                             | **51 items across 7 batches** |

## 5. Progress log

Format: `[checkbox] Batch L-N — Name · X/Y in batch · A/51 overall · commit <sha> · YYYY-MM-DD`.

> Update this list at the end of every batch before the commit. The
> commit that closes a batch MUST include this file's updated progress
> log so state is recoverable from `git log -p docs_operations/_PHASE_L_PLAN.md`.

- [ ] Batch L1 — Universal ingestion engine · 0/8 in batch · 0/51 overall
- [ ] Batch L2 — PDF ingestion · 0/7 in batch · 0/51 overall
- [ ] Batch L3 — Settings — account hygiene · 0/8 in batch · 0/51 overall
- [ ] Batch L4 — Transactional email infrastructure · 0/7 in batch · 0/51 overall
- [ ] Batch L5 — Stripe live wiring · 0/8 in batch · 0/51 overall
- [ ] Batch L6 — Pre-launch polish · 0/6 in batch · 0/51 overall
- [ ] Batch L7 — Launch checklist · 0/7 in batch · 0/51 overall

## 6. Open questions

Surfaced at plan-write time; resolve before the relevant batch
starts.

1. **L1/L2 — bank-sample collection.** The AI extractor needs real
   sample statements (CSV + PDF) for in-batch testing. Question
   for the founder: collect samples from 3–5 friends-and-family
   beta users BEFORE L1 starts, or use the founder's own statements
   only (faster but narrower test coverage)?

2. **L3 — email change flow.** Require password re-entry / magic-
   link re-auth before allowing email change? Default: yes (session
   hijack mitigation). Confirm in-batch.

3. **L4 — Supabase password-reset email.** Use Supabase's default
   (un-branded) or replace with our own custom flow (custom token
   table + custom reset page)? Default: use Supabase's default for
   MVP; custom flow is post-launch.

4. **L5 — Stripe event dedup.** New `StripeEventLog` table for
   idempotency tracking, or piggyback on `PendingJob`? Default:
   new tiny table; decide in-batch.

5. **L7 — domain.** vercel.app subdomain stays for beta, or buy a
   custom domain before L7? No technical blocker either way.

6. **L7 — basic error tracking.** Wire Sentry minimally in L7, or
   defer entirely? Default: defer; the `console.error` in
   `staleness.ts` + Vercel logs are honest enough for ≤20 beta
   users.

---

_Last updated: 2026-05-22, plan-write turn._
