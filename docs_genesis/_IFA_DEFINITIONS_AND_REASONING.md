# Inteligencia Financiera App — Definitions, Reasoning & Design Rationale

> **Companion to:** IFA_SCAFFOLDING.md  
> **Purpose:** Explain the WHY behind every architectural, design, and product decision so that both machines (AI assistants, code generators) and humans (developers, stakeholders, investors) can understand intent and constraints.  
> **Date:** 2026-04-20

---

## Table of Contents

1. [Domain Glossary](#1-domain-glossary)
2. [Product Positioning Rationale](#2-product-positioning-rationale)
3. [Benchmark Mapping — What Came From Where](#3-benchmark-mapping--what-came-from-where)
4. [Financial Health Score — Methodology & Rationale](#4-financial-health-score--methodology--rationale)
5. [Gamification Mechanics — Psychology & Rationale](#5-gamification-mechanics--psychology--rationale)
6. [Color Palette — Trust Psychology & Cultural Rationale](#6-color-palette--trust-psychology--cultural-rationale)
7. [Typography & Visual Design Rationale](#7-typography--visual-design-rationale)
8. [Architecture Decisions — Why Each Choice](#8-architecture-decisions--why-each-choice)
9. [Multi-Tenancy Rationale](#9-multi-tenancy-rationale)
10. [Integration Strategy Rationale](#10-integration-strategy-rationale)
11. [Data Model Design Decisions](#11-data-model-design-decisions)
12. [Guatemala-Specific Considerations](#12-guatemala-specific-considerations)
13. [Scalability Path — Country Expansion Logic](#13-scalability-path--country-expansion-logic)
14. [Security Decisions — Why Each Measure](#14-security-decisions--why-each-measure)
15. [Gamification Anti-Pattern Analysis](#15-gamification-anti-pattern-analysis)
16. [Feature Priority Framework](#16-feature-priority-framework)
17. [Revenue Model Alignment](#17-revenue-model-alignment)
18. [Risk Register](#18-risk-register)
19. [Onboarding Flow — Behavioral Design](#19-onboarding-flow--behavioral-design)

---

## 1. Domain Glossary

### 1.1 Guatemalan Financial System Terms

| Term                                                    | Definition                                                                                                                                                                           | Relevance to IFA                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **FEL** (Facturación Electrónica en Línea)              | Guatemala's mandatory electronic invoicing system administered by SAT. All IVA-registered businesses must issue electronic documents (DTEs) through certified providers.             | Primary data source. Every sale generates a DTE that IFA ingests and processes automatically.                                     |
| **DTE** (Documento Tributario Electrónico)              | An individual electronic tax document issued through FEL. Types include FACTURA (invoice), NOTA DE CRÉDITO (credit note), NOTA DE DÉBITO (debit note), RECIBO (receipt), and others. | The atomic unit of fiscal data in IFA. Each DTE contains: UUID, series, number, NIT emisor, NIT receptor, line items, IVA, total. |
| **SAT** (Superintendencia de Administración Tributaria) | Guatemala's tax authority. Administers FEL, collects IVA, and audits businesses.                                                                                                     | IFA generates SAT-compatible reports and maintains audit trails for SAT compliance verification.                                  |
| **NIT** (Número de Identificación Tributaria)           | Guatemala's tax identification number assigned to every business and individual taxpayer. Format: digits with a check digit (e.g., 12345678-9).                                      | Unique identifier for each organization (tenant) in IFA. Used for FEL matching and reconciliation.                                |
| **IVA** (Impuesto al Valor Agregado)                    | Guatemala's value-added tax, currently 12%. Applied to most goods and services. Businesses must track IVA crédito (paid on purchases) vs. IVA débito (collected on sales).           | IFA automatically calculates IVA liability from FEL data, tracking crédito/débito balance in real time.                           |
| **TPV** (Terminal Punto de Venta)                       | Point-of-sale terminal for card payments. In Guatemala, major networks are BAC Credomatic and Banco Industrial.                                                                      | Second primary data source. Card transactions from TPV are matched against FEL DTEs for reconciliation.                           |
| **Certificador FEL**                                    | A SAT-authorized company that certifies electronic documents. Examples: GUATEFACTURAS, DIGIFACT, INFILE, G4S. Each has its own API.                                                  | IFA connects to certifier APIs to pull DTEs. Each certifier requires a separate adapter due to differing API designs.             |
| **MIPYME** (Micro, Pequeña y Mediana Empresa)           | Micro, small, and medium enterprises. 98-99% of Guatemala's formal businesses.                                                                                                       | IFA's entire target market. Product and pricing designed for this segment's budget, technical capacity, and operational needs.    |
| **NIIF-PYME**                                           | International Financial Reporting Standards for SMEs, adopted in Guatemala. Defines the chart of accounts structure and reporting requirements.                                      | IFA's default chart of accounts template follows NIIF-PYME structure.                                                             |
| **Conciliación**                                        | Reconciliation — the process of matching transactions from different sources (bank, FEL, TPV) to verify they represent the same economic event.                                      | IFA's core "magic" feature. Automated conciliación eliminates the manual, error-prone process that costs SME owners hours weekly. |

### 1.2 IFA Product Terms

| Term                                | Definition                                                                                                                                                                                        | Notes                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Financial Health Score**          | IFA's proprietary 0–1000 composite metric that quantifies the overall financial health of a business based on 7 weighted factors derived from the business's own transaction and accounting data. | NOT a credit score. Does not use external bureau data. Built entirely from data the business generates through IFA.                              |
| **Reconciliation Confidence Score** | A 0.0–1.0 float indicating how certain the system is that two transactions (e.g., a FEL DTE and a TPV card transaction) represent the same economic event.                                        | Exact match (all fields match) = 1.0. Probable match (amount + date match, time close) = 0.7-0.9. Uncertain = below 0.7, routed to manual queue. |
| **Accounting Rule**                 | A user-defined IF-THEN automation: IF a transaction matches certain conditions (merchant name, amount range, category), THEN post it to specific accounts with specific splits.                   | Enables zero-touch accounting for recurring transaction patterns. Rules are org-specific and prioritized.                                        |
| **Mission**                         | A time-bound gamification challenge that guides users toward healthy financial behaviors. Types: onboarding (one-time), weekly (rotate Mondays), monthly.                                         | Adapted from Duolingo's quest system. Missions are behavioral nudges, not arbitrary point-farming.                                               |
| **Streak**                          | Consecutive calendar days where the user has logged in and performed at least one meaningful action (reconcile a transaction or review dashboard).                                                | Mechanic borrowed directly from Duolingo. Designed to build the daily habit of financial oversight.                                              |
| **XP (Puntos de Experiencia)**      | Points earned for completing financial actions within IFA. Accumulate toward levels. Cannot be purchased.                                                                                         | XP is earned only through real financial management actions, never through payment, to maintain credibility.                                     |
| **Canonical Transaction**           | IFA's internal, normalized representation of a transaction regardless of its source (FEL, TPV, bank CSV, manual). All adapters convert source-specific formats into this schema.                  | Critical for reconciliation. The adapter pattern ensures the reconciliation engine operates on uniform data.                                     |

### 1.3 Technical Terms

| Term                        | Definition                                                                                                                                                                                   | Context                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Adapter**                 | A software component that translates between an external system's API/format and IFA's internal canonical format. Each FEL certifier, bank, and acquirer gets its own adapter.               | Implements the `DataSourceAdapter` interface. Isolates external API changes from core business logic.                    |
| **Row-Level Security**      | Database access control where every query is automatically filtered by `organizationId`, ensuring one tenant can never access another tenant's data.                                         | Implemented via Prisma middleware, not database-level RLS, for portability and testability.                              |
| **Cursor-Based Pagination** | A pagination strategy using an opaque cursor (typically the last item's ID or timestamp) instead of page numbers. More efficient for large datasets and immune to insertion/deletion issues. | Used across all list endpoints. Superior to offset pagination for financial transaction feeds that grow continuously.    |
| **Idempotent**              | An operation that produces the same result regardless of how many times it's executed. Critical for retried API calls and queue processing.                                                  | All ingestion workers and reconciliation operations are idempotent. A DTE processed twice produces only one transaction. |

---

## 2. Product Positioning Rationale

### 2.1 Why This Product Exists

Guatemalan SMEs operate in a paradox: they have modern infrastructure (FEL is mandatory, TPVs are widespread) but lack the software layer that connects these data sources into actionable financial intelligence. International solutions like QuickBooks Global don't integrate with FEL or local banks. Local solutions are either manual (Excel-based) or limited to invoicing without intelligence.

IFA fills this gap: it is the connective tissue between FEL, bank card transactions, and accounting, adding an AI intelligence layer that transforms raw transaction data into business insights.

### 2.2 Why Credit Karma as Benchmark

Credit Karma solved a parallel problem in the US: credit data was opaque, scattered across bureaus, and inaccessible to consumers. Credit Karma made it free, continuous, and actionable.

IFA does the same for Guatemalan SME financial data: makes it unified, continuous, and actionable. The adaptation required is replacing credit bureau data (unavailable in Guatemala) with a proprietary Financial Health Score derived from the business's own data.

**What IFA adopts from Credit Karma:**

- Free monitoring tier with premium upsell (adapted to SaaS model)
- Personalized dashboard with single headline metric (Financial Health Score instead of credit score)
- Factor-based score explanation ("this is helping, this is hurting")
- Actionable recommendations tied to score improvement
- Alert system for significant changes
- Connected accounts for unified financial view

**What IFA does NOT adopt from Credit Karma:**

- Marketplace model (IFA is SaaS, not ad/affiliate-driven)
- Credit card/loan offers (irrelevant for B2B SME tool)
- Consumer credit bureau integration (unavailable in Guatemala)

### 2.3 Why Duolingo as Benchmark

SME owners in Guatemala are not finance professionals. They need to build financial management habits, not just have tools available. Duolingo proved that gamification can make daily habit formation feel rewarding rather than burdensome.

The insight: reconciling transactions, reviewing reports, and maintaining books are inherently boring but critical. Gamification transforms these from chores into achievements.

**What IFA adopts from Duolingo:**

- Streaks (daily engagement habit)
- XP + Levels (progressive mastery)
- Bite-sized missions (guided behavior)
- Achievement badges (milestone celebration)
- Leaderboard (competitive motivation, adapted for privacy)
- Adaptive difficulty (onboarding progressively reveals features)

**What IFA does NOT adopt from Duolingo:**

- Hearts/lives (punitive mechanics inappropriate for financial tools)
- Social/friends features (privacy-sensitive in finance)
- Freemium with ads (undermines trust in financial software)
- Cosmetic purchases (irrelevant for professional tool)

---

## 3. Benchmark Mapping — What Came From Where

| IFA Feature                  | Primary Benchmark                   | Adaptation                                                                                                      |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Financial Health Score gauge | Credit Karma credit score           | Replaced bureau data with proprietary 7-factor composite from transaction/accounting data                       |
| Score factor breakdown       | Credit Karma score factors          | Adapted factors from credit (utilization, payment history) to business finance (reconciliation, cash flow, IVA) |
| Alert system                 | Credit Karma credit monitoring      | Changed from credit changes to financial anomalies, reconciliation failures, IVA deadlines                      |
| AI recommendations           | Credit Karma AI-driven insights     | Changed from product offers to operational improvements ("reduce fuel spending", "reconcile faster")            |
| Connected accounts view      | Credit Karma connected accounts     | Adapted from consumer bank accounts to business FEL + TPV + bank integrations                                   |
| Transaction feed             | Credit Karma transaction monitoring | Added reconciliation status, multi-source view (FEL + TPV + bank), and auto-categorization                      |
| Report generation            | QuickBooks (beyond benchmarks)      | Guatemala-specific: IVA report, SAT-compatible exports, NIIF-PYME aligned statements                            |
| Streaks                      | Duolingo streaks                    | Same mechanic, financial context: consecutive days of reconciliation/review                                     |
| XP + Levels                  | Duolingo XP system                  | Earned through financial actions, titles reflect financial expertise progression                                |
| Missions                     | Duolingo quests/challenges          | Changed from language exercises to financial management challenges                                              |
| Badges                       | Duolingo achievements               | Changed from learning milestones to financial health milestones                                                 |
| Leaderboard                  | Duolingo leagues                    | Privacy-adapted: anonymous industry percentile instead of named rankings                                        |
| Onboarding flow              | Duolingo onboarding                 | Adapted: quick setup, immediate value, progressive feature reveal                                               |
| Auto-categorization          | IFA original (AI-powered)           | Claude API for merchant categorization — no direct benchmark equivalent                                         |
| Reconciliation engine        | IFA original (core product)         | Multi-field matching algorithm — this IS the product's moat                                                     |
| Accounting rules engine      | QuickBooks bank rules               | Enhanced with AI-suggested rules based on categorization patterns                                               |
| QuickBooks export            | IFA original (interoperability)     | Bridge to existing accounting workflows, reduces switching cost                                                 |

---

## 4. Financial Health Score — Methodology & Rationale

### 4.1 Why Build a Proprietary Score

Guatemala lacks consumer-facing credit bureau APIs. Even if Transunión Guatemala or Infornet data were accessible, credit bureau data measures creditworthiness (ability to repay debt), not operational financial health (ability to run a business efficiently). IFA's score measures the latter, which is more actionable for SME owners.

The Financial Health Score answers: "How well am I managing my business's finances?" not "Can I get a loan?"

### 4.2 Factor-by-Factor Rationale

**Reconciliation Completeness (20%):** The most directly controllable factor. If transactions aren't reconciled, the business has no accurate books. High weight incentivizes the core behavior IFA exists to automate.

**Cash Flow Health (20%):** The number one killer of SMEs is cash flow, not profitability. This factor measures operating cash flow ratio (is the business generating enough cash from operations?) and runway (how many days of expenses can current cash cover?). Equal weight to reconciliation because it's equally critical.

**IVA Compliance (15%):** Guatemala-specific and high-stakes. Errors in IVA reporting lead to SAT penalties. This factor measures whether FEL DTEs are being processed correctly, whether IVA crédito/débito is balanced, and whether the business is on track for timely filing.

**Expense Control (15%):** AI-derived. Measures spending variance from historical norms. Sudden spikes, unusual merchants, and anomaly frequency all reduce this factor. Teaches businesses to be intentional about spending.

**Revenue Stability (10%):** Measures consistency and growth trajectory. Volatile revenue is a risk indicator. Lower weight because revenue stability is less controllable than internal operations.

**Accounting Timeliness (10%):** How current are the books? A business with a 45-day accounting lag has less control than one with a 2-day lag. This factor rewards the habit of keeping books current.

**Financial Discipline (10%):** Meta-factor derived from gamification engagement. Streak length, mission completion, and consistent platform usage correlate with financial management discipline. Lower weight because it's a proxy, not a direct financial metric.

### 4.3 Score Computation Rationale

**Sigmoid normalization per factor:** Raw factor values have different scales (percentages, ratios, days). Sigmoid normalization maps each to a 0–100 sub-score with diminishing returns at extremes, preventing one perfect factor from masking others.

**Nightly batch + on-demand:** Nightly ensures all users see an updated score each morning. On-demand recalculation after significant events (large transaction, month close) provides immediate feedback.

**Redis caching:** Dashboard loads must be fast. The score gauge is the first thing users see. Computing 7 factors on every page load would be unacceptable. Cached score with sub-second reads.

### 4.4 Why 0–1000 Scale

- **Not 300-850** (FICO/VantageScore range): Deliberately different to avoid confusion with credit scores. IFA's score is NOT a credit score and should never be conflated with one.
- **Not 0-100:** Too granular. Small changes (94 → 93) feel insignificant and frustrating. 0–1000 provides meaningful resolution while making improvement feel substantial (620 → 680 = clear progress).
- **Five named zones** (Critical, At Risk, Stable, Healthy, Excellent): Gives users an immediate qualitative understanding without needing to interpret the number.

---

## 5. Gamification Mechanics — Psychology & Rationale

### 5.1 Why Gamification in Financial Software

The target user (Guatemalan SME owner) has competing demands on their attention. Financial management is important but rarely urgent until something goes wrong. Gamification shifts the motivational structure from "I should do this" (obligation, often deferred) to "I want to do this" (intrinsic reward, done daily).

Research basis: BJ Fogg's Behavior Model (Motivation × Ability × Trigger) and Self-Determination Theory (Autonomy, Competence, Relatedness).

- **Streaks** provide the Trigger (daily prompt + loss aversion)
- **XP/Levels** provide Competence feedback (I'm getting better)
- **Missions** provide Autonomy (I choose which challenge to pursue)
- **Leaderboard** provides Relatedness (I'm part of a community of businesses)
- **Badges** provide lasting Competence markers (I've achieved something permanent)

### 5.2 XP Values — Design Logic

XP values are calibrated to reward behavior IFA needs users to adopt:

- **Reconciliation (10 XP per transaction)** gets the highest per-action reward because it's the core loop. A business with 20 daily transactions earns 200 XP/day just from reconciliation.
- **Perfect reconciliation day (100 XP bonus)** is the largest single-day bonus to incentivize clearing the entire queue, not just cherry-picking easy matches.
- **Report generation (15 XP)** rewards financial awareness. Generating reports means the owner is looking at their numbers.
- **Rule creation (25 XP)** rewards automation. Each rule reduces future manual work and increases system value.
- **Login (5 XP)** is the smallest reward — just enough to register engagement, not enough to be the goal.

### 5.3 Level Titles — Cultural Rationale

Titles progress from learner to expert in financial management. They're in Spanish, using terms that resonate in Latin American business culture:

- Early levels use educational framing ("Aprendiz", "En Formación") to normalize the learning process
- Mid levels use professional titles ("Analista", "Estratega") to confer status
- Top levels use aspirational titles ("CFO Virtual", "Gurú") to signal mastery

The progression maps to real capability: by Level 5, a user has reconciled thousands of transactions, generated dozens of reports, and maintained a significant streak — they genuinely are more financially disciplined.

### 5.4 Streak Design — Loss Aversion

Duolingo's streak is its most powerful retention mechanic. IFA adapts it identically because the psychology is universal:

- **Loss aversion:** Losing a 45-day streak feels worse than gaining 45 individual days felt good. This asymmetry drives daily return.
- **Streak freeze:** Available only after Level 3 (earned, not bought) to prevent early frustration while maintaining streak value for established users.
- **Definition broadened:** A Duolingo streak requires completing a lesson. IFA's streak requires either reconciling a transaction OR reviewing the dashboard. This prevents streak breaks on slow business days (weekends, holidays) when there may be no transactions to reconcile.

### 5.5 Mission Design — Guided Behavior

Missions solve the "now what?" problem. After onboarding, users need direction. Missions provide structured next-steps:

- **Onboarding missions** guide first-time setup (connect FEL, reconcile first transaction, generate first report)
- **Weekly missions** create variety and prevent staleness
- **Monthly missions** align with real accounting cycles (month-close, IVA filing)

Each mission is tied to a genuine business outcome, not an arbitrary gamification target. "Conciliador Perfecto" (zero unmatched for 5 days) means the business's books are accurate. "IVA Perfecto" means zero tax discrepancies. The gamification layer rewards real business value.

---

## 6. Color Palette — Trust Psychology & Cultural Rationale

### 6.1 Why Trust is the Primary Design Objective

Financial software handles the most sensitive business data that exists. In Guatemala's market, where digital adoption is still accelerating and many SME owners have been burned by unreliable software or scams, trust must be communicated instantly through visual design.

The color palette was designed to pass the "bank test": if a user showed the app to their bank manager, it should look like it belongs in the financial ecosystem.

### 6.2 Navy Blue — Primary

**Psychological basis:** Blue is the most universally trusted color in financial services worldwide. Navy specifically connotes authority, stability, and professionalism. The world's largest financial institutions (JPMorgan, Goldman Sachs, PayPal, Visa) all use navy as primary.

**Cultural note for Guatemala:** Blue has no negative cultural associations in Guatemala or broader Latin America. Banco Industrial (Guatemala's largest bank) uses blue. BAC Credomatic uses blue. Using navy makes IFA feel like it belongs in this ecosystem.

**IFA application:** Navy is used for the sidebar, headers, and hero sections — the structural elements that frame the application. This creates a sense of solidity and permanence.

### 6.3 Teal — Secondary

**Psychological basis:** Teal bridges blue (trust) and green (growth/money). It signals innovation without sacrificing credibility. Teal reads as "modern and capable" rather than "experimental."

**IFA application:** Teal is the action color — buttons, links, positive trends, success states. It says "something good is happening" or "do this next." The Financial Health Score's "Healthy" zone uses teal, creating a positive association between the color and financial well-being.

### 6.4 Gold — Accent

**Psychological basis:** Gold universally connotes value, achievement, and prosperity. In gamification contexts, gold is the standard for rewards and accomplishments.

**Cultural note for Guatemala:** Guatemala's national bird (the Quetzal) and currency (the Quetzal) are both national symbols. Gold complements the blue without triggering specific political or institutional associations.

**IFA application:** Gold is reserved for premium and achievement contexts: badges, streaks, level-up animations, premium tier indicators. This scarcity makes gold feel special when it appears.

### 6.5 What Was Deliberately Avoided

| Avoided Color           | Reason                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure white backgrounds  | Too clinical, creates visual fatigue. Used `--ifa-navy-50` (#F4F7FB) instead — warm, easy on eyes.                                                |
| Bright green as primary | Too informal, reads as "startup" not "financial institution." Green is reserved for semantic success states.                                      |
| Red as accent           | Anxiety-inducing in financial context. Red is only used for errors and negative changes.                                                          |
| Purple                  | Not commonly associated with financial trust in Latin American markets.                                                                           |
| Black as primary text   | Too harsh. Using `--ifa-gray-900` (#111827) is softer while remaining high-contrast.                                                              |
| Gradients (primary UI)  | Can look cheap or dated. Flat colors with subtle shadows project professionalism. Gradients may be used sparingly in marketing/landing page only. |

### 6.6 Accessibility

All color combinations in the palette meet WCAG 2.1 AA contrast requirements:

| Combination                       | Contrast Ratio | Requirement       |
| --------------------------------- | -------------- | ----------------- |
| `--ifa-gray-900` on `--ifa-white` | 15.4:1         | Exceeds AAA (7:1) |
| `--ifa-navy-700` on `--ifa-white` | 8.9:1          | Exceeds AAA       |
| `--ifa-white` on `--ifa-navy-800` | 12.1:1         | Exceeds AAA       |
| `--ifa-teal-600` on `--ifa-white` | 5.2:1          | Meets AA (4.5:1)  |
| `--ifa-error` on `--ifa-white`    | 4.6:1          | Meets AA          |

---

## 7. Typography & Visual Design Rationale

### 7.1 Why Inter

Inter was designed specifically for screens and has characteristics that make it ideal for financial data:

- **Tabular figures available:** Numbers align vertically in columns, critical for financial tables
- **Clear digit distinction:** 0, O, 1, l, I are all visually distinct
- **Excellent Latin support:** All Spanish diacritics (á, é, í, ó, ú, ñ, ü) render correctly
- **Variable font:** Single file supports all weights, reducing page load
- **Neutral aesthetic:** Professional without personality — lets the data speak

### 7.2 Why JetBrains Mono for Amounts

Financial amounts are the most critical data in the UI. Using a monospace font for amounts:

- Ensures decimal points align vertically in any list or table
- Prevents digit-width variation that makes amounts harder to scan
- Creates a visual distinction between amounts and descriptive text
- Signals "this is precise data" to the user

### 7.3 Border Radius Philosophy

`8px` for cards, `6px` for buttons — this is deliberately moderate:

- `0px` (sharp corners): Too aggressive, reads as "enterprise software from 2010"
- `4px`: Too subtle, barely visible
- `8px`: Professional, modern, but not playful
- `16px+`: Too rounded, reads as consumer/social app, undermines financial credibility
- `9999px` (full round): Reserved only for badges and pills, where the rounded shape carries semantic meaning ("this is a status indicator")

---

## 8. Architecture Decisions — Why Each Choice

### 8.1 Next.js 15 App Router

**Decision:** Use Next.js 15 with App Router as the full-stack framework.

**Rationale:**

- Server Components reduce client-side JavaScript, improving load times for users on slower Guatemalan internet connections
- API Routes eliminate the need for a separate backend service for CRUD operations
- Vercel deployment provides edge caching and automatic scaling
- App Router's layout nesting maps naturally to IFA's navigation hierarchy (sidebar layout wrapping all authenticated routes)
- The developer ecosystem and hiring pool for Next.js is significantly larger than alternatives

**Alternatives considered:**

- Remix: Strong data loading model, but smaller ecosystem and less mature deployment story
- SvelteKit: Performance advantage, but much smaller hiring pool for scaling the team
- Separate frontend + backend (React + NestJS): More infrastructure to manage, slower iteration

### 8.2 Python FastAPI for AI Microservice

**Decision:** Separate Python service for AI/ML workloads, deployed on AWS App Runner.

**Rationale:**

- Python is the de facto language for AI/ML. Claude API SDK, pandas, scikit-learn, and all ML tooling is Python-first
- Separating AI from the main Node.js app prevents CPU-intensive score computations from blocking API responses
- App Runner provides auto-scaling for variable AI workload without managing containers
- FastAPI provides automatic OpenAPI docs, making the service self-documenting

**Why not Python for everything:** TypeScript is superior for full-stack web development (shared types between frontend and API, better ecosystem for UI tooling). Python is used only where its ML ecosystem is essential.

### 8.3 Prisma 6 for ORM

**Decision:** Prisma as the ORM with PostgreSQL.

**Rationale:**

- Type-safe queries with auto-generated TypeScript types from the schema
- Declarative migration management with `prisma migrate`
- Middleware layer for multi-tenancy (`organizationId` injection) and audit logging
- Excellent developer experience (auto-complete, relation traversal)
- The schema file serves as living documentation of the data model

**Risk acknowledged:** Prisma's query performance for complex aggregations is weaker than raw SQL. For report generation (P&L, balance sheet), raw SQL queries via `prisma.$queryRaw` will be used with proper parameterization.

### 8.4 Auth0 for Authentication

**Decision:** Auth0 as the identity provider.

**Rationale:**

- Enterprise-grade security without building auth from scratch
- SAML federation for bank partner portals (BAC, Banco Industrial SSO)
- Built-in MFA (TOTP, SMS) — critical for financial software
- RBAC with custom claims for organization-scoped permissions
- Universal Login customization for IFA branding
- SOC 2 Type II compliant — important for bank partner discussions

**Alternatives considered:**

- Clerk: Excellent DX but less mature for enterprise SSO/SAML
- NextAuth: Self-hosted, more control but more maintenance burden
- Custom auth: Maximum control but massive security risk surface and development time

### 8.5 AWS Aurora Serverless v2

**Decision:** Aurora Serverless v2 for the database.

**Rationale:**

- Scales to zero during low-traffic periods (nights/weekends), reducing costs for early-stage
- Scales up automatically during batch processing (nightly score computation, month-end)
- Multi-AZ for production reliability
- PostgreSQL compatibility with Prisma
- Same infrastructure scales from 10 users to 100,000 without migration

**Alternative considered:** RDS PostgreSQL (non-serverless). More predictable pricing at scale, but Aurora Serverless is better for the unpredictable load profile of an early-stage product.

### 8.6 Zustand + TanStack Query for State

**Decision:** Zustand for global client state, TanStack Query for server state.

**Rationale:**

- Clear separation: Zustand handles UI state (sidebar collapsed, active organization, modal open). TanStack Query handles server data (transactions, scores, settings).
- TanStack Query provides automatic caching, revalidation, optimistic updates, and infinite scroll — all critical for the transaction feed.
- Zustand is ~1KB gzipped, zero boilerplate compared to Redux.
- This combination is the current industry standard for React applications of this complexity.

---

## 9. Multi-Tenancy Rationale

### 9.1 Why Shared Database, Not Database-Per-Tenant

**At IFA's scale (target 50K+ SMEs), database-per-tenant is operationally infeasible:**

- 50,000 separate databases would require automated provisioning, individual backups, individual migrations, and individual monitoring
- Cross-tenant analytics (anonymous leaderboard, benchmark comparisons) become expensive cross-database queries
- Cost: Aurora charges per database instance. 50K instances is orders of magnitude more expensive than one cluster

**Shared database with row-level filtering is the standard approach for SaaS at this scale.** Implemented via Prisma middleware that injects `WHERE organizationId = :currentOrgId` on every query.

### 9.2 Why Prisma Middleware Instead of PostgreSQL RLS

- PostgreSQL Row-Level Security requires setting `current_setting('app.organization_id')` on each connection, which is error-prone with connection pooling (PgBouncer, Prisma connection pool)
- Prisma middleware is testable in unit tests without a database
- Prisma middleware logs are visible in application observability (Sentry, Axiom)
- If the database engine changes in the future (unlikely but possible), the isolation logic moves with the application

---

## 10. Integration Strategy Rationale

### 10.1 Adapter Pattern

Each external system (FEL certifier, bank acquirer) has a fundamentally different API design, authentication method, data format, and rate limit. The adapter pattern:

- Isolates external API changes from core business logic. When DIGIFACT changes their API v2 → v3, only the DIGIFACT adapter changes. The reconciliation engine is untouched.
- Enables adding new certifiers or banks without modifying existing code. A new adapter is a new implementation of `DataSourceAdapter`.
- Makes testing possible. Core logic tests use mock adapters, not real external APIs.

### 10.2 Why SFTP Fallback for Banks

Guatemalan banks are not fintech-friendly. BAC and Banco Industrial have APIs for their core merchant portal functionality, but access may be restricted, rate-limited, or require lengthy partnership agreements.

SFTP fallback ensures IFA can still function with periodic batch file delivery, which banks are universally willing to provide. The manual CSV upload is the final fallback for banks that provide neither API nor SFTP.

This tiered approach (API → SFTP → CSV upload) means IFA never depends on a single integration method, reducing business risk.

### 10.3 Why QuickBooks Export, Not QuickBooks Replacement

Many Guatemalan SMEs that already have accountants use QuickBooks Global (or local equivalents). IFA is not trying to replace QuickBooks — it's trying to automate the data collection and reconciliation that feeds QuickBooks.

The export bridge reduces switching cost: an accountant doesn't need to abandon their workflow. They just get cleaner, pre-reconciled data from IFA instead of manually entering from bank statements and FEL portals.

This is a strategic go-to-market decision: reduce resistance, increase adoption.

---

## 11. Data Model Design Decisions

### 11.1 Transaction as Central Entity

The `Transaction` table is the most queried table in the system. Every feature — reconciliation, accounting, AI analysis, reports, gamification — reads from it. Design decisions:

- **JSONB `metadata` field:** Different sources (FEL, TPV, CSV) have different raw data structures. Forcing them into a single relational schema would require constant schema changes as integrations evolve. JSONB stores the raw source data while the canonical fields (amount, date, type) provide query performance.
- **Separate `FelDteData` and `TpvTransactionData` tables (1:1):** Source-specific data is rich enough to warrant its own table but accessed less frequently than canonical transaction data. This keeps the `Transaction` table lean for list queries while preserving full source detail for drill-down.
- **`reconciliationConfidence` float:** Enables progressive automation. Version 1 matches exact-match only. Future versions can lower the confidence threshold as the matching algorithm improves, gradually accepting probable matches automatically.

### 11.2 Why JSONB for Accounting Rules Conditions

Accounting rules have arbitrarily complex conditions: "IF merchantName contains 'GASOLINERA' AND amount > 500 AND source = 'TPV' THEN Debit 5201 Credit 1101."

A relational condition table would require a complex schema for every possible operator (contains, equals, greater than, regex, etc.) across every possible field. JSONB allows:

```json
{
  "all": [
    { "field": "merchantName", "op": "contains", "value": "GASOLINERA" },
    { "field": "amount", "op": "gt", "value": 500 },
    { "field": "source", "op": "eq", "value": "TPV" }
  ]
}
```

This is evaluated by a TypeScript rules engine at posting time. The structure is flexible enough for future rule types without schema migrations.

### 11.3 Audit Trail as Append-Only

The `AuditLog` and `TransactionAudit` tables are append-only (INSERT only, never UPDATE or DELETE). This is a compliance requirement: SAT auditors need to see every change to financial data, including who made it and when. The immutability is enforced at the application layer (no update/delete methods exist) and can be reinforced at the database layer with a trigger.

---

## 12. Guatemala-Specific Considerations

### 12.1 Internet Quality

Guatemalan internet is reliable in urban areas (Guatemala City, Quetzaltenango) but variable in quality and speed. Design implications:

- Aggressive server-side rendering (Next.js RSC) to reduce client-side JavaScript
- Optimistic UI updates for transaction actions (show success immediately, reconcile with server async)
- Compressed assets, lazy loading, and minimal dependency footprint
- Offline-capable transaction viewer in Capacitor mobile (later phase)

### 12.2 Mobile-First Usage Patterns

Many Guatemalan SME owners primarily use smartphones, not desktops, for business. Even though MVP is web-only:

- All designs are responsive-first (mobile breakpoints designed before desktop)
- Touch targets ≥ 44px
- Swipe gestures for transaction actions (reconcile, categorize)
- Dashboard designed for portrait orientation

### 12.3 Currency & Number Formatting

- Guatemalan Quetzal (GTQ): formatted as `Q 1,234.56` (Q prefix, comma thousands, dot decimal)
- US Dollar (USD): formatted as `$1,234.56` ($ prefix)
- Thousands separator: comma (`,`) — standard in Guatemala
- Decimal separator: period (`.`) — standard in Guatemala
- Negative amounts: parentheses `(Q 1,234.56)` not minus sign, following Latin American accounting convention

### 12.4 Timezone

Guatemala uses CST (UTC-6) year-round with no daylight saving time. Default timezone for all organizations: `America/Guatemala`. This simplifies date handling significantly compared to multi-timezone scenarios.

### 12.5 Tax Calendar

Key dates that IFA must surface as alerts and gamification triggers:

| Obligation               | Frequency | Deadline                                                |
| ------------------------ | --------- | ------------------------------------------------------- |
| IVA filing and payment   | Monthly   | Within the calendar month following the reporting month |
| ISR quarterly advance    | Quarterly | End of quarter                                          |
| Annual ISR filing        | Annual    | March 31 of following year                              |
| FEL DTE annulment window | Per-DTE   | Within the timeframe established by SAT regulations     |

---

## 13. Scalability Path — Country Expansion Logic

### 13.1 Why Guatemala First

- Founder's home market: local knowledge, regulatory understanding, business contacts
- FEL is mandatory and structured: provides clean, standardized data to ingest
- Market size is meaningful (50K+ target SMEs) but manageable for a startup
- Competitive landscape is weak: no dominant player solving this specific problem

### 13.2 Central America Second

Central American countries share: Spanish language, similar business culture, growing digital adoption, and mandatory electronic invoicing in various stages of rollout.

| Country     | E-Invoice System         | Status     | IFA Adaptation                             |
| ----------- | ------------------------ | ---------- | ------------------------------------------ |
| El Salvador | DTE/FEL                  | Mandatory  | New certifier adapters, DTE schema mapping |
| Honduras    | DEI electronic           | In rollout | New certifier adapters                     |
| Costa Rica  | Factura Electrónica      | Mandatory  | New HACIENDA adapter                       |
| Panamá      | FE (Factura Electrónica) | Mandatory  | New DGI adapter                            |
| Nicaragua   | DGI electronic           | Limited    | CSV-first approach                         |

### 13.3 Latin America Third

Larger markets (Mexico, Colombia, Peru, Chile, Argentina, Brazil) each have mature electronic invoicing systems (CFDI, FE, etc.) and larger SME populations. The country adapter pattern enables expansion without rewriting core logic.

Brazil (pt-BR) is the largest LATAM market and the first non-Spanish-speaking country, requiring full UI translation.

---

## 14. Security Decisions — Why Each Measure

| Measure                               | Threat Mitigated                              | Rationale                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth0 (not custom auth)               | Credential theft, session hijacking           | Auth infrastructure is the highest-stakes security code. Outsourcing to a SOC 2 provider eliminates entire attack surface categories.                             |
| KMS-encrypted integration credentials | Credential exposure via database breach       | Bank API keys and FEL certifier credentials are the most sensitive data after user passwords. KMS encryption means even a full database dump doesn't expose them. |
| Immutable audit log                   | Evidence tampering, regulatory non-compliance | SAT auditors need unmodified history. Append-only logging with no UPDATE/DELETE endpoints makes tampering detectable.                                             |
| DTE XML hash storage                  | Document integrity verification               | Storing a SHA-256 hash of the original DTE XML alongside the S3 path enables verification that stored documents haven't been modified post-ingestion.             |
| Zod input validation                  | Injection attacks, malformed data             | Validating every API input at the schema level prevents SQL injection (doubly protected by Prisma's parameterized queries) and application-level logic errors.    |
| Row-level tenant isolation            | Cross-tenant data leakage                     | The most critical security property. One business must never see another's data, even through bugs. Prisma middleware enforces this on every query.               |

---

## 15. Gamification Anti-Pattern Analysis

| Anti-Pattern             | What It Looks Like                                               | Why IFA Avoids It                                                                                                                          | IFA's Alternative                                                                                                         |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pay-to-win               | "Buy 500 XP for $5"                                              | Destroys trust in financial software. If XP can be bought, levels are meaningless. Users who notice will question the product's integrity. | XP earned only through real financial actions.                                                                            |
| Punitive mechanics       | "You lost 50 XP for not logging in"                              | Creates anxiety and resentment. Financial management should feel empowering, not punishing.                                                | Streaks are the only loss mechanic, and streak freezes mitigate unfair losses.                                            |
| Forced social comparison | "Company X has a higher score than you"                          | Financial data is deeply private. Comparing companies directly could expose competitive intelligence or shame struggling businesses.       | Anonymous percentile ranking only. "Top 15% of retail businesses." No names, no data.                                     |
| Notification spam        | "You haven't logged in today! Your streak is at risk!" × 5 times | Annoying users who are already busy running businesses. Undermines the tool's professional image.                                          | One daily streak reminder (if enabled), one weekly digest. User controls all notification preferences.                    |
| Gamification gates       | "Reach Level 3 to unlock reports"                                | Blocking core financial functionality behind arbitrary gamification milestones is unethical for a business tool.                           | All features available from day one. Gamification is an overlay, not a gate.                                              |
| Vanity metrics           | "You've processed 10,000 data points!"                           | Meaningless numbers that inflate engagement metrics but provide no business value to the user.                                             | Every gamification metric ties to a real business outcome: reconciled transactions, on-time closings, score improvements. |

---

## 16. Feature Priority Framework

Features are prioritized using the ICE framework adapted for IFA's context:

- **I — Impact:** How much does this feature move the Financial Health Score or user retention?
- **C — Confidence:** How certain are we that this feature will work as designed? (Higher for proven patterns, lower for novel AI features)
- **E — Effort:** How many developer-weeks to build and ship?

**Priority levels:**

| Priority | Definition                                                                                  | Target                    |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| P0       | Core product. Without these, IFA has no value proposition.                                  | MVP launch                |
| P1       | Significant enhancement. Improves retention, score accuracy, or user experience materially. | First 90 days post-launch |
| P2       | Nice-to-have. Adds depth or delight but doesn't block adoption.                             | 6 months post-launch      |
| P3       | Future vision. Requires scale or market validation before investment.                       | 12+ months post-launch    |

---

## 17. Revenue Model Alignment

### 17.1 How Gamification Drives Revenue

The gamification system is not a separate feature — it's a retention engine. Each gamification mechanic maps to a revenue-relevant behavior:

| Mechanic               | Behavior Driven                                       | Revenue Impact                                                                                              |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Streaks                | Daily login and engagement                            | Reduces churn. Active users don't cancel.                                                                   |
| XP for reconciliation  | Using the core product feature                        | Increases perceived value. "I'm getting my money's worth."                                                  |
| Missions               | Using advanced features (reports, rules, AI insights) | Drives adoption of premium-tier features, justifying plan upgrades.                                         |
| Financial Health Score | Monitoring and improving financial management         | Creates a quantified dependency: "My score is 780 because of IFA. Without IFA, I don't know where I stand." |
| Industry leaderboard   | Competitive motivation to improve                     | Drives engagement with premium analytics to see how to improve ranking.                                     |

### 17.2 Pricing Tier Alignment

The scaffolding's pricing (GTQ 100-300/month) segments naturally by feature depth:

| Tier         | Price (GTQ/month) | Key Features                                                                                    | Gamification Access                               |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Starter      | ~100              | FEL ingestion, basic reconciliation, 1 user, basic reports                                      | Streaks, XP, basic badges, basic missions         |
| Professional | ~200              | + AI insights, advanced reports, 3 users, QuickBooks export, accounting rules                   | + Full missions, industry leaderboard, all badges |
| Enterprise   | ~300              | + Multi-entity, unlimited users, API access, white-label for accounting firms, priority support | + Cross-entity gamification, team leaderboards    |

---

## 18. Risk Register

| Risk                                                                               | Probability | Impact   | Mitigation                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FEL certifier API access denied or rate-limited                                    | Medium      | High     | Adapter pattern allows switching certifiers. SFTP/CSV fallback. Multiple certifier relationships.                                                                                                              |
| Bank partnership delays (API access)                                               | High        | Medium   | CSV upload available from day one. SFTP as intermediate step. Bank partnerships are a growth accelerator, not a blocker.                                                                                       |
| SME owners find gamification patronizing                                           | Low         | Medium   | Gamification is subtle and opt-outable. Core product works without engaging with XP/streaks. User research during beta will calibrate.                                                                         |
| Financial Health Score perceived as meaningless                                    | Medium      | High     | Heavy investment in score explanation (factor breakdown, trend charts, AI-generated improvement actions). Score must be actionable, not just a number.                                                         |
| Claude API costs escalate with scale                                               | Medium      | Medium   | Cache AI categorizations. Once a merchant is categorized, the same category applies to future transactions from that merchant without re-calling the API. Batch processing during off-peak.                    |
| Competitor enters market (large player like Xero or QuickBooks adding FEL support) | Low-Medium  | High     | IFA's moat is local integration depth (FEL certifier adapters, Guatemalan bank partnerships, NIIF-PYME templates) and gamification layer. Network effects from accounting firm channel create switching costs. |
| Data breach                                                                        | Low         | Critical | Defense in depth: Auth0, KMS, row-level isolation, encrypted at rest, audit trails. Breach response plan required before launch.                                                                               |
| SAT regulatory changes                                                             | Medium      | Medium   | Country adapter pattern isolates regulatory logic. Changes affect adapters, not core. Active monitoring of SAT communications.                                                                                 |

---

## 19. Onboarding Flow — Behavioral Design

### 19.1 Design Principles

Adapted from Duolingo's onboarding research:

1. **Time to value < 5 minutes:** User must see their own FEL data on screen within the first session.
2. **Progressive disclosure:** Don't show all features at once. Reveal advanced features (AI insights, reports, rules) through missions.
3. **Ask only what's necessary:** Step 1 (empresa) collects minimum viable data: name, NIT, industry. Everything else can be configured later.
4. **Celebrate immediately:** First successful FEL connection triggers the "Primera Conexión" badge (+100 XP). First reconciled transaction triggers "Primer Match" badge. The user feels rewarded before they've even set up their full workflow.
5. **Skip-friendly:** Every onboarding step after FEL connection is skippable. Forcing users through 6 steps before they see value is a funnel killer.

### 19.2 Step-by-Step Rationale

| Step             | What's Collected                                 | Why This Step                                                                                                           | Why This Order                                               |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1: Empresa       | Name, NIT, industry, FEL certifier               | Creates the Organization tenant. NIT is required for FEL lookup. Industry is needed for leaderboard segmentation.       | Must be first: can't do anything without a tenant.           |
| 2: Integraciones | FEL API credentials, optional CSV                | Connects the primary data source. This is where value starts.                                                           | Immediately after tenant creation: get data flowing ASAP.    |
| 3: Reglas        | Basic chart of accounts selection, initial rules | Sets up accounting foundation. Pre-loaded NIIF-PYME template means user just confirms, not builds from scratch.         | After data is connected: rules need data context.            |
| 4: Equipo        | Invite accountant/team (skippable)               | Multi-user is a key differentiator. Early invitation increases retention (more people invested = less likely to churn). | After core setup: team isn't needed until the system works.  |
| 5: Meta          | First financial goal                             | Seeds the gamification system. Having a goal makes the Financial Health Score meaningful.                               | After system is functional: goals need context.              |
| 6: Tour          | Interactive walkthrough                          | Shows key features in the context of the user's own data (not generic screenshots).                                     | Last: the tour is most meaningful when real data is present. |

---

_End of Definitions & Reasoning Document_
