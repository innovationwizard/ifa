# IFA — MVP Build Plan

> **Version:** 0.2 (READY — all §3 decisions locked; Phase 0 begins on user go-ahead)
> **Date:** 2026-04-20
> **Author:** Artificial Intelligence Developments
> **Builder:** Solo
> **Deadline:** None — best-in-the-world quality is the only criterion
> **Companion to:** `_THE_RULES.MD`, `_IFA_SCAFFOLDING.md`, `_IFA_DEFINITIONS_AND_REASONING.md`, `0_Inteligencia-Financiera-App-Guatemala.pdf`

---

## 0. How to read this document

This plan is a **full work-breakdown** at the story level — every story has acceptance criteria, dependencies, and a complexity estimate. It is **not** a project-management Gantt chart; with no deadline and a solo builder, sequencing matters more than dates.

The plan is organized as:

- **§1–§5**: Decisions, deltas, conventions (read once)
- **§6–§17**: Phases 0–11, each containing concrete stories
- **§18–§21**: Cross-cutting requirements, gates, risks, deferred scope (reference)

**Authority hierarchy** (when this plan conflicts with another document):

1. `_THE_RULES.MD` (always wins)
2. Decisions in §3 of this plan, once confirmed
3. `_IFA_SCAFFOLDING.md` and `_IFA_DEFINITIONS_AND_REASONING.md`
4. This plan

**Rule 4 reminder** (no fake data, no exceptions): every story below that touches data — seeds, fixtures, demo flows — calls out explicitly whether the data is **real** (sourced from an authoritative external publication and cited), **synthetic-isolated** (test fixtures gated by environment per the Rule 4 intent clarification in `_THE_RULES.MD`), or **deferred** (story cannot complete until real data arrives).

---

## 1. Inputs & Constraints (locked from `clarifying_questions_1.md`)

| Dimension            | Decision                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Granularity          | Full work breakdown with acceptance criteria                                                                                 |
| MVP scope            | All P0 features across all 7 modules (Dashboard, Transactions, Contabilidad, Reportes, Inteligencia, Logros, Configuración)  |
| Plan horizon         | MVP only — Phase 2 (Central America) and beyond are out of scope here                                                        |
| Builder              | Solo                                                                                                                         |
| Deadline / budget    | None — quality bar is "best in the world"                                                                                    |
| Repo shape           | Single Next.js 15 App Router project (no Turborepo for MVP)                                                                  |
| AI service           | TypeScript only — no Python microservice for MVP                                                                             |
| Provisioned accounts | GitHub, Vercel, Supabase, Anthropic                                                                                          |
| Not provisioned      | AWS, Auth0, Sentry, Axiom, OneSignal, Better Stack, PostHog, Resend, custom domain                                           |
| FEL partners         | None yet — MVP is the POC for partnership pitches                                                                            |
| TPV partners         | None yet — MVP is the POC for partnership pitches                                                                            |
| Pilot SMEs           | None yet — MVP is the POC for pilot recruitment                                                                              |
| Subscription billing | Deferred until post-launch                                                                                                   |
| Legal review         | Deferred until traction is shown to legal department                                                                         |
| Brand / domain       | None yet — use name "Inteligencia Financiera App" / abbrev "IFA"; logo/favicon/OG via a `lucide-react` icon (TBD in §3)      |
| Multi-tenancy nuance | Single Org per User in MVP; `organizationId` column still present on every scoped table for future Canal Contable activation |

---

## 2. Architecture deltas vs. `_IFA_SCAFFOLDING.md`

The scaffolding was written for an AWS-native, multi-service architecture. With only Supabase + Vercel + Anthropic provisioned and a solo builder, the MVP architecture compresses to a single Next.js app backed by Supabase. **Every delta below has a documented "re-introduction trigger"** so we know exactly when to revisit.

| Concern            | Scaffolding choice                          | MVP choice                                                                                              | Reason                                                                             | Re-introduction trigger                                     |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Database           | AWS Aurora Serverless v2                    | **Supabase Postgres**                                                                                   | Already provisioned; same Postgres engine                                          | Multi-region expansion or > 8GB DB                          |
| Auth               | Auth0                                       | **Supabase Auth** (email/password + TOTP MFA)                                                           | Auth0 not provisioned; Supabase Auth is included                                   | Need for SAML federation to bank partners                   |
| File storage       | AWS S3                                      | **Supabase Storage**                                                                                    | Already included with Supabase                                                     | None expected for MVP                                       |
| Background jobs    | AWS Lambda + SQS + EventBridge              | **Vercel Cron + Supabase Edge Functions + a Postgres-backed job queue**                                 | Sufficient for nightly score, FEL polling, mission rotation                        | Sustained > 1k jobs/min, or jobs > 60s of compute           |
| Cache              | ElastiCache Redis                           | **Postgres + in-memory** for MVP                                                                        | Adds infra without clear MVP benefit                                               | Health-score read latency > 200 ms p95                      |
| AI service         | Python FastAPI on App Runner                | **In-process TypeScript** (Claude API + numeric libs)                                                   | Per locked decision; simpler critical path                                         | ML model complexity exceeds what TS can express comfortably |
| Email              | AWS SES + React Email                       | **In-app notifications only** for MVP; transactional email handled by Supabase Auth (signup/reset only) | Avoids provisioning Resend/SES until needed                                        | Need for marketing email, weekly digests, or invites        |
| Push notifications | OneSignal                                   | **Deferred**                                                                                            | Post-MVP feature for Capacitor mobile                                              | Capacitor build kicks off                                   |
| Error tracking     | Sentry                                      | **Vercel built-in** for MVP; structured `console.error` with request IDs                                | Sentry not provisioned                                                             | First real pilot user onboarded                             |
| Log aggregation    | Axiom                                       | **Vercel logs**                                                                                         | Axiom not provisioned                                                              | Log volume exceeds Vercel retention or compliance needs     |
| Product analytics  | PostHog                                     | **Deferred**                                                                                            | PostHog not provisioned; MVP has no real users yet                                 | First real pilot user onboarded                             |
| Uptime monitoring  | Better Stack                                | **Deferred**                                                                                            | No external traffic until pilots                                                   | First real pilot user onboarded                             |
| ORM                | Prisma 6                                    | **Prisma 6** (unchanged)                                                                                | Works against Supabase Postgres with `pgbouncer=true` + `directUrl` for migrations | None                                                        |
| Frontend hosting   | Vercel                                      | **Vercel** (unchanged)                                                                                  | None                                                                               |
| Charts             | Recharts + D3                               | **Recharts only** (RadialBarChart for the score gauge)                                                  | Recharts can render the gauge; D3 only if a future chart truly needs it            | Custom visualization Recharts cannot express                |
| Multi-tenancy      | Shared DB + Prisma middleware row filtering | **Same** — but Org switcher UI deferred (§H locked single-org-per-user for MVP)                         | Reduces UI surface                                                                 | Canal Contable activation                                   |
| Domain             | Custom IFA domain                           | **`*.vercel.app` URL** for MVP                                                                          | Domain not provisioned                                                             | Pre-pilot launch                                            |

---

## 3. Decisions locked (was "open" in v0.1)

All decisions resolved on 2026-04-20. Recorded here for traceability.

### D-1. Demo data strategy — **LOCKED: D-1.B with "impressive showcase" mandate**

DEMO mode is the chosen path **and** it must be an impressive showcase designed to ease adoption by non-technical, non-financial users. This raises the bar from "credible synthetic data" to "narrative-driven, visually rich, instantly comprehensible by a small business owner who has never used accounting software."

Implications baked into S-10.7:

- Demo organization tells a coherent story (a real-feeling Guatemalan small business — e.g., a bakery in Antigua, a boutique in Zona 10 — with 6+ months of history)
- Health Score visibly improves over the demo period to demonstrate the product's value
- Every module shows non-trivial state: missions in progress + completed, badges earned, anomalies detected and explained, a meaningful IVA tracking story, AI-generated insights in plain Spanish
- Onboarding tour available inside DEMO mode to show every feature without the user needing to set anything up
- Persistent banner: "MODO DEMO — Datos Sintéticos. No usar para decisiones reales." (mandated by Rule 4)
- Synthetic data files clearly headed `// SYNTHETIC TEST FIXTURE — NOT FOR PRODUCTION USE`
- Environment-gated: never deployable to the production environment; CI assertion enforces

### D-2. Logo / favicon / OG icon — **LOCKED: `HandCoins` from `lucide-react`**

Used for full lockup, compact, and icon-only variants per S-0.6.

### D-3. Auth method — **LOCKED: Supabase Auth, email/password, MFA recommended (not required)**

MFA is **strongly suggested** for OWNER role during onboarding and via a recurring nudge in the dashboard, but the user can skip enrollment. S-2.6 updated accordingly. (Rationale: forcing MFA on non-tech SME owners during MVP onboarding is an adoption killer; we recommend it with clear language about the security benefit.)

### D-4. ORM connection strategy — **LOCKED**

`DATABASE_URL` (pooled, `pgbouncer=true&connection_limit=1`) for runtime; `DIRECT_URL` (5432) for `prisma migrate`. Implemented in S-1.2.

### D-5. Database environments — **LOCKED: Single Supabase project, single prod branch**

One Supabase project named `ifa`. The `main` branch IS production. Local development uses Supabase CLI for a local Postgres mirror. Migrations applied via `prisma migrate deploy` directly to the prod branch after green local + CI verification. S-1.1 updated.

(Rationale: this is an MVP with a solo builder and no live users yet — separate dev/staging/prod adds operational overhead without payoff. When the first pilot is onboarded, we revisit by introducing a Supabase preview branch for development.)

### D-6. Real chart of accounts source — **LOCKED: IGCPA / IFRS Foundation NIIF-PYME**

Source from authoritative publications. Cite source (publisher, edition, URL, retrieval date) in the seed file header. S-1.11 implements.

### D-7. SAT XML report format — **LOCKED: Deferred to post-MVP**

S-6.10 ships an honest "Próximamente — pendiente de validación SAT" placeholder. PDF and CSV exports cover the export need until the spec is verified from an official SAT source.

### D-8. Resend (transactional email) — **LOCKED: Deferred**

Supabase Auth's built-in SMTP covers signup confirmation + password reset. No invites needed (Canal Contable deferred per locked H).

---

## 4. Phasing strategy

**Critical-path principle for solo work:** every phase produces something demonstrable to a partner or pilot. Phases are sequential because a single builder cannot parallelize meaningfully; within a phase, stories can sometimes be reordered.

| Phase | Theme                            | Demonstrable outcome                                                                                   |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0     | Foundation                       | Empty Next.js app deploys to Vercel with design system, lint/type/test/CI gates green                  |
| 1     | Data layer                       | Supabase + Prisma schema applied, multi-tenancy + audit middleware verified                            |
| 2     | Auth & Onboarding                | A user can sign up, complete onboarding, and land on a (still empty) dashboard                         |
| 3     | Transactions                     | A user can upload a CSV, see a transaction feed, manually create transactions                          |
| 4     | Reconciliation                   | The reconciliation engine matches FEL DTEs to TPV/bank lines (tested with synthetic-isolated fixtures) |
| 5     | Contabilidad                     | Auto-posting from reconciliation, manual journal entries, period close                                 |
| 6     | Reportes                         | P&L, Balance Sheet, Cash Flow, IVA, Bank Reconciliation, QuickBooks export                             |
| 7     | Inteligencia                     | AI categorization, anomaly detection, Health Score (TS engine), Health Score gauge on dashboard        |
| 8     | Logros                           | XP, levels, streaks, missions, badges, anonymous leaderboard                                           |
| 9     | Configuración polish             | Settings, MFA, audit log viewer, data export, account deletion                                         |
| 10    | Integration adapters & Demo Mode | FEL/TPV adapter scaffolds (CSV path live; API stubs ready for credentials), DEMO mode (pending D-1)    |
| 11    | Hardening & Pre-Launch           | E2E suite, performance/accessibility/security audits, runbook, optional Sentry/PostHog wiring          |

**Why this order:** Auth before data UI (can't test without an account). Transactions before reconciliation (engine has nothing to match without data). Reconciliation before contabilidad (auto-posting depends on matched transactions). Reportes before Inteligencia (Health Score reads from posted journal balances). Logros after Inteligencia (gamification rewards reference Health Score events). Adapters last because they're the only stories blocked by external partnerships.

---

## 5. Conventions for stories

```
### S-{phase}.{n}: Title
**Description:** One paragraph — what and why.
**Acceptance criteria:**
- [ ] Specific, testable
- [ ] ...
**Dependencies:** S-X.Y, S-X.Y (or "none")
**Complexity:** XS | S | M | L
  XS = < 2h | S = 2–8h | M = 1–3d | L = 3–7d
  (Anything XL must be split before work begins.)
**Files:** primary paths created/modified
**Rule-4 status:** real | synthetic-isolated | deferred | n/a
```

**Definition of Done** (applies to every story — see §19 for full gate):

- TypeScript strict, zero `any`, zero `@ts-ignore` without a `// why:` comment citing a hidden constraint
- Lint clean (no `eslint-disable` without `// why:`)
- Unit tests for pure logic; integration tests for cross-module flows; E2E for golden paths
- Accessibility verified (keyboard navigation, focus ring, screen-reader labels for all interactive elements)
- Spanish copy reviewed (es-GT)
- No mock or sample business data committed to the repo (Rule 4)

**Branch naming:** `phase-{n}/s-{phase}.{n}-short-slug` (e.g., `phase-3/s-3.5-csv-import-wizard`)
**Commit style:** Conventional Commits (`feat(transactions): ...`, `fix(reconciliation): ...`, `chore(deps): ...`)
**PR title:** `[S-X.Y] Title`

---

## 6. Phase 0 — Foundation

**Goal:** A Next.js 15 app with the Confianza design system, every quality gate, and a green Vercel deployment, against an empty Supabase project.

### S-0.1: Initialize repository

**Description:** Initialize git, write `.gitignore` and `.gitattributes`, create README skeleton.
**Acceptance criteria:**

- [ ] `git init`, first commit, push to GitHub `main` branch
- [ ] `.gitignore` covers `node_modules`, `.next`, `.env*` (except `.env.example`), `coverage`, `.vercel`, `playwright-report`, `test-results`
- [ ] README states product name, abbreviation, current status, link to genesis docs
      **Dependencies:** none
      **Complexity:** XS
      **Files:** `.gitignore`, `.gitattributes`, `README.md`
      **Rule-4 status:** n/a

### S-0.2: Bootstrap Next.js 15 (App Router, TypeScript strict)

**Description:** `pnpm create next-app` with App Router, TS, Tailwind, ESLint. Tighten `tsconfig.json` to `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. Add path alias `@/*` → `./src/*`.
**Acceptance criteria:**

- [ ] `pnpm dev` serves a placeholder page
- [ ] `pnpm build` succeeds
- [ ] `pnpm tsc --noEmit` green with the stricter flags
      **Dependencies:** S-0.1
      **Complexity:** S
      **Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

### S-0.3: ESLint + Prettier (flat config, no suppressions baseline)

**Description:** Configure flat-config ESLint with `eslint-config-next`, `@typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-plugin-tailwindcss`. Prettier with 2-space indent, single quotes, trailing commas. Forbid `eslint-disable` and `@ts-ignore` without a `// why:` comment via custom rule (or PR review checklist if no good plugin exists).
**Acceptance criteria:**

- [ ] `pnpm lint` green on bootstrapped app
- [ ] Prettier integrated as ESLint rule (`eslint-plugin-prettier`) or pre-commit only
      **Dependencies:** S-0.2
      **Complexity:** S
      **Files:** `eslint.config.mjs`, `.prettierrc`, `.prettierignore`

### S-0.4: Tailwind CSS 4 with Confianza palette tokens

**Description:** Configure Tailwind 4 via the CSS-native `@theme` directive (Tailwind 4 no longer uses `tailwind.config.ts`). Define every color token from `_IFA_SCAFFOLDING.md` §5.1 as theme variables in `globals.css`. Expose them as Tailwind utilities (`bg-ifa-navy-800`, `text-ifa-teal-600`, etc.). Define the radius, shadow, transition, and focus-ring tokens from §5.3.
**Acceptance criteria:**

- [x] All 23 color tokens from scaffolding §5.1 accessible as Tailwind classes (6 navy + 4 teal + 3 gold + 4 semantic + 5 gray + 1 white — earlier draft said 26, which was a miscount)
- [x] Visual smoke test page at `/design-system` (dev-only via `NODE_ENV` + `notFound()` gate) renders every token swatch with hex label. Path differs from earlier draft `/_design` because Next.js App Router treats `_folders` as private (non-routable).
- [x] Focus ring matches `2px solid var(--ifa-teal-500) offset 2px`, applied globally via `:focus-visible` and available as `.ifa-focus-ring` utility
      **Dependencies:** S-0.2
      **Complexity:** S
      **Files:** `src/app/globals.css`, `src/app/design-system/page.tsx`

### S-0.5: shadcn/ui installation and IFA-tuned base components

**Description:** Initialize shadcn/ui. Install the primitives we will need across the app: `button`, `input`, `select`, `textarea`, `dialog`, `sheet`, `dropdown-menu`, `tabs`, `table`, `toast`, `tooltip`, `card`, `badge`, `skeleton`, `command`, `form`, `separator`, `popover`, `progress`, `radio-group`, `checkbox`, `switch`, `label`, `avatar`, `alert`. Override theme to use Confianza tokens.
**Acceptance criteria:**

- [ ] `/_design` page extended to render every installed component in default + variant states
- [ ] All components use `--ifa-*` tokens, not shadcn defaults
      **Dependencies:** S-0.4
      **Complexity:** M
      **Files:** `components.json`, `src/components/ui/*`

### S-0.6: Lucide React + IFA logo (`HandCoins`)

**Description:** Install `lucide-react`. Implement the IFA logo using the `HandCoins` icon (locked in D-2) wrapped with the wordmark "IFA" / "Inteligencia Financiera App". Variants: full lockup (sidebar), abbreviated (top bar), icon-only (favicon/OG).
**Acceptance criteria:**

- [ ] `<Logo />` component supports `variant="full" | "compact" | "icon"`
- [ ] Uses `HandCoins` from `lucide-react` exclusively
- [ ] Renders correctly on light and (future) dark backgrounds
- [ ] Color overridable via prop; defaults align with `--ifa-navy-800` for marks on light surfaces and `--ifa-white` on dark surfaces
      **Dependencies:** S-0.5
      **Complexity:** S
      **Files:** `src/components/branding/logo.tsx`

### S-0.7: Favicon, app icons, OG image (dynamic via `next/og`)

**Description:** Generate SVG favicon from the chosen lucide icon. Configure `app/icon.tsx` and `app/apple-icon.tsx`. Implement `app/opengraph-image.tsx` that renders the IFA wordmark + tagline using `next/og`.
**Acceptance criteria:**

- [ ] Favicon visible in browser tab in dev
- [ ] OG image renders in social previews (verify with `npx @vercel/og` or local fetch)
- [ ] Apple touch icon at correct size
      **Dependencies:** S-0.6
      **Complexity:** S
      **Files:** `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/app/opengraph-image.tsx`

### S-0.8: `next-intl` with es-GT locale

**Description:** Install `next-intl`. Configure App Router middleware-free setup (since MVP is monolingual, no locale prefix in URL). Create `src/messages/es-GT.json` with starter keys (nav, common buttons, errors). Wire `useTranslations` and `getTranslations`.
**Acceptance criteria:**

- [ ] All UI text reads from `es-GT.json` — zero hardcoded user-facing strings
- [ ] ESLint rule or convention prevents string literals in JSX (warn-only initially)
- [ ] Number and date formatting uses `Intl.NumberFormat('es-GT', ...)` and `Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala' })`
      **Dependencies:** S-0.2
      **Complexity:** S
      **Files:** `src/i18n/*`, `src/messages/es-GT.json`, `next.config.ts`

### S-0.9: Inter + JetBrains Mono via `next/font`

**Description:** Load Inter (variable) and JetBrains Mono (subset for digits + punctuation) via `next/font/google`. Apply Inter as `--font-sans`, JetBrains Mono as `--font-mono`. Map to Tailwind `font-sans` / `font-mono`. Create a `<Money />` component that uses `font-mono` + `tabular-nums` + locale-aware formatting.
**Acceptance criteria:**

- [ ] No FOUT in Vercel preview
- [ ] `<Money amount={1234.56} currency="GTQ" />` renders `Q 1,234.56` with aligned decimals
- [ ] Negative values render in parentheses: `(Q 1,234.56)` per scaffolding §12.3
      **Dependencies:** S-0.4
      **Complexity:** S
      **Files:** `src/app/layout.tsx`, `src/components/primitives/money.tsx`

### S-0.10: Vitest + Testing Library

**Description:** Install Vitest, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`. Configure `vitest.config.ts` with React + jsdom, path aliases. Smoke test for `<Money />`.
**Acceptance criteria:**

- [ ] `pnpm test` runs in < 5s on a clean checkout
- [ ] `<Money />` test passes (positive, negative, GTQ, USD)
- [ ] Coverage report writes to `coverage/`
      **Dependencies:** S-0.9
      **Complexity:** S
      **Files:** `vitest.config.ts`, `vitest.setup.ts`, `src/components/primitives/money.test.tsx`

### S-0.11: Playwright (E2E smoke)

**Description:** Install Playwright. Configure `playwright.config.ts` for Chromium + Firefox + WebKit, with traces on retry. One smoke test: load `/`, assert page title contains "IFA".
**Acceptance criteria:**

- [ ] `pnpm e2e` passes locally and in CI
- [ ] Trace artifact uploaded on failure
      **Dependencies:** S-0.2
      **Complexity:** S
      **Files:** `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

### S-0.12: Husky + lint-staged (pre-commit gate)

**Description:** Install Husky and lint-staged. Pre-commit runs ESLint + Prettier on staged files and `tsc --noEmit` on the whole project.
**Acceptance criteria:**

- [ ] Committing a file with a lint error blocks the commit
- [ ] Hooks run in < 30s on this repo
      **Dependencies:** S-0.3, S-0.10
      **Complexity:** S
      **Files:** `.husky/pre-commit`, `package.json` (`lint-staged` config)

### S-0.13: GitHub Actions CI

**Description:** Workflow `ci.yml` runs on PR and on push to `main`: install (pnpm cache), lint, typecheck, unit test (with coverage upload), Playwright E2E. Fail the workflow on any red step.
**Acceptance criteria:**

- [ ] PR cannot be merged with a red CI badge (branch protection enabled separately by the user)
- [ ] CI runs in < 6 minutes on this repo at MVP scope
      **Dependencies:** S-0.10, S-0.11, S-0.12
      **Complexity:** M
      **Files:** `.github/workflows/ci.yml`

### S-0.14: Vercel project & environment variables

**Description:** Connect repo to Vercel. Configure `production` and `preview` environments. Document required env vars in `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `ANTHROPIC_API_KEY`, `DEMO_MODE`. Configure preview deployments to use the dev Supabase project.
**Acceptance criteria:**

- [ ] Pushing to `main` deploys to production
- [ ] Opening a PR creates a preview URL
- [ ] No secret committed to the repo (verified by `git secrets` or `gitleaks` in CI — separate story if not bundled here)
      **Dependencies:** S-0.2
      **Complexity:** S
      **Files:** `.env.example`, Vercel dashboard config (manual)

### S-0.15: App shell — sidebar + top bar layout

**Description:** Implement the navigation chrome from `_IFA_SCAFFOLDING.md` §6.4. Sidebar (collapsible, navy bg, 7 module links + separator + Configuración + Ayuda). Top bar (logo, future Org switcher placeholder, notification bell placeholder, user avatar dropdown). Pure presentational at this stage — links route to placeholder pages.
**Acceptance criteria:**

- [ ] Sidebar collapses to icons-only at < 1024px viewport
- [ ] All navigation items keyboard-reachable with visible focus ring
- [ ] All copy from `es-GT.json`
- [ ] Lighthouse accessibility score ≥ 95 on the shell route
      **Dependencies:** S-0.5, S-0.6, S-0.8
      **Complexity:** M
      **Files:** `src/app/(app)/layout.tsx`, `src/components/shell/sidebar.tsx`, `src/components/shell/top-bar.tsx`

### S-0.16: Error boundary + global error/loading/not-found

**Description:** Implement App Router `error.tsx`, `loading.tsx`, `not-found.tsx` at the root and inside the `(app)` group. Errors log structured JSON to console (with request ID); user-facing copy is in Spanish.
**Acceptance criteria:**

- [ ] Throwing in a server component renders the `error.tsx` UI, not a stack trace
- [ ] Error UI offers "reintentar" and "volver al inicio" actions
- [ ] Error log includes timestamp, route, error message, stack (in dev only)
      **Dependencies:** S-0.15
      **Complexity:** S
      **Files:** `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/not-found.tsx`, plus the same trio inside `(app)/`

---

## 7. Phase 1 — Data layer & multi-tenancy

**Goal:** Supabase project provisioned, full Prisma schema applied, multi-tenancy and audit middleware verified by integration tests.

### S-1.1: Provision Supabase project (`ifa`)

**Description:** Create a single Supabase project named `ifa` (per locked D-5). Capture connection strings, anon/service role keys, JWT secret. Configure region closest to Guatemala (`us-east-1` or `us-east-2`). Local development uses Supabase CLI for a local Postgres mirror; the project's `main` branch IS production. Migrations applied via `prisma migrate deploy` after green CI.
**Acceptance criteria:**

- [ ] Project created; `.env.local` populated for local dev pointing to local Supabase CLI Postgres
- [ ] `.env.production` (Vercel) points to the prod Supabase
- [ ] `psql` connection succeeds from local
- [ ] Point-in-time recovery (PITR) enabled on prod when budget permits — flagged as a pre-launch item, not MVP-blocking
      **Dependencies:** none
      **Complexity:** S (manual)
      **Files:** `.env.local` (gitignored), `.env.example`
      **Rule-4 status:** n/a

### S-1.2: Prisma installation + dual connection strategy

**Description:** Install Prisma 6 + `@prisma/client`. Configure `schema.prisma` with `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`. Add `previewFeatures = ["postgresqlExtensions"]` for `pgcrypto` and `pg_trgm` (for full-text search).
**Acceptance criteria:**

- [ ] `pnpm prisma db push` succeeds against `ifa-dev`
- [ ] Generated client importable as `@/lib/db/prisma`
      **Dependencies:** S-1.1
      **Complexity:** S
      **Files:** `prisma/schema.prisma`, `src/lib/db/prisma.ts`

### S-1.3: Prisma schema — Identity & tenancy

**Description:** Encode `User`, `Organization`, `OrganizationMember` per scaffolding §11.1. `User.id` references the Supabase Auth user UUID (not generated by Prisma). `OrganizationMember` exists in schema even though MVP is single-org-per-user — its UI is deferred but the model supports future Canal Contable.
**Acceptance criteria:**

- [ ] Migration applies cleanly
- [ ] Indexes on `OrganizationMember(organizationId, userId)` unique constraint
- [ ] Seed creates one canonical "system" organization for ops use (real, not synthetic — flagged for ops only, never used for customer data)
      **Dependencies:** S-1.2
      **Complexity:** M
      **Files:** `prisma/schema.prisma` (additions)

### S-1.4: Prisma schema — Transactions & reconciliation

**Description:** Encode `Transaction`, `FelDteData`, `TpvTransactionData`, `Reconciliation`, `TransactionAudit` per scaffolding §11.2. Use `Decimal(12, 2)` for amounts, `Decimal(12, 4)` for IVA where higher precision matters. JSONB for source-specific `metadata` and `rawPayload`.
**Acceptance criteria:**

- [ ] Migration applies cleanly
- [ ] All foreign keys + cascade behavior explicit (no implicit cascade)
      **Dependencies:** S-1.3
      **Complexity:** M
      **Files:** `prisma/schema.prisma` (additions)

### S-1.5: Prisma schema — Accounting

**Description:** Encode `Account`, `JournalEntry`, `JournalEntryLine`, `AccountingRule`, `AccountingPeriod` per scaffolding §11.3.
**Acceptance criteria:**

- [ ] `Account` self-relation supports parent/child hierarchy
- [ ] `JournalEntry` has `entryNumber` per-org via Postgres sequence (or computed at insert time inside a transaction)
- [ ] `unique(organizationId, year, month)` enforced on `AccountingPeriod`
      **Dependencies:** S-1.3
      **Complexity:** M
      **Files:** `prisma/schema.prisma` (additions)

### S-1.6: Prisma schema — Health Score, Gamification, Integrations, AuditLog, Notifications

**Description:** Encode `HealthScore`, `HealthScoreAction`, `GamificationProfile`, `XpEvent`, `Badge`, `UserBadge`, `Mission`, `UserMission`, `Integration`, `AuditLog`, `Notification` per scaffolding §11.4–11.6.
**Acceptance criteria:**

- [ ] `Integration.credentials` documented as KMS-encrypted; in MVP we use Supabase Vault or `pgcrypto`-backed encrypted column (whichever you confirm — flagged as a small open question inside this story)
- [ ] `AuditLog` has no `updatedAt` (immutable) and no UPDATE/DELETE Prisma client method exposed (enforced via repository wrapper in S-1.10)
      **Dependencies:** S-1.3
      **Complexity:** L
      **Files:** `prisma/schema.prisma` (additions)

### S-1.7: Database indexes (Appendix B of scaffolding)

**Description:** Apply every index from `_IFA_SCAFFOLDING.md` Appendix B as Prisma `@@index` directives or raw `CREATE INDEX` migrations where Prisma cannot express them (e.g., partial indexes).
**Acceptance criteria:**

- [ ] Migration applies cleanly
- [ ] `EXPLAIN` on a sample paginated transaction query uses the index
      **Dependencies:** S-1.4, S-1.5, S-1.6
      **Complexity:** S
      **Files:** `prisma/migrations/*`

### S-1.8: Prisma multi-tenancy middleware

**Description:** Implement Prisma extension that auto-injects `where: { organizationId }` on every query against tenant-scoped models. The current `organizationId` is read from a request-scoped context (AsyncLocalStorage). Throw if a tenant-scoped query is run with no context — fail-closed.
**Acceptance criteria:**

- [ ] Unit tests prove every tenant-scoped model is filtered (matrix: list, find, update, delete)
- [ ] Cross-tenant data leakage attempt throws `TenantContextMissingError`
- [ ] Non-tenant models (`User`, `Badge`) are unaffected
      **Dependencies:** S-1.6
      **Complexity:** L
      **Files:** `src/lib/db/tenancy.ts`, `src/lib/db/prisma.ts`, tests

### S-1.9: Audit log middleware

**Description:** Prisma extension that writes to `AuditLog` on every CREATE/UPDATE/DELETE, capturing entity type, entity ID, before/after diff, user ID (from context), IP, user-agent. Skip read operations.
**Acceptance criteria:**

- [ ] Sample mutation generates the expected `AuditLog` row
- [ ] Audit writes are best-effort: a failure to write the audit row logs an error but does not roll back the user mutation (compliance trade-off documented in code comment with `// why:`)
      **Dependencies:** S-1.8
      **Complexity:** M
      **Files:** `src/lib/db/audit.ts`

### S-1.10: Repository pattern + AuditLog immutability enforcement

**Description:** Wrap Prisma in a thin repository layer that exposes only the operations each model legitimately needs. `auditLog` repository exposes `create` and `find`/`findMany` only — never `update` or `delete`. All other consumer code imports from repositories, not from `prisma` directly (enforced by ESLint rule banning direct `@/lib/db/prisma` imports outside `src/lib/db/repositories/`).
**Acceptance criteria:**

- [ ] ESLint rule active and blocks direct prisma imports outside the allowed path
- [ ] AuditLog repository tests prove update/delete methods do not exist
      **Dependencies:** S-1.9
      **Complexity:** M
      **Files:** `src/lib/db/repositories/*`, ESLint config

### S-1.11: Seed — NIIF-PYME chart of accounts (real, sourced)

**Description:** Source the NIIF-PYME chart of accounts template from an authoritative publication (per D-6). Encode as a seed in `prisma/seed/chart_of_accounts.ts`. The seed file header cites the source (publisher, edition, URL, retrieval date). Each account has code, name (Spanish), type, parent code.
**Acceptance criteria:**

- [ ] Source citation present in file header
- [ ] Seed runs idempotently (`prisma db seed`)
- [ ] At least the canonical account ranges present: 1xxx Activos, 2xxx Pasivos, 3xxx Patrimonio, 4xxx Ingresos, 5xxx Costos, 6xxx Gastos
      **Dependencies:** S-1.10, D-6 confirmed
      **Complexity:** L
      **Files:** `prisma/seed/chart_of_accounts.ts`
      **Rule-4 status:** real (sourced and cited)

### S-1.12: Seed — Mission catalog

**Description:** Encode every mission from `_IFA_SCAFFOLDING.md` §9.1.4 (onboarding, weekly, monthly) as `Mission` rows.
**Acceptance criteria:**

- [ ] All mission names match scaffolding exactly (Spanish)
- [ ] Conditions encoded as JSONB predicates evaluable by the mission engine (S-8.4)
- [ ] Idempotent
      **Dependencies:** S-1.10
      **Complexity:** S
      **Files:** `prisma/seed/missions.ts`
      **Rule-4 status:** real (product-defined)

### S-1.13: Seed — Badge catalog

**Description:** Encode every badge category from §9.1.5 with id, name, description, icon (lucide name), category, condition, xpReward.
**Acceptance criteria:**

- [ ] All badge IDs follow `{category}_{slug}` convention (e.g., `streak_7`, `health_700`)
- [ ] Idempotent
      **Dependencies:** S-1.10
      **Complexity:** S
      **Files:** `prisma/seed/badges.ts`
      **Rule-4 status:** real (product-defined)

### S-1.14: Migration deploy procedure documented

**Description:** Document in `docs_operations/migrations.md` the exact procedure to apply migrations to production: snapshot first, run `prisma migrate deploy`, verify via smoke query, rollback procedure.
**Acceptance criteria:**

- [ ] Procedure rehearsed once on a throwaway copy of the DB
- [ ] Doc reviewed by you before any prod migration
      **Dependencies:** S-1.11
      **Complexity:** S
      **Files:** `docs_operations/migrations.md`

---

## 8. Phase 2 — Auth & Onboarding

**Goal:** A user signs up, confirms email, completes the 6-step onboarding wizard, and lands on the (still empty) dashboard.

### S-2.1: Supabase Auth client wiring (server + browser)

**Description:** Install `@supabase/ssr`. Implement `createServerClient` (used in route handlers + server components) and `createBrowserClient`. Configure cookie-based session.
**Acceptance criteria:**

- [ ] `getUser()` works in server components
- [ ] Session refreshes correctly via middleware
- [ ] No auth state mismatch between server and client
      **Dependencies:** S-1.1
      **Complexity:** M
      **Files:** `src/lib/auth/server.ts`, `src/lib/auth/browser.ts`, `src/middleware.ts`

### S-2.2: Auth middleware — route protection

**Description:** Next.js middleware redirects unauthenticated requests to `/login` for routes under `(app)/*` and `/onboarding/*`. Authenticated requests to `/login` redirect to `/dashboard` (or `/onboarding/empresa` if onboarding incomplete).
**Acceptance criteria:**

- [ ] E2E test: anonymous request to `/dashboard` redirects to `/login`
- [ ] E2E test: authenticated user with incomplete onboarding hitting `/dashboard` redirects to next onboarding step
      **Dependencies:** S-2.1
      **Complexity:** M
      **Files:** `src/middleware.ts`

### S-2.3: `/login` page

**Description:** Email + password sign-in form using `react-hook-form` + Zod. Error states (invalid credentials, unconfirmed email, rate-limited) with Spanish copy. Link to `/registro` and `/recuperar-password`.
**Acceptance criteria:**

- [ ] Successful login redirects per S-2.2
- [ ] Invalid credentials shows generic "credenciales inválidas" (no enumeration)
- [ ] Form keyboard-navigable; submit on Enter
      **Dependencies:** S-2.2
      **Complexity:** M
      **Files:** `src/app/(public)/login/page.tsx`, `src/components/auth/login-form.tsx`

### S-2.4: `/registro` page + email confirmation flow

**Description:** Sign-up form (email, password, password confirmation). Sends Supabase confirmation email. Confirmation link lands on `/auth/callback`, which marks email confirmed and redirects to `/onboarding/empresa`. After successful sign-up but before confirmation, render a "Revisa tu correo" page.
**Acceptance criteria:**

- [ ] Password strength meter (zxcvbn or similar) with es-GT labels
- [ ] Terms acceptance checkbox (links to placeholder `/terminos` and `/privacidad` — content deferred to legal review per locked decisions)
- [ ] Confirmation email arrives in inbox (Supabase default SMTP for MVP per D-8)
      **Dependencies:** S-2.3
      **Complexity:** M
      **Files:** `src/app/(public)/registro/page.tsx`, `src/app/auth/callback/route.ts`

### S-2.5: Password reset flow

**Description:** `/recuperar-password` form requests reset email. Reset email lands on `/auth/reset-password` with new-password form.
**Acceptance criteria:**

- [ ] Whole flow E2E tested
- [ ] Old password no longer works after reset
      **Dependencies:** S-2.4
      **Complexity:** M
      **Files:** `src/app/(public)/recuperar-password/page.tsx`, `src/app/auth/reset-password/page.tsx`

### S-2.6: MFA setup (TOTP) — recommended, not required

**Description:** Settings → Seguridad UI to enroll TOTP authenticator (Google Authenticator, 1Password, etc.). On next sign-in for MFA-enrolled users, prompt for 6-digit code. Per locked D-3, MFA is **strongly recommended** for OWNER but **not enforced**: a non-blocking nudge appears in the onboarding tour and as a recurring dashboard banner until enrolled or explicitly dismissed.
**Acceptance criteria:**

- [ ] OWNER user can reach `/dashboard` without MFA, but sees a persistent "Recomendamos activar verificación en dos pasos" banner with one-click enrollment
- [ ] Banner dismissible for 7 days, then reappears
- [ ] Authenticator QR generated correctly
- [ ] Backup codes generated and downloadable once at enrollment
- [ ] Copy emphasizes the security benefit in plain Spanish without scaring non-technical users
      **Dependencies:** S-2.5
      **Complexity:** L
      **Files:** `src/app/(app)/configuracion/seguridad/page.tsx`, `src/lib/auth/mfa.ts`, `src/components/security/mfa-nudge.tsx`

### S-2.7: User → Organization sync on first sign-in

**Description:** On first authenticated request, ensure a `User` row exists in our DB matching the Supabase Auth UUID. If no `Organization` is associated, route to `/onboarding/empresa`. This is the bridge between Supabase Auth identity and our Prisma data model.
**Acceptance criteria:**

- [ ] No race condition: if two requests fire concurrently for a new user, only one `User` row is created (use `INSERT ... ON CONFLICT DO NOTHING`)
      **Dependencies:** S-2.1, S-1.10
      **Complexity:** M
      **Files:** `src/lib/auth/ensure-user.ts`

### S-2.8: NIT validation utility

**Description:** Implement Guatemala NIT check-digit algorithm (modulo-11 with weights). Used in onboarding and any place a NIT is entered.
**Acceptance criteria:**

- [ ] Unit tests against published valid/invalid NIT examples (from SAT or accounting publications — sourced, not invented)
- [ ] Handles `CF` ("Consumidor Final") as a valid placeholder
      **Dependencies:** none
      **Complexity:** S
      **Files:** `src/lib/validators/nit.ts`, tests
      **Rule-4 status:** real (algorithm sourced from SAT publication)

### S-2.9: `/onboarding/empresa` (Step 1 of 6)

**Description:** Form: business name, NIT (validated by S-2.8), industry type (dropdown — sourced from SCIAN-equivalent or Guatemala industry codes; flagged as a small sub-decision), fiscal regime (Pequeño Contribuyente / General). On submit, creates `Organization`, links to `User` as OWNER, advances to step 2.
**Acceptance criteria:**

- [ ] Industry list sourced and cited (Rule 4)
- [ ] Cannot submit with invalid NIT
- [ ] On error, form preserves all entered values
      **Dependencies:** S-2.7, S-2.8
      **Complexity:** M
      **Files:** `src/app/onboarding/empresa/page.tsx`
      **Rule-4 status:** real (industry list sourced)

### S-2.10: `/onboarding/integraciones` (Step 2)

**Description:** UI presents three connection options: FEL certifier (dropdown, currently scaffolded — no live connection), CSV upload, "skip for now". Selected option creates an `Integration` row in `PENDING` state.
**Acceptance criteria:**

- [ ] Skipping advances to step 3 with no integration created
- [ ] CSV upload routes to the import wizard (built in S-3.5) for first-time use
- [ ] FEL dropdown shows GUATEFACTURAS/DIGIFACT/INFILE/G4S as options, with copy "Próximamente — estamos integrando con tu certificador" since no real partnership exists yet (honest, not misleading)
      **Dependencies:** S-2.9
      **Complexity:** M
      **Files:** `src/app/onboarding/integraciones/page.tsx`

### S-2.11: `/onboarding/reglas` (Step 3)

**Description:** Pre-seed the org's chart of accounts from the NIIF-PYME template (S-1.11). Show a summary: "Hemos preparado tu catálogo contable basado en NIIF-PYME. Puedes personalizarlo después en Contabilidad → Catálogo."
**Acceptance criteria:**

- [ ] On confirm, all `Account` rows for this org are created (transactionally)
- [ ] No mocked accounts — every account traces back to the NIIF-PYME seed
      **Dependencies:** S-2.10, S-1.11
      **Complexity:** M
      **Files:** `src/app/onboarding/reglas/page.tsx`

### S-2.12: `/onboarding/equipo` (Step 4 — skippable, MVP-deferred functionally)

**Description:** UI scaffold only — the actual invite flow is deferred (Canal Contable not in MVP per locked H). Page shows "Invitaciones disponibles próximamente" with a single "Continuar" button.
**Acceptance criteria:**

- [ ] No invite UI shipped (would imply functionality we don't have)
- [ ] Honest copy explaining current state
      **Dependencies:** S-2.11
      **Complexity:** XS
      **Files:** `src/app/onboarding/equipo/page.tsx`

### S-2.13: `/onboarding/meta` (Step 5)

**Description:** Form to set first financial goal — used as gamification seed. Choices: "Reducir gastos en X categoría", "Mejorar conciliación", "Aumentar ingresos en X%". Stored as a `Mission` of type `ONBOARDING` linked to the user's `GamificationProfile`.
**Acceptance criteria:**

- [ ] Goal stored, surfaces on dashboard later (S-7.x for dashboard wire-up)
      **Dependencies:** S-2.12
      **Complexity:** M
      **Files:** `src/app/onboarding/meta/page.tsx`

### S-2.14: `/onboarding/tour` (Step 6)

**Description:** Interactive walkthrough using a library (e.g., `driver.js` or custom tooltip overlay) that highlights 5 dashboard regions: Health Score gauge area, transaction feed link, reconciliation queue, reports hub, gamification sidebar. Tour can be skipped at any step.
**Acceptance criteria:**

- [ ] Tour can be re-launched from Configuración
- [ ] Completing tour marks `onboardingCompleted = true` on the Organization
- [ ] User redirected to `/dashboard` on completion
      **Dependencies:** S-2.13, S-0.15
      **Complexity:** L
      **Files:** `src/app/onboarding/tour/page.tsx`, `src/components/onboarding/tour.tsx`

### S-2.15: Onboarding state machine — resume from any step

**Description:** Server-side check: if user is mid-onboarding and navigates to any `/onboarding/*` step, they can only access steps up to and including the next required one. Direct navigation to a future step redirects to the next required step.
**Acceptance criteria:**

- [ ] E2E test: kill the browser mid-onboarding, return, land on the right step
      **Dependencies:** S-2.14
      **Complexity:** M
      **Files:** `src/lib/onboarding/state.ts`

---

## 9. Phase 3 — Transactions module

**Goal:** Users can upload CSV bank statements, manually create transactions, browse the unified transaction feed, search, filter, and view detail.

### S-3.1: Transaction repository + list query

**Description:** Repository method `transactions.list({ orgId, cursor, limit, filters })`. Filters: `source`, `reconciliationStatus`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `merchantNit`, `q` (full-text). Returns `{ data, nextCursor, hasMore }`.
**Acceptance criteria:**

- [ ] Cursor-based pagination (last `id` + `date`)
- [ ] Full-text search uses `pg_trgm` GIN index
- [ ] Indexes from S-1.7 used (verify via `EXPLAIN`)
      **Dependencies:** S-1.10
      **Complexity:** M
      **Files:** `src/lib/db/repositories/transactions.ts`

### S-3.2: Transaction list API route

**Description:** `GET /api/v1/transactions` with query parsing via Zod. Authenticated; tenant context from session. Standard envelope `{ data, meta }`.
**Acceptance criteria:**

- [ ] Zod validates every query param
- [ ] 401 if unauthenticated
- [ ] 200 returns paginated list
      **Dependencies:** S-3.1
      **Complexity:** S
      **Files:** `src/app/api/v1/transactions/route.ts`, `src/lib/validators/transactions.ts`

### S-3.3: Transaction detail API route

**Description:** `GET /api/v1/transactions/[id]` returns full canonical + source-specific data + reconciliation + journal entry lines + audit trail.
**Acceptance criteria:**

- [ ] 404 if not found OR if foreign-tenant (no enumeration)
- [ ] Includes `felData` and `tpvData` if present
      **Dependencies:** S-3.2
      **Complexity:** S
      **Files:** `src/app/api/v1/transactions/[id]/route.ts`

### S-3.4: Manual transaction creation API

**Description:** `POST /api/v1/transactions` with Zod validation. Creates a `Transaction` with `source = MANUAL`, `reconciliationStatus = UNMATCHED`. Writes `TransactionAudit` (`CREATED`, `performedBy = USER`).
**Acceptance criteria:**

- [ ] Required: amount, date, type, description
- [ ] Optional: merchantNit (validated if present), categoryId
- [ ] Idempotency-Key header support (deduplicate accidental double-submits)
      **Dependencies:** S-3.3
      **Complexity:** M
      **Files:** `src/app/api/v1/transactions/route.ts` (POST handler)

### S-3.5: CSV import wizard (UI)

**Description:** Multi-step wizard: (1) upload, (2) detect/select column mapping, (3) preview first 20 rows with validation flags, (4) confirm + import. Uploaded file lands in Supabase Storage under `imports/{orgId}/{uuid}.csv`. Parsing uses `papaparse` streaming.
**Acceptance criteria:**

- [ ] Supports BAC, Banco Industrial, and generic CSV layouts (column auto-detect with confidence)
- [ ] Invalid rows shown but not blocking (user can choose "skip invalid" or "fix and re-upload")
- [ ] Up to 10MB file supported on Vercel (chunked parse if larger)
      **Dependencies:** S-3.4, Supabase Storage configured
      **Complexity:** L
      **Files:** `src/app/(app)/transacciones/importar/page.tsx`, `src/lib/imports/csv-parser.ts`, `src/lib/imports/column-detect.ts`

### S-3.6: CSV import API + idempotency

**Description:** `POST /api/v1/transactions/import` accepts a Storage object key + column mapping. Streams the CSV, creates `Transaction` rows in batches of 500. Per-row idempotency via a hash of `(date, amount, description, externalId)` to avoid double-import.
**Acceptance criteria:**

- [ ] Re-importing the same CSV twice creates zero duplicates
- [ ] Progress reported via response stream (or polling endpoint)
- [ ] Failures during streaming roll back the current batch only, not prior batches (documented)
      **Dependencies:** S-3.5
      **Complexity:** L
      **Files:** `src/app/api/v1/transactions/import/route.ts`, `src/lib/imports/runner.ts`

### S-3.7: Transaction feed UI (virtualized, filterable)

**Description:** `/transacciones` page. Table with virtualized rows (`@tanstack/react-virtual`). Column toggles (date, description, merchant, amount, status, source). Filter sidebar (date range, status, source, amount range). Search box (debounced 300ms).
**Acceptance criteria:**

- [ ] Smooth scrolling with 10k+ rows in dev
- [ ] Filter changes update URL query params (shareable)
- [ ] Empty state copy: "Aún no hay transacciones. Importa un CSV o conecta tu certificador FEL."
      **Dependencies:** S-3.2
      **Complexity:** L
      **Files:** `src/app/(app)/transacciones/page.tsx`, `src/components/transactions/feed.tsx`

### S-3.8: Transaction detail UI

**Description:** `/transacciones/[id]` route. Tabs: Resumen, Datos FEL (if present), Datos TPV (if present), Conciliación, Asientos contables, Auditoría.
**Acceptance criteria:**

- [ ] All sections render conditionally based on data presence
- [ ] Audit tab shows immutable timeline
- [ ] Edit affordances limited to non-posted transactions
      **Dependencies:** S-3.3
      **Complexity:** M
      **Files:** `src/app/(app)/transacciones/[id]/page.tsx`

### S-3.9: Reconciliation queue UI (placeholder, fully wired in Phase 4)

**Description:** `/transacciones/conciliacion` shows unmatched transactions. UI scaffold only — manual match action returns "próximamente" until S-4.6 ships. Filter by source.
**Acceptance criteria:**

- [ ] Renders unmatched transactions
- [ ] No fake match button that does nothing — UI states what is and isn't available
      **Dependencies:** S-3.7
      **Complexity:** S
      **Files:** `src/app/(app)/transacciones/conciliacion/page.tsx`

### S-3.10: Bulk actions

**Description:** Multi-select rows in the feed. Bulk actions: categorize, mark reviewed, export selected to CSV.
**Acceptance criteria:**

- [ ] Select-all respects current filter (only currently-visible-after-filter rows)
- [ ] Bulk categorize is async (job submitted, toast on completion)
- [ ] Export downloads a CSV of selected rows
      **Dependencies:** S-3.7
      **Complexity:** M
      **Files:** `src/components/transactions/bulk-actions.tsx`

### S-3.11: Duplicate detection

**Description:** When inserting a new transaction, compute the hash from S-3.6 and check against last 90 days of org transactions. If a match exists, flag the new transaction with a `metadata.possibleDuplicateOf` reference. UI shows a "Posible duplicado" badge.
**Acceptance criteria:**

- [ ] Detection runs synchronously on insert (< 50ms additional latency)
- [ ] User can dismiss the flag (writes to `metadata.duplicateDismissed = true`)
      **Dependencies:** S-3.4
      **Complexity:** M
      **Files:** `src/lib/transactions/duplicates.ts`

---

## 10. Phase 4 — Reconciliation engine

**Goal:** Given a set of FEL DTEs and TPV/bank lines, the engine produces matched pairs with confidence scores, leaves uncertain ones in the queue, and supports manual override.

### S-4.1: Reconciliation algorithm — multi-field scoring

**Description:** Pure function `score(felTx, tpvTx) → number ∈ [0, 1]` weighted across:

- Amount (exact match: 0.30; within 0.5%: 0.20)
- Date (same day: 0.20; within ±1 day: 0.10)
- Time (within 5 min: 0.15; within 60 min: 0.08; n/a if either lacks time: 0.05 baseline)
- NIT (emisor matches: 0.15)
- IVA (matches: 0.10)
- Series/number reference in description (matches: 0.10 bonus)
  Weights re-normalized so max = 1.0. Algorithm fully unit-tested.
  **Acceptance criteria:**
- [ ] 30+ unit tests covering: exact match, near-miss amount, time mismatch, missing fields, currency mismatch (auto-zero), tenant isolation
- [ ] Function is pure — no DB access
      **Dependencies:** none
      **Complexity:** L
      **Files:** `src/lib/reconciliation/score.ts`, tests
      **Rule-4 status:** synthetic-isolated (test fixtures only, in `*.test.ts` files)

### S-4.2: Reconciliation runner

**Description:** Service `runReconciliation({ orgId, since })` that fetches unmatched transactions in the window, runs pairwise scoring, applies thresholds: `≥ 0.95` → `AUTO_EXACT` auto-match; `0.70–0.94` → `AUTO_PROBABLE` (auto-match but flagged for review); `< 0.70` → leave unmatched. Idempotent — re-running produces no duplicates.
**Acceptance criteria:**

- [ ] Pairwise comparison limited to candidates within ±2 days of each other (perf optimization)
- [ ] Greedy assignment when one transaction has multiple > 0.70 candidates (highest score wins, others go back to queue)
- [ ] All decisions written to `Reconciliation` rows with `matchedFields` JSONB
      **Dependencies:** S-4.1, S-1.10
      **Complexity:** L
      **Files:** `src/lib/reconciliation/runner.ts`

### S-4.3: Reconciliation Vercel Cron

**Description:** `GET /api/cron/reconciliation` invoked every 30 minutes by Vercel Cron. Fans out by org: for each org with unmatched transactions in the last 7 days, calls `runReconciliation`. Authenticated by Vercel Cron secret header.
**Acceptance criteria:**

- [ ] Cron runs without timing out (Vercel function limits respected; orgs processed in batches)
- [ ] Failures per org logged but do not abort other orgs
      **Dependencies:** S-4.2
      **Complexity:** M
      **Files:** `src/app/api/cron/reconciliation/route.ts`, `vercel.json`

### S-4.4: Manual reconciliation API

**Description:** `POST /api/v1/transactions/reconcile` body `{ felTransactionId, tpvTransactionId }`. Validates both belong to the org, both unmatched. Creates `Reconciliation` with `matchType = MANUAL`, `confidenceScore = 1.0`, `reconciledBy = currentUserId`.
**Acceptance criteria:**

- [ ] Cross-tenant attempt returns 404
- [ ] Already-matched transactions return 409
      **Dependencies:** S-4.2
      **Complexity:** S
      **Files:** `src/app/api/v1/transactions/reconcile/route.ts`

### S-4.5: Manual unmatch API

**Description:** `DELETE /api/v1/reconciliations/[id]` reverts the match. Both transactions return to `UNMATCHED`. Audit trail records the unmatch.
**Acceptance criteria:**

- [ ] Auto-matches and manual matches both reversible
- [ ] If posting was triggered by the match (Phase 5), the journal entry is reversed (placeholder until Phase 5 wires this)
      **Dependencies:** S-4.4
      **Complexity:** S
      **Files:** `src/app/api/v1/reconciliations/[id]/route.ts`

### S-4.6: Reconciliation queue UI — drag-and-drop matching

**Description:** Two-pane layout: FEL DTEs on left, TPV/bank lines on right. Drag-and-drop to match (`react-dnd` or HTML5 drag API). Confidence preview before commit. Highlights probable matches in both panes.
**Acceptance criteria:**

- [ ] Keyboard-accessible alternative (select left, then select right, then "Conciliar" button)
- [ ] Match preview shows the scoring breakdown
- [ ] Successful match removes both rows with a smooth animation
      **Dependencies:** S-4.4
      **Complexity:** L
      **Files:** `src/components/reconciliation/queue.tsx`

### S-4.7: Reconciliation confidence visualization

**Description:** On any matched transaction's detail page, show a visual breakdown of which fields contributed to the confidence score.
**Acceptance criteria:**

- [ ] Bar chart or icon strip showing each scoring factor
- [ ] "Por qué este match" explanation in plain Spanish
      **Dependencies:** S-3.8, S-4.2
      **Complexity:** S
      **Files:** `src/components/reconciliation/confidence.tsx`

---

## 11. Phase 5 — Contabilidad module

**Goal:** Reconciled transactions auto-post to journal entries via the rules engine; users can manually create entries; periods open and close.

### S-5.1: Account CRUD API + UI

**Description:** API: `GET/POST/PATCH/DELETE /api/v1/accounting/accounts`. UI: `/contabilidad/catalogo` tree view with expand/collapse, add child, deactivate.
**Acceptance criteria:**

- [ ] Cannot delete an account with non-zero balance or referenced by journal entries
- [ ] Cannot deactivate a system account (`isSystemAccount = true`)
- [ ] Tree drag-and-drop reparenting (or modal-based for accessibility)
      **Dependencies:** S-1.10, S-1.11
      **Complexity:** L
      **Files:** `src/app/api/v1/accounting/accounts/*`, `src/app/(app)/contabilidad/catalogo/page.tsx`

### S-5.2: Account balance calculation (cached)

**Description:** Service that computes account balance as the sum of all journal entry lines for that account, scoped to the org. Cached on `Account.balance`. Recalculated on every posting (via DB trigger or app-layer service — pick one and document; recommend app-layer for portability).
**Acceptance criteria:**

- [ ] Balance always equals raw computation (verified by reconciliation job)
- [ ] Posting + balance update in a single DB transaction
      **Dependencies:** S-5.1
      **Complexity:** M
      **Files:** `src/lib/accounting/balances.ts`

### S-5.3: Journal entry editor UI

**Description:** `/contabilidad/asientos` list + `/contabilidad/asientos/nuevo` editor. Editor enforces debits = credits in real time. Each line: account picker (typeahead), debit, credit, description.
**Acceptance criteria:**

- [ ] Cannot save unbalanced entry
- [ ] Tab order matches accountant expectation (account → debit → credit → next line)
- [ ] Currency mismatches rejected
      **Dependencies:** S-5.1
      **Complexity:** L
      **Files:** `src/app/(app)/contabilidad/asientos/*`

### S-5.4: Auto-posting service

**Description:** When `runReconciliation` (S-4.2) creates a match, evaluate active `AccountingRule`s in priority order. First matching rule fires its actions, creating a `JournalEntry` with `source = AUTO`, `sourceTransactionId` set. If no rule matches, transaction stays in `PENDING` posting status.
**Acceptance criteria:**

- [ ] Rule evaluation is pure (testable without DB)
- [ ] Posting wraps account balance update + journal entry creation in a single transaction
- [ ] If posting fails, reconciliation match is preserved but flagged for review
      **Dependencies:** S-5.2, S-4.2, S-5.5
      **Complexity:** L
      **Files:** `src/lib/accounting/auto-posting.ts`

### S-5.5: Accounting Rules engine

**Description:** JSONB-encoded rules per scaffolding §11.2. Predicates: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `regex`, `in`. Logical: `all`, `any`, `not`. Actions: array of `{ accountCode, debitAmount?, creditAmount?, description }`. Evaluator validates rule structure with Zod before running.
**Acceptance criteria:**

- [ ] 50+ unit tests across operators, nesting, edge cases (null fields, type mismatches)
- [ ] Invalid rule structures rejected with actionable error
      **Dependencies:** S-1.6
      **Complexity:** L
      **Files:** `src/lib/accounting/rules-engine.ts`, tests

### S-5.6: Rules CRUD UI

**Description:** `/contabilidad/reglas` lists rules in priority order. Editor uses a builder UI (no JSON typing required for users) — build conditions visually. Test mode runs the rule against the last N transactions and shows what would have posted.
**Acceptance criteria:**

- [ ] Drag-and-drop priority reordering
- [ ] "Test rule" mode shows hypothetical postings without committing
- [ ] Active toggle per rule
      **Dependencies:** S-5.5
      **Complexity:** L
      **Files:** `src/app/(app)/contabilidad/reglas/*`, `src/components/accounting/rule-builder.tsx`

### S-5.7: Period management

**Description:** `/contabilidad/periodos` lists months as a grid with status (OPEN/CLOSED/LOCKED). Close month: validates no unmatched transactions, no draft journal entries, then transitions to CLOSED. Lock: irreversible, blocks all edits.
**Acceptance criteria:**

- [ ] Cannot post to a CLOSED period without explicit re-open
- [ ] Lock requires double-confirmation
- [ ] Audit trail records every status change
      **Dependencies:** S-5.4
      **Complexity:** L
      **Files:** `src/app/(app)/contabilidad/periodos/page.tsx`, `src/lib/accounting/periods.ts`

### S-5.8: Reversal entries

**Description:** From a posted journal entry detail page, "Generar reverso" creates a mirrored entry (debits ↔ credits) with `source = REVERSAL`, links via `reversedEntryId`. Original entry remains; reversal is its own row (audit-friendly).
**Acceptance criteria:**

- [ ] Reverse-of-reverse blocked (no chains)
- [ ] Account balances reflect both entries
      **Dependencies:** S-5.3
      **Complexity:** M
      **Files:** `src/lib/accounting/reversal.ts`

### S-5.9: Contabilidad overview UI

**Description:** `/contabilidad` summary: posting status of recent transactions, draft entries needing review, period status badges.
**Acceptance criteria:**

- [ ] All counters live (no stale cache)
- [ ] Quick-action buttons to nuevo asiento, reglas, catálogo
      **Dependencies:** S-5.3, S-5.6, S-5.7
      **Complexity:** M
      **Files:** `src/app/(app)/contabilidad/page.tsx`

---

## 12. Phase 6 — Reportes module

**Goal:** Five P0 financial reports + QuickBooks export. PDF generation. SAT XML export decision-gated by D-7.

### S-6.1: Income Statement (P&L) query

**Description:** Raw SQL via `prisma.$queryRaw` for performance. Inputs: orgId, startDate, endDate, optional comparative (prior period or YoY). Returns hierarchical revenue/expense rollup down to leaf accounts.
**Acceptance criteria:**

- [ ] Sum of leaves equals parent at every level (verified in tests)
- [ ] Handles accounts with no movement (zero rows, but parent still computed)
- [ ] Negative balances rendered with parentheses on the UI side
      **Dependencies:** S-5.2
      **Complexity:** L
      **Files:** `src/lib/reports/income-statement.ts`, tests

### S-6.2: Balance Sheet query

**Description:** Raw SQL. As-of snapshot: assets, liabilities, equity. Verifies the accounting equation (assets = liabilities + equity ± rounding tolerance).
**Acceptance criteria:**

- [ ] Equation holds within Q 0.01 for any date with posted entries
- [ ] Handles unposted entries (ignored)
      **Dependencies:** S-6.1
      **Complexity:** L
      **Files:** `src/lib/reports/balance-sheet.ts`

### S-6.3: Cash Flow Statement query

**Description:** Direct method: derive operating, investing, financing flows from transaction categorization + chart of accounts mapping.
**Acceptance criteria:**

- [ ] Reconciles to bank transaction totals for the period
- [ ] Documented assumptions (which account ranges map to which activity) cited from NIIF-PYME guidance
      **Dependencies:** S-6.2
      **Complexity:** L
      **Files:** `src/lib/reports/cash-flow.ts`

### S-6.4: IVA Report query

**Description:** From FEL DTE data: IVA débito (sales), IVA crédito (purchases), net liability for the period. Output rows per DTE for traceability.
**Acceptance criteria:**

- [ ] Matches manual calculation on a known sample (verified with real data once a pilot provides it; until then, synthetic-isolated test fixtures)
- [ ] Handles credit notes (negative IVA débito)
      **Dependencies:** S-3.4
      **Complexity:** L
      **Files:** `src/lib/reports/iva.ts`
      **Rule-4 status:** synthetic-isolated for tests; real for production runs

### S-6.5: Bank Reconciliation Report

**Description:** Side-by-side: book balance per account, bank balance per account (from imported CSV), outstanding deposits/withdrawals.
**Acceptance criteria:**

- [ ] Difference equals exactly the sum of outstanding items
- [ ] Per-account view
      **Dependencies:** S-6.2, S-3.6
      **Complexity:** M
      **Files:** `src/lib/reports/bank-reconciliation.ts`

### S-6.6: Reports rendering UI

**Description:** Shared layout for all reports: header (org, period, generated-at), filter sidebar, body, footer with totals. Print-friendly CSS.
**Acceptance criteria:**

- [ ] Same layout for all 5 reports — consistent UX
- [ ] Print preview matches PDF output (S-6.8)
      **Dependencies:** S-6.1
      **Complexity:** L
      **Files:** `src/components/reports/*`, `src/app/(app)/reportes/*`

### S-6.7: PDF generation

**Description:** `react-pdf` (or `@react-email` + Puppeteer-as-a-service if needed). API route `POST /api/v1/reports/pdf` returns a streamed PDF. Branded with IFA logo + org logo.
**Acceptance criteria:**

- [ ] PDF renders in < 5s for a 100-page report
- [ ] Tabular alignment preserved
      **Dependencies:** S-6.6
      **Complexity:** L
      **Files:** `src/lib/reports/pdf.ts`, `src/app/api/v1/reports/pdf/route.ts`

### S-6.8: QuickBooks IIF export

**Description:** Generate IIF format for QuickBooks Desktop. Map IFA accounts to QB account types via a user-configurable mapping table (UI in Configuración → Integraciones).
**Acceptance criteria:**

- [ ] IIF imports cleanly into a QuickBooks Desktop test instance (verify with real QB Desktop)
- [ ] Every IFA account requires a mapping before export (validation gate)
      **Dependencies:** S-5.3
      **Complexity:** L
      **Files:** `src/lib/reports/quickbooks-iif.ts`, mapping UI

### S-6.9: QuickBooks Online CSV export

**Description:** Generate the QBO-compatible CSV format for transactions and journal entries.
**Acceptance criteria:**

- [ ] CSV imports cleanly into a QBO test account
      **Dependencies:** S-6.8
      **Complexity:** M
      **Files:** `src/lib/reports/quickbooks-csv.ts`

### S-6.10: SAT XML export — DEFERRED per locked D-7

**Description:** Per locked D-7, this story is deferred to post-MVP. The Reports hub shows an honest "Próximamente — pendiente de validación SAT" placeholder for SAT XML export. PDF and CSV exports cover compliance documentation needs in the interim.
**Acceptance criteria:**

- [ ] UI placeholder present in Reports hub
- [ ] Copy honest about deferral status (Rule 1)
- [ ] No invented SAT XML format anywhere in codebase (Rule 4)
      **Dependencies:** D-7 unlock (post-MVP)
      **Complexity:** L (when revived)
      **Files:** Reports hub UI only for MVP (placeholder)

### S-6.11: Reports hub UI

**Description:** `/reportes` lists all reports as cards with description, last-generated time, generate button.
**Acceptance criteria:**

- [ ] Empty state when no data
- [ ] Quick-period chips (este mes, mes anterior, año a la fecha, año anterior)
      **Dependencies:** S-6.6
      **Complexity:** M
      **Files:** `src/app/(app)/reportes/page.tsx`

---

## 13. Phase 7 — Inteligencia (AI + Health Score)

**Goal:** Claude-powered categorization and insights, Health Score engine in TypeScript, dashboard gauge, score detail page.

### S-7.1: Anthropic client + prompt cache

**Description:** Install `@anthropic-ai/sdk`. Wrap in `src/lib/ai/claude.ts`. Use `claude-opus-4-7` for high-stakes calls (insights, recommendations) and `claude-haiku-4-5-20251001` for high-volume calls (categorization). All calls use prompt caching: stable system prompt + tool definitions cached, only the variable transaction data changes per call.
**Acceptance criteria:**

- [ ] Cache hit rate > 90% on categorization workload (measured)
- [ ] All calls retried with exponential backoff on 5xx
- [ ] Costs logged per call (model, input tokens, output tokens, cache reads/writes)
      **Dependencies:** S-0.14 (Anthropic key)
      **Complexity:** M
      **Files:** `src/lib/ai/claude.ts`

### S-7.2: Transaction categorization service

**Description:** For each transaction, look up `merchantNit` (or fuzzy `merchantName`) in a per-org categorization cache. If missing, call Claude. Cache the result on `MerchantCategory` table (per-org). Re-classification is a separate explicit action.
**Acceptance criteria:**

- [ ] Once a merchant is categorized, no further Claude calls for that merchant
- [ ] AI confidence score stored on `Transaction.aiCategoryConfidence`
- [ ] User correction overrides AI permanently (writes to MerchantCategory cache)
      **Dependencies:** S-7.1, S-1.10
      **Complexity:** L
      **Files:** `src/lib/ai/categorization.ts`, schema additions for `MerchantCategory`

### S-7.3: Categorization auto-trigger

**Description:** When a `Transaction` is created (manual, CSV, or future FEL), enqueue a categorization job. Use a Postgres-backed job queue table (since no SQS): `pending_jobs(id, type, payload, status, attempts, scheduled_at, created_at)`. A Vercel Cron drains the queue every minute.
**Acceptance criteria:**

- [ ] Jobs idempotent (re-running produces same result)
- [ ] Failed jobs retry 3x with exponential backoff, then dead-letter
- [ ] Queue depth visible in an internal `/admin/jobs` page (dev-only)
      **Dependencies:** S-7.2
      **Complexity:** L
      **Files:** `src/lib/jobs/*`, `src/app/api/cron/jobs/route.ts`

### S-7.4: Trend detection

**Description:** Per category, compute current period vs prior period totals. Flag categories with > 25% variance. Output: `{ categoryId, currentAmount, priorAmount, variancePct, direction }[]`.
**Acceptance criteria:**

- [ ] Pure function over aggregates from DB
- [ ] Tested against synthetic-isolated fixtures
      **Dependencies:** S-7.2
      **Complexity:** M
      **Files:** `src/lib/intelligence/trends.ts`

### S-7.5: Anomaly detection

**Description:** For each merchant with > 10 historical transactions, compute mean and stddev of amount. Flag transactions with |z| > 3 as anomalies. Also flag any transaction with a brand-new merchant (no history). Result written to `metadata.anomaly`.
**Acceptance criteria:**

- [ ] Anomaly badge visible on the transaction list and detail
- [ ] User can dismiss an anomaly flag
      **Dependencies:** S-7.2
      **Complexity:** M
      **Files:** `src/lib/intelligence/anomalies.ts`

### S-7.6: IVA tracking real-time

**Description:** Materialized view (or computed on demand with caching) of current IVA débito − IVA crédito for the active period. Surfaced on the dashboard as "Saldo IVA actual" with a countdown to filing deadline.
**Acceptance criteria:**

- [ ] Updates within 5 seconds of any FEL transaction posting
- [ ] Filing deadline computed from the SAT calendar (verified date logic)
      **Dependencies:** S-6.4
      **Complexity:** M
      **Files:** `src/lib/intelligence/iva.ts`

### S-7.7: Cash flow forecast

**Description:** 30/60/90-day projection using a simple model: average daily cash inflow/outflow over the last 90 days, projected forward with seasonal adjustment if patterns exist (day-of-week, day-of-month).
**Acceptance criteria:**

- [ ] Honest about uncertainty: forecast UI shows confidence band, not a single line
- [ ] Algorithm documented with citation if pulled from any reference (e.g., simple time-series basics)
      **Dependencies:** S-6.3
      **Complexity:** L
      **Files:** `src/lib/intelligence/forecast.ts`

### S-7.8: AI recommendations

**Description:** Periodic Claude call (weekly) per org with summarized financial context → returns 3–5 plain-Spanish recommendations ranked by estimated impact. Each linked to an action (e.g., "Crear regla para gasto repetitivo X").
**Acceptance criteria:**

- [ ] Recommendations grounded in real org data — no generic advice
- [ ] User can dismiss or mark complete
      **Dependencies:** S-7.1
      **Complexity:** L
      **Files:** `src/lib/intelligence/recommendations.ts`

### S-7.9: Insights feed UI

**Description:** `/inteligencia` page: chronological feed of trends, anomalies, and recommendations. Filter by type. Each item has an action button.
**Acceptance criteria:**

- [ ] Empty state honest: "Sin datos suficientes aún. Sigue conciliando para activar tu inteligencia financiera."
      **Dependencies:** S-7.4, S-7.5, S-7.8
      **Complexity:** M
      **Files:** `src/app/(app)/inteligencia/page.tsx`

### S-7.10: Anomalies, predicciones, recomendaciones, gastos pages

**Description:** Subroutes under `/inteligencia/*` (anomalies, predicciones, recomendaciones, gastos) — each is a focused view of one intelligence category.
**Acceptance criteria:**

- [ ] Consistent layout
- [ ] Deep-linkable filters
      **Dependencies:** S-7.9
      **Complexity:** M
      **Files:** `src/app/(app)/inteligencia/{anomalias,predicciones,recomendaciones,gastos}/page.tsx`

### S-7.11: Health Score engine — 7 factors

**Description:** TypeScript implementation. Per scaffolding §8.2, compute each factor as a 0–100 sub-score, normalize via sigmoid where appropriate, weight, sum to 0–1000.

- Reconciliation Completeness (20%): % of transactions matched within 48h
- Cash Flow Health (20%): operating cash flow ratio + days of runway
- IVA Compliance (15%): timely DTE processing + IVA balance accuracy
- Expense Control (15%): variance from historical norms + anomaly count
- Revenue Stability (10%): coefficient of variation of monthly revenue
- Accounting Timeliness (10%): days behind real-time
- Financial Discipline (10%): streak length + mission completion rate
  **Acceptance criteria:**
- [ ] Each factor independently testable with documented formula
- [ ] Score deterministic for fixed inputs
- [ ] Algorithm documentation written before code (formula reference doc in `src/lib/intelligence/health-score/README.md`)
      **Dependencies:** S-7.4, S-7.5, S-7.6, S-8.x (gamification data)
      **Complexity:** L
      **Files:** `src/lib/intelligence/health-score/*`

### S-7.12: Health Score nightly cron

**Description:** Vercel Cron at 02:00 GT runs `computeHealthScore` for every active org. Stores `HealthScore` row with previous score for trend.
**Acceptance criteria:**

- [ ] Completes within Vercel function limits even at 1k orgs (batched)
- [ ] Failures per org isolated
      **Dependencies:** S-7.11
      **Complexity:** M
      **Files:** `src/app/api/cron/health-score/route.ts`

### S-7.13: Health Score on-demand recalculation

**Description:** `POST /api/v1/intelligence/health-score` triggers immediate recompute for the requesting org. Throttled to 1 per hour per org.
**Acceptance criteria:**

- [ ] Throttle returns 429 with retry-after
- [ ] Result cached for 60 seconds
      **Dependencies:** S-7.11
      **Complexity:** S
      **Files:** `src/app/api/v1/intelligence/health-score/route.ts`

### S-7.14: Health Score gauge UI

**Description:** Recharts `RadialBarChart` styled per scaffolding §5.1 (color zones map to score ranges). Animated on mount. Shows score, label (Crítico/En Riesgo/Stable/Healthy/Excellent), trend arrow vs prior period.
**Acceptance criteria:**

- [ ] Smooth 600ms animation on score load
- [ ] Color matches the zone exactly
- [ ] Accessible: numeric value announced to screen readers; not solely color-conveyed
      **Dependencies:** S-7.13
      **Complexity:** L
      **Files:** `src/components/health-score/gauge.tsx`

### S-7.15: Health Score detail page

**Description:** `/dashboard/salud`: score gauge + radar chart of 7 factors + improvement actions list + history line chart.
**Acceptance criteria:**

- [ ] Each factor expandable to show formula and current inputs
- [ ] Improvement actions ranked by estimated point impact
      **Dependencies:** S-7.14
      **Complexity:** L
      **Files:** `src/app/(app)/dashboard/salud/page.tsx`

### S-7.16: Dashboard wire-up

**Description:** `/dashboard` brings together the score gauge, daily reconciliation summary, cash position widget, streak counter (from Phase 8), quick actions, alert feed, active mission card, revenue/expenses sparkline, IVA countdown.
**Acceptance criteria:**

- [ ] Loads in < 2s with full data (all queries parallelized; cache where possible)
- [ ] Empty/zero states for every widget
      **Dependencies:** S-7.14, S-8.x
      **Complexity:** L
      **Files:** `src/app/(app)/dashboard/page.tsx`

---

## 14. Phase 8 — Logros (Gamification)

**Goal:** XP, levels, streaks, missions, badges, anonymous leaderboard.

### S-8.1: GamificationProfile bootstrap

**Description:** On Organization creation, create a `GamificationProfile` per user. Profile is per-user-per-org.
**Acceptance criteria:**

- [ ] Profile created in same transaction as Organization
- [ ] Default level 1, 0 XP, no streak
      **Dependencies:** S-2.9
      **Complexity:** S
      **Files:** `src/lib/gamification/bootstrap.ts`

### S-8.2: XP service

**Description:** `awardXp({ profileId, action, metadata })` writes `XpEvent` and updates profile total. Idempotent per `(profileId, action, day)` for daily-cap actions like login.
**Acceptance criteria:**

- [ ] All XP values from scaffolding §9.1.1 encoded
- [ ] Daily cap on login XP (5 XP per calendar day max)
- [ ] Returns delta and new total
      **Dependencies:** S-8.1
      **Complexity:** M
      **Files:** `src/lib/gamification/xp.ts`

### S-8.3: Level service

**Description:** Level calculation from total XP using the threshold table from scaffolding §9.1.2. Level-up event triggers a notification.
**Acceptance criteria:**

- [ ] Pure function `levelFromXp(xp) → { level, title, xpToNext }`
- [ ] Level-up notification arrives in `Notification` table
      **Dependencies:** S-8.2
      **Complexity:** S
      **Files:** `src/lib/gamification/level.ts`

### S-8.4: Streak service

**Description:** Update streak on each meaningful action (reconcile a transaction OR view dashboard). Increments on consecutive calendar days in `America/Guatemala`. Streak Freeze logic: if available and a day is missed, consume one freeze instead of breaking.
**Acceptance criteria:**

- [ ] Cron at 00:05 GT verifies all profiles' streaks (decrements freeze or breaks streak as needed)
- [ ] Milestone badges awarded at 7, 30, 90, 180, 365 days
      **Dependencies:** S-8.3
      **Complexity:** L
      **Files:** `src/lib/gamification/streak.ts`, `src/app/api/cron/streaks/route.ts`

### S-8.5: Mission engine

**Description:** Predicate evaluator over user/org state. Each mission's `condition` is a JSONB predicate (similar to accounting rules). Evaluator runs on relevant events (transaction reconciled, period closed, etc.) and on a daily cron for time-based conditions. Completion awards XP and any badge reward.
**Acceptance criteria:**

- [ ] All missions from scaffolding §9.1.4 reachable
- [ ] No fake/demo missions — only the seeded catalog
      **Dependencies:** S-8.2, S-1.12
      **Complexity:** L
      **Files:** `src/lib/gamification/missions.ts`

### S-8.6: Mission rotation cron

**Description:** Every Monday 00:00 GT, deactivate completed weekly missions and assign the next set of weekly missions per profile. Monthly missions on the 1st of each month.
**Acceptance criteria:**

- [ ] Idempotent (re-running same day creates no duplicates)
- [ ] Rotation logic handles new users mid-week
      **Dependencies:** S-8.5
      **Complexity:** M
      **Files:** `src/app/api/cron/missions-rotation/route.ts`

### S-8.7: Badge unlock service

**Description:** Listener that runs after every mission completion, streak milestone, score zone transition, or other badge-triggering event. Awards `UserBadge` if not already held.
**Acceptance criteria:**

- [ ] Idempotent
- [ ] Badge unlock notification + toast
      **Dependencies:** S-8.5
      **Complexity:** M
      **Files:** `src/lib/gamification/badges.ts`

### S-8.8: Anonymous leaderboard

**Description:** Compute percentile of org's Health Score within (industry + size tier) cohort. Show "Tu empresa está en el top X% de {industria} en Guatemala". Cohorts must have ≥ 10 members for the percentile to be shown (privacy threshold).
**Acceptance criteria:**

- [ ] No company names exposed anywhere
- [ ] If cohort < 10, show "Más datos pronto" instead of a percentile
      **Dependencies:** S-7.12
      **Complexity:** M
      **Files:** `src/lib/gamification/leaderboard.ts`

### S-8.9: `/logros` hub UI

**Description:** Achievement gallery, mission board, level progression, leaderboard, XP history.
**Acceptance criteria:**

- [ ] All sections present, even if data is sparse for new users
- [ ] Locked badges shown with silhouette + unlock condition
      **Dependencies:** S-8.7, S-8.8
      **Complexity:** L
      **Files:** `src/app/(app)/logros/*`

### S-8.10: XP toast & sidebar streak

**Description:** Subtle toast on XP gain (top-right, auto-dismiss 2s, animated `+10 XP` in gold). Sidebar permanent streak flame icon with day count.
**Acceptance criteria:**

- [ ] Toast respects `prefers-reduced-motion`
- [ ] Streak icon updates within 1s of streak change
      **Dependencies:** S-8.4
      **Complexity:** M
      **Files:** `src/components/gamification/xp-toast.tsx`, `src/components/shell/streak.tsx`

---

## 15. Phase 9 — Configuración polish

**Goal:** Every settings page complete and honest about what is/isn't available.

### S-9.1: Settings hub UI

**Description:** `/configuracion` lists all settings categories.
**Acceptance criteria:**

- [ ] All 8 sub-pages reachable
      **Dependencies:** S-0.15
      **Complexity:** XS
      **Files:** `src/app/(app)/configuracion/page.tsx`

### S-9.2: Organization settings

**Description:** Edit name, NIT, industry, fiscal regime, logo upload (Supabase Storage), default currency, timezone.
**Acceptance criteria:**

- [ ] Logo upload validates size + dimensions
- [ ] NIT change blocked once any transactions exist (data integrity)
      **Dependencies:** S-2.9
      **Complexity:** M
      **Files:** `src/app/(app)/configuracion/empresa/page.tsx`

### S-9.3: Integrations status UI

**Description:** Live status of each integration (FEL certifier, TPV, QuickBooks). For MVP, all show honest state ("CSV import disponible" / "API próximamente").
**Acceptance criteria:**

- [ ] No misleading green checkmarks for unimplemented partner APIs
      **Dependencies:** S-1.6
      **Complexity:** M
      **Files:** `src/app/(app)/configuracion/integraciones/page.tsx`

### S-9.4: Notification preferences

**Description:** Per-event-type toggles for in-app notifications. (Email/push deferred per architecture deltas.)
**Acceptance criteria:**

- [ ] Disabled channels visibly labeled "Próximamente"
      **Dependencies:** S-1.6
      **Complexity:** S
      **Files:** `src/app/(app)/configuracion/notificaciones/page.tsx`

### S-9.5: Audit log viewer

**Description:** Filterable, paginated view of `AuditLog`. Read-only.
**Acceptance criteria:**

- [ ] Filters: date range, user, entity type, action
- [ ] No edit/delete affordances anywhere
      **Dependencies:** S-1.9
      **Complexity:** M
      **Files:** `src/app/(app)/configuracion/seguridad/auditoria/page.tsx`

### S-9.6: Data export

**Description:** "Exportar todos mis datos" generates a ZIP with CSVs of every table for the org plus metadata. Async job; user notified when ready (in-app).
**Acceptance criteria:**

- [ ] Includes audit log
- [ ] Excludes other tenants' data (verified by tests)
- [ ] Download link expires in 24h
      **Dependencies:** S-1.10
      **Complexity:** L
      **Files:** `src/lib/export/full-export.ts`

### S-9.7: Account deletion

**Description:** Triple-confirmation flow. Soft-delete (mark deleted, schedule purge in 30 days). On purge, all org data hard-deleted; audit log retained per compliance.
**Acceptance criteria:**

- [ ] Clear warning about irreversibility
- [ ] Soft-deleted orgs cannot log in
- [ ] Purge cron runs daily
      **Dependencies:** S-9.6
      **Complexity:** L
      **Files:** `src/app/(app)/configuracion/exportacion/page.tsx`, `src/app/api/cron/purge/route.ts`

---

## 16. Phase 10 — Integration adapters & DEMO mode

**Goal:** Adapter scaffolds ready for real partner credentials (when partnerships materialize); DEMO mode (per D-1.B) unlocked for partner pitches.

### S-10.1: `DataSourceAdapter` interface + base class

**Description:** Per scaffolding §10.4. TypeScript interface, base class with retry/backoff/health-check helpers.
**Acceptance criteria:**

- [ ] Interface unit-tested with a mock adapter
      **Dependencies:** S-1.6
      **Complexity:** M
      **Files:** `src/lib/integrations/adapter.ts`

### S-10.2: FEL CSV adapter (real, ships now)

**Description:** Implements `DataSourceAdapter` for FEL data uploaded as CSV (some certifiers offer CSV export from their portal). This is the only FEL path that works without partnerships.
**Acceptance criteria:**

- [ ] Maps CSV columns to canonical DTE fields
- [ ] Validates DTE UUID format
      **Dependencies:** S-10.1, S-3.6
      **Complexity:** M
      **Files:** `src/lib/integrations/fel/csv.ts`

### S-10.3: FEL API adapter scaffolds (GUATEFACTURAS, DIGIFACT, INFILE)

**Description:** Stub implementations that throw "not yet credentialed". Each documents exactly what credential format is expected. Ready to slot in when a partnership materializes.
**Acceptance criteria:**

- [ ] Interface implemented; no live network calls
- [ ] README per adapter explaining the partnership status and required credentials
      **Dependencies:** S-10.1
      **Complexity:** M
      **Files:** `src/lib/integrations/fel/{guatefacturas,digifact,infile}.ts`

### S-10.4: TPV CSV adapter (BAC, BI, generic)

**Description:** Like S-10.2 but for TPV/bank card CSVs. Pre-built column maps for BAC and Banco Industrial standard exports.
**Acceptance criteria:**

- [ ] User can choose template or custom mapping
      **Dependencies:** S-10.1, S-3.6
      **Complexity:** M
      **Files:** `src/lib/integrations/tpv/csv.ts`

### S-10.5: TPV API adapter scaffolds (BAC, BI, Evertec)

**Description:** Same pattern as S-10.3. No live calls; documented credential requirements.
**Acceptance criteria:**

- [ ] Stubs in place
      **Dependencies:** S-10.1
      **Complexity:** S
      **Files:** `src/lib/integrations/tpv/{bac,bi,evertec}.ts`

### S-10.6: Adapter health-check infrastructure

**Description:** Each adapter implements `healthCheck()`. Surface results in the integrations status UI (S-9.3).
**Acceptance criteria:**

- [ ] CSV adapters always healthy
- [ ] API adapters return `NOT_CONFIGURED` until credentials provided
      **Dependencies:** S-10.5
      **Complexity:** S
      **Files:** `src/lib/integrations/health.ts`

### S-10.7: DEMO mode — impressive showcase for non-tech, non-fin users

**Description:** Per locked D-1.B with showcase mandate. Env var `NEXT_PUBLIC_DEMO_MODE=true` set only in a dedicated `ifa-demo` Vercel deployment, never on production. On first load, the demo deployment seeds an isolated `Organization` representing a believable Guatemalan small business (e.g., "Panadería La Antigua, S.A." in Antigua Guatemala — a fictional bakery) with a coherent 6-month financial story. The demo is calibrated for a non-technical, non-financial audience: every screen is non-empty, every feature is exercised, every visualization tells a clear story. The user can poke around freely and immediately understand IFA's value without setup.

**Demo narrative requirements (synthetic-isolated, but realistic and coherent):**

- 6+ months of synthetic transactions (FEL DTEs + TPV/bank lines), volume realistic for a small bakery (~30–60 transactions/day)
- Reconciliation history showing the system catching errors a human would miss
- Health Score visibly improves over the demo period (e.g., 540 → 780) with annotated milestones on the trend chart
- Several missions completed + 1–2 in progress
- 6–8 badges earned across categories
- AI insights in plain Spanish referencing the demo business specifically (not generic)
- 2–3 anomalies detected with clear explanations of why they were flagged
- IVA tracking shows a meaningful balance and an upcoming filing deadline
- Cash flow forecast shows a realistic 90-day projection with a confidence band
- Anonymous leaderboard places the demo org in a credible percentile

**Acceptance criteria:**

- [ ] Persistent banner "MODO DEMO — Datos Sintéticos. No usar para decisiones reales." cannot be hidden
- [ ] All synthetic data files headed `// SYNTHETIC TEST FIXTURE — NOT FOR PRODUCTION USE` per Rule 4 intent
- [ ] CI assertion: production build of the app fails to start if `NEXT_PUBLIC_DEMO_MODE === 'true'` is detected with a production database URL
- [ ] Demo deployment is a separate Vercel project (`ifa-demo`) connected to a separate, throwaway Supabase database — never the prod database
- [ ] A non-technical user can reach the dashboard within 10 seconds of loading the demo URL (no signup required — auto-authenticated as a demo user)
- [ ] "Restablecer demo" button resets the demo org to its seeded state in < 5 seconds
- [ ] Demo organization cannot be exported, migrated, or referenced from any production code path
- [ ] Demo data generator is deterministic (fixed seed) so every visitor sees the same coherent story
- [ ] All synthetic merchant names, addresses, NITs are clearly fictional and labeled as such in inline comments

**Dependencies:** all visualization stories from prior phases (Reportes, Inteligencia, Logros)
**Complexity:** L (likely multiple sub-stories — split when entering Phase 10)
**Files:** `src/lib/demo/*`, `src/components/shell/demo-banner.tsx`, `prisma/demo-seed/*`
**Rule-4 status:** synthetic-isolated (per Rule 4 intent clause; environment-gated; deterministic; never in production)

---

## 17. Phase 11 — Hardening & Pre-Launch

**Goal:** Production-ready quality across performance, accessibility, security, observability.

### S-11.1: E2E golden-path suite

**Description:** Playwright tests covering: signup → email confirm → onboarding → CSV import → reconcile (manual) → generate IVA report → view Health Score. Plus negative paths (auth failures, invalid inputs, cross-tenant attempts).
**Acceptance criteria:**

- [ ] Suite runs in < 10 min in CI
- [ ] Stable: 0 flakes over 20 consecutive runs
      **Dependencies:** all prior phases
      **Complexity:** L
      **Files:** `tests/e2e/*`

### S-11.2: Performance audit

**Description:** Lighthouse CI on key routes (/, /login, /dashboard, /transacciones, /reportes). Targets: LCP < 2.5s, CLS < 0.1, INP < 200ms. Optimize until met.
**Acceptance criteria:**

- [ ] All targets met on a Vercel preview deployment
- [ ] Bundle size budget enforced in CI (no route > 250KB JS)
      **Dependencies:** S-11.1
      **Complexity:** L
      **Files:** `.github/workflows/lighthouse.yml`

### S-11.3: Accessibility audit

**Description:** Axe-core run on every page in CI. Manual screen reader pass (VoiceOver) on all critical flows. Verify all color contrasts per scaffolding §5.6.
**Acceptance criteria:**

- [ ] Zero axe violations of severity ≥ serious
- [ ] Manual pass documented in `docs/qa/a11y-pass.md`
      **Dependencies:** S-11.1
      **Complexity:** L
      **Files:** `tests/a11y/*`, `docs/qa/a11y-pass.md`

### S-11.4: Security review (OWASP top 10 + scaffolding §14)

**Description:** Self-review against checklist: CSP headers, CSRF, XSS via untrusted Markdown, auth/session, RLS verification, secret leakage, dependency scan (Dependabot + manual `pnpm audit`).
**Acceptance criteria:**

- [ ] CSP enforced in production with no `unsafe-inline`
- [ ] All secrets verified absent from client bundle
- [ ] Cross-tenant query attempts return 404, not 403 (no enumeration)
      **Dependencies:** S-11.1
      **Complexity:** L
      **Files:** `docs/qa/security-pass.md`, `next.config.ts` (headers)

### S-11.5: Database query audit

**Description:** Run a profiling pass: enable `pg_stat_statements`, exercise the app, identify any query > 100ms. Add indexes or refactor.
**Acceptance criteria:**

- [ ] No query in normal user flows > 200ms
- [ ] N+1 queries eliminated
      **Dependencies:** S-11.1
      **Complexity:** M
      **Files:** documentation in `docs/qa/db-pass.md`

### S-11.6: Sentry integration (optional, pending provisioning)

**Description:** If/when Sentry is provisioned, wire `@sentry/nextjs`, source maps, release tagging.
**Acceptance criteria:**

- [ ] An intentional error in dev shows up in Sentry
- [ ] No PII in error payloads
      **Dependencies:** Sentry account
      **Complexity:** M
      **Files:** `sentry.{client,server,edge}.config.ts`

### S-11.7: Operations runbook

**Description:** `docs_operations/runbook.md` covering: incident triage, rollback, DB restore, Vercel redeploy, Supabase issue escalation paths.
**Acceptance criteria:**

- [ ] Each procedure has a step-by-step checklist
- [ ] Rollback rehearsed once on a throwaway copy of the DB
      **Dependencies:** S-11.1
      **Complexity:** M
      **Files:** `docs_operations/runbook.md`

### S-11.8: Pre-launch legal checklist

**Description:** Once you have legal department hours (per locked F): Privacy Policy, Terms of Service, SAT compliance attestations reviewed and published. Cookie banner if applicable. DPO contact published.
**Acceptance criteria:**

- [ ] Real, lawyer-reviewed copy at `/terminos` and `/privacidad`
- [ ] No placeholder text in production
      **Dependencies:** legal department engagement
      **Complexity:** M (coordination)
      **Files:** `src/app/(public)/{terminos,privacidad}/page.tsx`

---

## 18. Cross-cutting requirements

These are not stories themselves but apply to every story.

| Requirement                      | Specification                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Type safety                      | TS strict, `noUncheckedIndexedAccess`, no `any`, no `@ts-ignore` without `// why:`                 |
| Linting                          | Zero ESLint warnings on `main`; no suppression without `// why:`                                   |
| Tests                            | Unit for pure logic; integration for cross-module flows; E2E for golden paths                      |
| i18n                             | Zero hardcoded user-facing strings; all in `es-GT.json`                                            |
| Currency                         | Always via `<Money />` component; Q with parens for negatives                                      |
| Dates                            | Always with explicit `America/Guatemala` timezone                                                  |
| Errors                           | Structured logs (`{ requestId, route, message, ... }`); user-facing copy in Spanish                |
| Loading states                   | Every async UI has a skeleton or spinner; never blank                                              |
| Empty states                     | Every list/table has an empty state with honest copy and a next action                             |
| Accessibility                    | WCAG 2.1 AA min; keyboard-first; visible focus ring; semantic HTML                                 |
| Security                         | Zod validation at every API boundary; tenant filter at every DB query; no secrets in client bundle |
| Observability                    | Every API route logs a structured request line with timing                                         |
| Rule 1 (no lies, no assumptions) | Every "Próximamente" label is honest; never claim a feature works when it doesn't                  |
| Rule 4 (no fake data)            | Every seed file declares its source; every test fixture lives in `*.test.ts` or in DEMO mode only  |

---

## 19. Quality gates (Definition of Done per story)

A story is **Done** when **all** the following pass:

1. ✅ All acceptance criteria checked
2. ✅ TypeScript: `pnpm tsc --noEmit` green
3. ✅ Lint: `pnpm lint` green, zero new warnings
4. ✅ Unit tests: relevant tests written + green; coverage on touched files ≥ 80%
5. ✅ Integration/E2E tests: green on any cross-module changes
6. ✅ Accessibility: keyboard navigation manually verified; axe scan green on touched pages
7. ✅ i18n: all new strings in `es-GT.json`
8. ✅ No `console.log` left behind (only structured logging)
9. ✅ No fake/mock business data committed (Rule 4)
10. ✅ Self-review against `_THE_RULES.MD` — every rule respected
11. ✅ PR description names the story ID, lists acceptance criteria with status, calls out any deviations from the plan

---

## 20. Risk register (delta from `_IFA_SCAFFOLDING.md` §18)

The scaffolding's risk register stands. These are **additional** or **modified** risks from the locked MVP constraints.

| Risk                                                          | Probability                       | Impact                        | Mitigation                                                                                                        |
| ------------------------------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Solo builder burnout / single point of failure                | Medium-High                       | Critical                      | No deadline reduces pressure; take breaks; document everything so a future second developer can onboard           |
| MVP demo fails to land partnerships (no real-data validation) | Medium                            | High                          | DEMO mode (D-1.B) provides credible pitches; pursue at least one pilot SME before pursuing certifier partnerships |
| Supabase outage takes down the whole MVP (no fallbacks)       | Low                               | High                          | Acceptable for MVP; document RTO/RPO expectations; revisit if pilots demand higher SLA                            |
| Vercel function cold starts hurt UX                           | Low-Medium                        | Medium                        | Keep functions warm via Vercel Edge config or scheduled pings; consider Edge runtime for hot routes               |
| Anthropic cost overrun on categorization at scale             | Medium                            | Medium                        | Cache merchant categorizations aggressively; use Haiku for high-volume; cost dashboard in `/admin`                |
| NIIF-PYME chart of accounts source becomes outdated           | Low                               | Medium                        | Re-source annually; keep seed file changelog                                                                      |
| SAT XML format invented by accident (D-7)                     | Low (if D-7 honored)              | Critical (compliance failure) | Defer until verified spec available                                                                               |
| DEMO mode contaminates production (Rule 4 violation)          | Low (if D-1.B isolation enforced) | High                          | CI assertion + separate Vercel project + visible banner everywhere                                                |

---

## 21. Out of scope for MVP (deferred items, with re-introduction trigger)

| Deferred                                | Re-introduction trigger                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| Canal Contable (multi-org-per-user)     | Confirmed accounting-firm pilot signed                       |
| Subscription billing                    | First paying customer ready                                  |
| Email transactional (Resend)            | Need invites or weekly digest                                |
| Push notifications (OneSignal)          | Capacitor mobile build kicks off                             |
| Capacitor mobile shell                  | Web MVP validated with ≥ 3 pilots                            |
| Python AI microservice                  | ML complexity exceeds TS comfort                             |
| Sentry / Axiom / PostHog / Better Stack | First real pilot user onboarded                              |
| Multi-currency beyond GTQ + USD         | Country expansion                                            |
| Country adapters beyond Guatemala       | Phase 2 (Central America)                                    |
| White-label for accounting firms        | Canal Contable activation                                    |
| AWS migration (from Supabase)           | Sustained scale or compliance demand exceeding Supabase tier |
| SAT XML export                          | D-7 sourced and confirmed                                    |

---

_End of Build Plan v0.1_
