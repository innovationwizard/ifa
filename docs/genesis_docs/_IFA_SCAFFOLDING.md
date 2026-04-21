# Inteligencia Financiera App — Full Application Scaffolding

> **Version:** 1.0.0  
> **Status:** Greenfield — Production Architecture  
> **Beachhead Market:** Guatemala  
> **Expansion Path:** Guatemala → Central America → Latin America  
> **Author:** Artificial Intelligence Developments  
> **Date:** 2026-04-20

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Multi-Tenancy Model](#3-multi-tenancy-model)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Design System & Color Palette](#5-design-system--color-palette)
6. [Information Architecture — Screen Inventory](#6-information-architecture--screen-inventory)
7. [Feature Map by Module](#7-feature-map-by-module)
8. [Financial Health Score Engine](#8-financial-health-score-engine)
9. [Gamification System](#9-gamification-system)
10. [Integration Architecture](#10-integration-architecture)
11. [Data Model — Prisma Schema Outline](#11-data-model--prisma-schema-outline)
12. [API Structure](#12-api-structure)
13. [Internationalization Strategy](#13-internationalization-strategy)
14. [Security Architecture](#14-security-architecture)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Observability & Monitoring](#16-observability--monitoring)
17. [Capacitor Mobile Preparation](#17-capacitor-mobile-preparation)

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15 (App Router) | SSR, RSC, API routes, Vercel-native |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-first, accessible components, consistent design tokens |
| State | Zustand + TanStack Query v5 | Lightweight global state + server-state cache with optimistic updates |
| Charts | Recharts + D3 (custom) | Recharts for standard charts, D3 for Financial Health Score gauge and custom visualizations |
| Auth | Auth0 | Enterprise SSO, MFA, RBAC, Guatemala-compatible, SAML for bank partners |
| ORM | Prisma 6 | Type-safe queries, migration management, PostgreSQL-native |
| Database | PostgreSQL 16 (AWS Aurora Serverless v2) | Multi-tenant, JSONB for flexible schemas, row-level security |
| Cache | Redis (ElastiCache) | Session cache, rate limiting, real-time score caching |
| Queue | AWS SQS + EventBridge | Async FEL ingestion, reconciliation jobs, notification dispatch |
| AI/ML | Python 3.12 + FastAPI | Financial Health Score computation, anomaly detection, predictive models |
| AI Models | Claude API (Anthropic) | Transaction categorization, natural-language insights, expense analysis |
| File Storage | AWS S3 | DTE XML archives, CSV uploads, audit exports, report PDFs |
| Email | AWS SES + React Email | Transactional emails, alerts, weekly digests |
| Push Notifications | OneSignal | Cross-platform push for web + future Capacitor mobile |
| Monitoring | Sentry + Axiom | Error tracking + structured log aggregation |
| CI/CD | GitHub Actions | Automated testing, migration, deployment |
| Frontend Hosting | Vercel | Edge deployment, preview environments, analytics |
| Backend Infra | AWS (Lambda, App Runner, Aurora, SQS, S3) | Serverless scaling, cost-efficient for variable SME load |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  Next.js 15 App (Vercel Edge)  ·  Capacitor Shell (future)     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────────┐
│                      API GATEWAY                                │
│  Next.js API Routes (Vercel Serverless Functions)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Auth     │ │ CRUD     │ │ Webhooks │ │ Real-time (SSE)  │   │
│  │ Middleware│ │ Endpoints│ │ Receivers│ │ Score Updates    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                    SERVICE LAYER                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌─────────────────────┐  │
│  │ Reconciliation │ │ Financial      │ │ Gamification        │  │
│  │ Engine         │ │ Health Score   │ │ Engine              │  │
│  │ (TypeScript)   │ │ (Python/Fast.) │ │ (TypeScript)        │  │
│  └────────────────┘ └────────────────┘ └─────────────────────┘  │
│  ┌────────────────┐ ┌────────────────┐ ┌─────────────────────┐  │
│  │ AI Insights    │ │ Notification   │ │ Export              │  │
│  │ (Claude API)   │ │ Dispatcher     │ │ Service             │  │
│  │                │ │ (SQS Workers)  │ │ (QB/CSV/PDF)        │  │
│  └────────────────┘ └────────────────┘ └─────────────────────┘  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                   DATA LAYER                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Aurora   │ │ Redis    │ │ S3       │ │ SQS / EventBridge│   │
│  │ Postgres │ │ Cache    │ │ Objects  │ │ Queues           │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                EXTERNAL INTEGRATIONS                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ FEL      │ │ BAC /    │ │ QuickBooks│ │ SAT              │   │
│  │ Certif.  │ │ BI TPV   │ │ Global   │ │ Compliance       │   │
│  │ APIs     │ │ APIs/SFTP│ │ API      │ │ Reports          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Tenancy Model

**Strategy:** Shared database, schema-level isolation via `organizationId` foreign key on every tenant-scoped table, enforced at the Prisma middleware layer.

| Concept | Implementation |
|---|---|
| Tenant | `Organization` — one per entidad legal (NIT) |
| User | `User` — belongs to one or more Organizations via `OrganizationMember` |
| Roles | `OWNER`, `ADMIN`, `ACCOUNTANT`, `VIEWER` per Organization |
| Row isolation | Prisma middleware injects `WHERE organizationId = ?` on all queries |
| Data residency | Single Aurora cluster (us-east-1) initially; region-per-country when expanding |

**Multi-entity support:** One `User` can be `OWNER` of Organization A and `ACCOUNTANT` of Organization B. The app provides an organization switcher in the top navigation.

---

## 4. Authentication & Authorization

| Concern | Solution |
|---|---|
| Identity Provider | Auth0 with custom Universal Login (branded IFA) |
| MFA | Enforced for `OWNER` and `ADMIN` roles; optional for others |
| SSO | SAML 2.0 federation for bank partner portals |
| Session | Auth0 session cookies + short-lived JWTs for API calls |
| RBAC | Auth0 RBAC + Prisma middleware for row-level enforcement |
| Invitation flow | Email-based invite → Auth0 signup → auto-assign Organization + Role |
| OAuth scopes | `read:transactions`, `write:rules`, `admin:organization`, `export:data` |

**Auth flow:**

```
User → Auth0 Universal Login (IFA-branded) → JWT issued
  → Next.js middleware validates JWT
    → Prisma middleware resolves organizationId from JWT claims
      → Row-level filtering applied to all queries
```

---

## 5. Design System & Color Palette

### 5.1 Color Palette — "Confianza" (Trust)

The palette is engineered to evoke banking-level trust while remaining warm and approachable for SME owners who may not be financially sophisticated.

#### Primary Palette

| Token | Hex | Role |
|---|---|---|
| `--ifa-navy-900` | `#0F1A2E` | Darkest text, hero sections |
| `--ifa-navy-800` | `#1B2D4A` | Primary backgrounds, sidebar |
| `--ifa-navy-700` | `#264573` | Headers, primary buttons |
| `--ifa-navy-600` | `#2E5A8F` | Hover states, active elements |
| `--ifa-navy-100` | `#E8EEF6` | Light backgrounds, card highlights |
| `--ifa-navy-50` | `#F4F7FB` | Page background |

#### Secondary Palette (Innovation / Action)

| Token | Hex | Role |
|---|---|---|
| `--ifa-teal-600` | `#0D847A` | Secondary buttons, links, active states |
| `--ifa-teal-500` | `#0FA698` | Success accents, positive trends |
| `--ifa-teal-400` | `#2EC4B6` | Charts positive, gamification rewards |
| `--ifa-teal-100` | `#D1F5F0` | Success backgrounds |

#### Accent Palette (Prosperity / Value)

| Token | Hex | Role |
|---|---|---|
| `--ifa-gold-500` | `#D4A843` | Premium features, achievements, badges |
| `--ifa-gold-400` | `#E5C06E` | Streak flames, XP highlights |
| `--ifa-gold-100` | `#FDF5E3` | Premium card backgrounds |

#### Semantic Colors

| Token | Hex | Role |
|---|---|---|
| `--ifa-success` | `#16A34A` | Matched transactions, positive changes |
| `--ifa-warning` | `#E5930B` | Pending items, approaching deadlines |
| `--ifa-error` | `#DC2626` | Failed reconciliations, anomalies, overdue |
| `--ifa-info` | `#2563EB` | Tips, educational content |

#### Neutral Palette

| Token | Hex | Role |
|---|---|---|
| `--ifa-gray-900` | `#111827` | Body text |
| `--ifa-gray-700` | `#374151` | Secondary text |
| `--ifa-gray-500` | `#6B7280` | Placeholder text, disabled |
| `--ifa-gray-300` | `#D1D5DB` | Borders, dividers |
| `--ifa-gray-100` | `#F3F4F6` | Table alternating rows |
| `--ifa-white` | `#FFFFFF` | Cards, modals |

### 5.2 Typography

| Element | Font | Weight | Size |
|---|---|---|---|
| Display / Hero | Inter | 700 | 36px / 2.25rem |
| H1 | Inter | 700 | 30px / 1.875rem |
| H2 | Inter | 600 | 24px / 1.5rem |
| H3 | Inter | 600 | 20px / 1.25rem |
| Body | Inter | 400 | 16px / 1rem |
| Body Small | Inter | 400 | 14px / 0.875rem |
| Caption | Inter | 500 | 12px / 0.75rem |
| Monospace (amounts) | JetBrains Mono | 500 | 14px / 0.875rem |

**Why Inter:** Neutral, highly legible, excellent number rendering, variable font (reduces payload), extensive Latin character support including Spanish diacritics.

**Why JetBrains Mono for amounts:** Tabular figures by default, aligned decimal points, no ambiguity between 0/O or 1/l in financial data.

### 5.3 Component Tokens

| Component | Specification |
|---|---|
| Border radius (cards) | `8px` — professional, not playful |
| Border radius (buttons) | `6px` |
| Border radius (inputs) | `6px` |
| Border radius (badges/pills) | `9999px` (fully rounded) |
| Shadow (card) | `0 1px 3px rgba(15, 26, 46, 0.08), 0 1px 2px rgba(15, 26, 46, 0.04)` |
| Shadow (modal) | `0 20px 25px rgba(15, 26, 46, 0.1), 0 8px 10px rgba(15, 26, 46, 0.04)` |
| Shadow (dropdown) | `0 4px 6px rgba(15, 26, 46, 0.07)` |
| Transition | `150ms ease-in-out` for interactions |
| Focus ring | `2px solid var(--ifa-teal-500)` offset `2px` |

### 5.4 Dark Mode

Deferred to post-MVP. The trust-first palette is designed for light mode. When implemented, navy tones invert to light-on-dark with the same teal/gold accents.

---

## 6. Information Architecture — Screen Inventory

### 6.1 Public Routes (Unauthenticated)

| Route | Screen | Purpose |
|---|---|---|
| `/` | Landing Page | Value proposition, pricing, CTA |
| `/precios` | Pricing Page | Plan comparison, FAQ |
| `/login` | Auth0 Universal Login | Branded login/signup |
| `/registro` | Auth0 Signup | Onboarding entry |
| `/invitacion/[token]` | Invitation Accept | Join existing organization |

### 6.2 Onboarding Flow (Post-Signup, Pre-Dashboard)

| Step | Screen | Data Collected |
|---|---|---|
| 1 | `/onboarding/empresa` | Business name, NIT, industry type, FEL certifier |
| 2 | `/onboarding/integraciones` | Connect FEL certifier API, upload first bank CSV or connect TPV |
| 3 | `/onboarding/reglas` | Set basic accounting rules (chart of accounts mapping) |
| 4 | `/onboarding/equipo` | Invite accountant or team members (optional, skippable) |
| 5 | `/onboarding/meta` | Set first financial goal (gamification seed) |
| 6 | `/onboarding/tour` | Interactive product tour (3-5 key features) |

### 6.3 Main Application Routes (Authenticated)

#### Dashboard Module

| Route | Screen | Description |
|---|---|---|
| `/dashboard` | Main Dashboard | Financial Health Score gauge, daily snapshot, quick actions, streak status, alerts |
| `/dashboard/salud` | Health Score Detail | Score breakdown by factor, trend chart, improvement actions |

#### Transactions Module

| Route | Screen | Description |
|---|---|---|
| `/transacciones` | Transaction Feed | Unified list of all transactions (FEL + TPV + manual), filterable, searchable |
| `/transacciones/[id]` | Transaction Detail | Full detail: DTE data, card data, reconciliation status, audit trail |
| `/transacciones/conciliacion` | Reconciliation Queue | Unmatched transactions requiring manual review |
| `/transacciones/importar` | Import Wizard | CSV upload with column mapping, validation preview |

#### Contabilidad Module

| Route | Screen | Description |
|---|---|---|
| `/contabilidad` | Accounting Overview | Journal entries summary, posting status, period controls |
| `/contabilidad/asientos` | Journal Entries | Auto-generated and manual entries, editable |
| `/contabilidad/catalogo` | Chart of Accounts | Customizable account tree (Guatemala NIIF-PYME aligned) |
| `/contabilidad/reglas` | Accounting Rules | Auto-categorization rules engine (IF condition → THEN posting) |
| `/contabilidad/periodos` | Period Management | Open/close accounting periods, lock controls |

#### Reportes Module

| Route | Screen | Description |
|---|---|---|
| `/reportes` | Reports Hub | All available reports with generation controls |
| `/reportes/estado-resultados` | Income Statement | P&L by period, comparative, filterable by account |
| `/reportes/balance-general` | Balance Sheet | Assets, liabilities, equity snapshot |
| `/reportes/flujo-caja` | Cash Flow | Real-time cash flow visualization, forecast |
| `/reportes/iva` | IVA Report | Automated IVA liability calculation from FEL data |
| `/reportes/conciliacion-bancaria` | Bank Reconciliation | Side-by-side book vs. bank comparison |
| `/reportes/exportar` | Export Center | QuickBooks Global IIF/CSV, SAT-format XML, PDF generation |

#### Inteligencia Module (AI-Powered)

| Route | Screen | Description |
|---|---|---|
| `/inteligencia` | Intelligence Hub | AI insights feed, anomaly alerts, trend analysis |
| `/inteligencia/gastos` | Expense Analysis | AI-grouped spending by merchant/category, trend detection |
| `/inteligencia/predicciones` | Predictive Analysis | Cash flow forecasting, seasonal pattern recognition |
| `/inteligencia/anomalias` | Anomaly Detection | Flagged unusual transactions with AI explanations |
| `/inteligencia/recomendaciones` | Recommendations | Personalized financial improvement suggestions |

#### Logros Module (Gamification)

| Route | Screen | Description |
|---|---|---|
| `/logros` | Achievements Hub | Badge collection, progress rings, streak display |
| `/logros/misiones` | Active Missions | Current challenges with progress bars |
| `/logros/historial` | Achievement History | Timeline of completed milestones |
| `/logros/ranking` | Industry Leaderboard | Anonymous benchmarking against similar businesses |

#### Configuración Module

| Route | Screen | Description |
|---|---|---|
| `/configuracion` | Settings Hub | All settings categories |
| `/configuracion/empresa` | Organization Settings | Business details, NIT, fiscal info, logo |
| `/configuracion/integraciones` | Integrations | FEL, TPV, bank connections, QuickBooks sync status |
| `/configuracion/equipo` | Team Management | Members, roles, invitations |
| `/configuracion/notificaciones` | Notification Preferences | Email, push, in-app alert preferences |
| `/configuracion/facturacion` | Billing | IFA subscription plan, payment method, invoices |
| `/configuracion/seguridad` | Security | MFA, sessions, API keys, audit log |
| `/configuracion/exportacion` | Data Export | Full data export, account deletion |

### 6.4 Navigation Structure

```
┌──────────────────────────────────────────────────────────┐
│ [Logo] IFA    [Org Switcher ▾]         [🔔] [👤 User ▾] │
├──────────────┬───────────────────────────────────────────┤
│              │                                           │
│  Dashboard   │         Main Content Area                 │
│  Transacc.   │                                           │
│  Contabilid. │                                           │
│  Reportes    │                                           │
│  Inteligenc. │                                           │
│  Logros      │                                           │
│              │                                           │
│  ─────────── │                                           │
│  Config.     │                                           │
│  Ayuda       │                                           │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘
```

**Sidebar:** Collapsible, persistent, icons + labels. Collapses to icons-only on smaller viewports. Uses `--ifa-navy-800` background with white text.

**Top bar:** Organization switcher (multi-entity), notification bell with badge count, user avatar dropdown.

---

## 7. Feature Map by Module

### 7.1 Dashboard — Financial Command Center

**Benchmark origin:** Credit Karma dashboard + Duolingo home screen

| Feature | Description | Priority |
|---|---|---|
| Financial Health Score Gauge | Animated radial gauge (0–1000) with color zones, trend arrow | P0 |
| Score Factor Cards | Top 3 factors helping/hurting score with explanations | P0 |
| Daily Reconciliation Summary | Matched vs. unmatched transactions today | P0 |
| Cash Position Widget | Current cash across all connected accounts | P0 |
| Streak Counter | Consecutive days with all transactions reconciled | P0 |
| Quick Actions Bar | "Import CSV", "Review unmatched", "Generate IVA report" | P0 |
| Alert Feed | Critical items: anomalies, approaching deadlines, unmatched over 48h | P0 |
| Active Mission Card | Current gamification challenge with progress bar | P1 |
| Revenue vs. Expenses Sparkline | 30-day trend, tap to expand | P1 |
| IVA Liability Countdown | Days until next IVA filing + estimated amount | P1 |

### 7.2 Transactions — Auto-Registration Engine

**Benchmark origin:** Credit Karma transaction monitoring + IFA core product

| Feature | Description | Priority |
|---|---|---|
| Unified Transaction Feed | FEL DTEs + TPV card transactions + manual entries in one timeline | P0 |
| Auto-Ingestion: FEL | Scheduled pull from FEL certifier API (configurable interval) | P0 |
| Auto-Ingestion: TPV | API pull or SFTP file processing from BAC/BI/Evertec | P0 |
| Manual CSV Import | Upload bank statements with column-mapping wizard | P0 |
| Auto-Reconciliation | Match card transactions to FEL DTEs by amount, date, time, NIT, IVA | P0 |
| Reconciliation Confidence Score | Show match confidence (exact, probable, uncertain) | P0 |
| Manual Match Override | Drag-and-drop or link unmatched pairs manually | P0 |
| Auto-Categorization | AI-powered merchant/expense categorization using Claude API | P0 |
| Transaction Search | Full-text search across description, NIT, amount, DTE number | P0 |
| Bulk Actions | Select multiple → categorize, export, mark as reviewed | P1 |
| Duplicate Detection | Flag potential duplicate entries across sources | P1 |
| Split Transaction | Split one transaction into multiple accounting entries | P1 |
| Recurring Transaction Detection | AI identifies repeating patterns → suggest automation | P2 |

### 7.3 Contabilidad — Automated Accounting

**Benchmark origin:** QuickBooks/Intuit accounting engine adapted for Guatemala

| Feature | Description | Priority |
|---|---|---|
| Auto-Posting | Reconciled transactions auto-post to journal using accounting rules | P0 |
| Chart of Accounts | Pre-loaded Guatemala NIIF-PYME template, fully customizable | P0 |
| Accounting Rules Engine | IF-THEN rules: "IF merchant contains 'GASOLINERA' THEN Debit 5201 Credit 1101" | P0 |
| Journal Entry Editor | Manual entry creation with validation (debits = credits) | P0 |
| Period Management | Open/close months, lock closed periods from edits | P0 |
| Reversal Workflow | One-click reversal entry generation with audit trail | P1 |
| Multi-Currency | GTQ primary, USD secondary (common in Guatemala commerce) | P1 |
| Adjusting Entries | Period-end adjustments with templates (depreciation, accruals) | P2 |

### 7.4 Reportes — Financial Reporting

**Benchmark origin:** Credit Karma credit reports + QuickBooks reporting

| Feature | Description | Priority |
|---|---|---|
| Income Statement (P&L) | By period, comparative (month-over-month, year-over-year) | P0 |
| Balance Sheet | Point-in-time snapshot with drill-down to accounts | P0 |
| Cash Flow Statement | Direct method, derived from transaction data | P0 |
| IVA Report | Automated from FEL data, SAT-format compatible | P0 |
| Bank Reconciliation Report | Book balance vs. bank balance with outstanding items | P0 |
| QuickBooks Export | IIF format for QuickBooks Desktop, CSV for QuickBooks Online | P0 |
| SAT XML Export | Formatted for SAT compliance submissions | P0 |
| PDF Generation | Branded PDF reports with company logo | P1 |
| Scheduled Reports | Auto-generate and email reports on schedule | P1 |
| Custom Report Builder | Drag-and-drop report designer for power users | P3 |

### 7.5 Inteligencia — AI-Powered Financial Intelligence

**Benchmark origin:** Credit Karma AI recommendations + IFA predictive analysis

| Feature | Description | Priority |
|---|---|---|
| Expense Grouping | AI clusters merchants into logical categories (fuel, office, food, etc.) | P0 |
| Trend Detection | Surface spending trends: "Office supplies up 34% vs. last month" | P0 |
| Anomaly Detection | Flag unusual transactions: amount outliers, new merchants, time anomalies | P0 |
| IVA Tracking | Real-time IVA crédito/débito balance with projected liability | P0 |
| Cash Flow Forecast | 30/60/90-day projection based on historical patterns | P1 |
| Natural Language Insights | Claude-generated plain-Spanish summaries: "Tu gasto en combustible subió Q1,200 este mes" | P1 |
| Seasonal Pattern Recognition | Identify cyclical business patterns for planning | P2 |
| Benchmark Comparison | Anonymous comparison against similar industry/size businesses | P2 |
| What-If Simulator | "What if revenue drops 20%?" → projected cash flow impact | P3 |

### 7.6 Logros — Gamification Hub

**Benchmark origin:** Duolingo gamification system

See Section 9 for full gamification system design.

### 7.7 Configuración — Settings & Administration

| Feature | Description | Priority |
|---|---|---|
| Organization Profile | NIT, business name, address, logo, fiscal regime | P0 |
| Integration Management | Connect/disconnect FEL certifiers, bank APIs, QuickBooks | P0 |
| Team & Roles | Invite users, assign roles, manage permissions | P0 |
| Notification Preferences | Per-channel (email, push, in-app) per-event-type controls | P0 |
| Subscription & Billing | Plan selection, payment (Stripe or local gateway), invoices | P0 |
| Security Settings | MFA toggle, active sessions, API key management | P0 |
| Audit Log | Immutable log of all user actions and system events | P0 |
| Data Export | Full organization data export (GDPR-style, good practice) | P1 |
| White-Label Settings | For accounting firms managing multiple clients (logo, domain) | P3 |

---

## 8. Financial Health Score Engine

### 8.1 Score Range

**Scale:** 0–1000 (deliberately different from credit bureau scales to avoid confusion)

| Zone | Range | Color | Label (ES) |
|---|---|---|---|
| Critical | 0–299 | `--ifa-error` red | Crítico |
| At Risk | 300–499 | `--ifa-warning` amber | En Riesgo |
| Stable | 500–699 | `--ifa-info` blue | Estable |
| Healthy | 700–849 | `--ifa-teal-500` teal | Saludable |
| Excellent | 850–1000 | `--ifa-success` green | Excelente |

### 8.2 Score Factors (Weighted)

| Factor | Weight | Data Source | What It Measures |
|---|---|---|---|
| Reconciliation Completeness | 20% | Reconciliation engine | % of transactions matched and posted within 48h |
| Cash Flow Health | 20% | Transaction data | Operating cash flow ratio, days of runway |
| IVA Compliance | 15% | FEL data | Timely DTE processing, correct IVA calculations |
| Expense Control | 15% | AI analysis | Spending variance from historical norms, anomaly frequency |
| Revenue Stability | 10% | Transaction trends | Revenue consistency, growth trajectory |
| Accounting Timeliness | 10% | Period management | How current are books? Days behind real-time |
| Financial Discipline | 10% | Gamification data | Streak length, mission completion, engagement consistency |

### 8.3 Score Computation

- **Frequency:** Recalculated nightly (batch) + on-demand after significant events
- **Engine:** Python FastAPI microservice on AWS Lambda
- **Algorithm:** Weighted composite with sigmoid normalization per factor
- **History:** Full score history stored for trend visualization
- **Caching:** Latest score cached in Redis for instant dashboard load

### 8.4 Score Presentation

- **Dashboard:** Animated gauge with current score, trend arrow (↑↓→), and delta from last period
- **Detail view:** Radar chart showing all 7 factors, each with a sub-score (0–100)
- **Improvement actions:** AI-generated suggestions ranked by impact on score
- **Historical trend:** Line chart showing score over time with event annotations

---

## 9. Gamification System

### 9.1 Core Mechanics

#### 9.1.1 XP (Puntos de Experiencia)

| Action | XP Earned | Rationale |
|---|---|---|
| Log in daily | 5 XP | Habit formation |
| Reconcile a transaction | 10 XP | Core action reinforcement |
| Clear entire reconciliation queue | 50 XP bonus | Completion incentive |
| Import a CSV successfully | 20 XP | Data hygiene |
| Generate a report | 15 XP | Financial awareness |
| Review an AI insight | 10 XP | Engagement with intelligence |
| Complete a mission | Variable (50–200 XP) | Goal completion |
| Invite a team member | 30 XP | Growth loop |
| Set up an accounting rule | 25 XP | Automation adoption |
| Achieve perfect reconciliation (0 unmatched, end of day) | 100 XP | Excellence reward |

#### 9.1.2 Levels

| Level | XP Required | Title (ES) |
|---|---|---|
| 1 | 0 | Aprendiz Financiero |
| 2 | 500 | Contador en Formación |
| 3 | 1,500 | Analista Junior |
| 4 | 3,500 | Analista Financiero |
| 5 | 7,000 | Estratega Fiscal |
| 6 | 12,000 | Director Financiero |
| 7 | 20,000 | CFO Virtual |
| 8 | 35,000 | Maestro Financiero |
| 9 | 55,000 | Leyenda Contable |
| 10 | 80,000 | Gurú de las Finanzas |

#### 9.1.3 Streaks (Rachas)

- **Definition:** Consecutive calendar days where user logs in AND reconciles at least one transaction or reviews their dashboard
- **Visual:** Flame icon with day count (identical mechanic to Duolingo)
- **Streak Freeze:** Available after Level 3, allows 1 missed day without breaking streak (earned via XP or premium)
- **Milestone rewards:** 7-day, 30-day, 90-day, 180-day, 365-day streak badges

#### 9.1.4 Missions (Misiones)

Missions are time-bound challenges that guide users toward healthy financial behaviors.

**Weekly Missions (rotate each Monday):**

| Mission | Condition | Reward |
|---|---|---|
| Conciliador Perfecto | Zero unmatched transactions for 5 consecutive days | 150 XP + badge |
| Detective de Gastos | Review all AI anomaly alerts this week | 100 XP |
| Reportero Financiero | Generate at least 2 different reports | 75 XP |
| Maestro de Reglas | Create or refine 3 accounting rules | 100 XP |

**Monthly Missions:**

| Mission | Condition | Reward |
|---|---|---|
| Libros al Día | Close the previous month within 5 business days | 200 XP + badge |
| IVA Perfecto | Zero IVA discrepancies for the month | 200 XP + badge |
| Crecimiento Financiero | Improve Financial Health Score by 50+ points | 300 XP + badge |

**Onboarding Missions (one-time):**

| Mission | Condition | Reward |
|---|---|---|
| Primer Paso | Complete onboarding flow | 50 XP |
| Primera Conexión | Connect FEL certifier | 100 XP |
| Primer Match | Successfully reconcile first transaction | 75 XP |
| Primer Reporte | Generate first financial report | 75 XP |
| Equipo Unido | Invite first team member | 50 XP |

#### 9.1.5 Badges (Insignias)

Permanent achievements displayed in user profile and achievements hub.

**Categories:**

| Category | Examples |
|---|---|
| Streak Badges | Racha de 7 días, Racha de 30 días, Racha de 365 días |
| Mastery Badges | 1,000 transacciones conciliadas, 100 reportes generados |
| Health Badges | Score Saludable (700+), Score Excelente (850+) |
| Speed Badges | Cierre en 24h (month closed within 1 day) |
| Consistency Badges | 12 meses consecutivos cerrados a tiempo |
| Explorer Badges | Usó todas las funciones al menos una vez |

#### 9.1.6 Leaderboard (Ranking Anónimo)

- **Scope:** Anonymous industry benchmarking (user sees their percentile, not other companies' data)
- **Dimensions:** Financial Health Score ranking within same industry + company size tier
- **Display:** "Tu empresa está en el top 15% de comercios minoristas en Guatemala"
- **Privacy:** No company names, no financial data exposed — percentile only

### 9.2 Gamification UI Integration

| Location | Element |
|---|---|
| Sidebar | Streak flame icon with count, always visible |
| Dashboard | Active mission card with progress bar |
| Dashboard | Level badge next to user name |
| Transaction reconciliation | "+10 XP" toast animation on successful match |
| Report generation | "+15 XP" toast |
| Top bar | XP progress bar toward next level (subtle, collapsible) |
| `/logros` page | Full achievement gallery, mission board, level progression |
| Weekly email digest | Streak status, weekly XP earned, mission progress |

### 9.3 Gamification Anti-Patterns (Avoided)

| Anti-Pattern | Why Avoided |
|---|---|
| Pay-to-win XP | Destroys credibility in financial software |
| Punitive mechanics (losing XP) | Creates anxiety, not trust |
| Social comparison with real data | Privacy violation in financial context |
| Excessive notifications | Annoys busy SME owners |
| Gamification blocking core features | All features accessible regardless of level |

---

## 10. Integration Architecture

### 10.1 FEL Certifier Integration

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│ FEL Certif. │────▶│ IFA Ingestion │────▶│ Normalize &  │
│ API (GUATEFACTURAS,│ Worker (Lambda)│     │ Store (Aurora)│
│ DIGIFACT, etc.)    │               │     │              │
└─────────────┘     └───────────────┘     └──────────────┘
```

| Aspect | Specification |
|---|---|
| Protocol | REST API (certifier-specific adapters) |
| Auth | API keys + OAuth2 where supported |
| Polling interval | Configurable per org (default: every 15 min) |
| Data extracted | DTE UUID, emission date/time, NIT emisor, NIT receptor, line items, IVA, total, series, number |
| Normalization | All certifier formats normalized to IFA canonical DTE schema |
| Retry | Exponential backoff, 3 retries, dead-letter queue for persistent failures |
| Adapters needed | GUATEFACTURAS, DIGIFACT, INFILE, G4S, SAT directo (5 initial adapters) |

### 10.2 TPV / Acquirer Integration

| Acquirer | Method | Data |
|---|---|---|
| BAC Credomatic | API (primary) / SFTP (fallback) | Card transactions: amount, date, time, auth code, merchant ID, card last 4 |
| Banco Industrial | API (primary) / SFTP (fallback) | Same as above |
| Evertec/Visanet | API | Aggregated settlement data |
| Fallback (any bank) | Manual CSV upload | Parsed via column-mapping wizard |

### 10.3 QuickBooks Global Integration

| Aspect | Specification |
|---|---|
| Direction | IFA → QuickBooks (export only in MVP) |
| Format | IIF for Desktop, CSV for Online, API for QBO connected |
| Mapping | IFA chart of accounts → QB chart of accounts (user-configurable mapping table) |
| Frequency | On-demand or scheduled (daily/weekly) |

### 10.4 Integration Adapter Pattern

Each external system gets a dedicated adapter implementing a common interface:

```typescript
interface DataSourceAdapter {
  readonly sourceType: 'FEL' | 'TPV' | 'BANK_CSV' | 'QUICKBOOKS';
  connect(credentials: EncryptedCredentials): Promise<ConnectionResult>;
  pull(since: Date): Promise<RawTransaction[]>;
  normalize(raw: RawTransaction[]): CanonicalTransaction[];
  healthCheck(): Promise<HealthStatus>;
}
```

---

## 11. Data Model — Prisma Schema Outline

> **Note:** This is the structural outline. Full Prisma schema will be generated during implementation with complete field types, indexes, and constraints.

### 11.1 Core Entities

```
Organization
├── id (UUID, PK)
├── name
├── nit (unique, Guatemalan tax ID)
├── industryType (enum)
├── fiscalRegime (enum)
├── logoUrl
├── currency (default GTQ)
├── timezone (default America/Guatemala)
├── subscriptionTier (enum: STARTER, PROFESSIONAL, ENTERPRISE)
├── onboardingCompleted (boolean)
├── createdAt / updatedAt
│
├── members: OrganizationMember[]
├── transactions: Transaction[]
├── accounts: Account[]
├── journalEntries: JournalEntry[]
├── accountingRules: AccountingRule[]
├── integrations: Integration[]
├── healthScores: HealthScore[]
├── gamificationProfiles: GamificationProfile[]
└── auditLogs: AuditLog[]

User
├── id (UUID, PK)
├── auth0Id (unique, external ID)
├── email (unique)
├── name
├── avatarUrl
├── locale (default es-GT)
├── createdAt / updatedAt
│
├── memberships: OrganizationMember[]
└── notifications: Notification[]

OrganizationMember
├── id (UUID, PK)
├── organizationId (FK)
├── userId (FK)
├── role (enum: OWNER, ADMIN, ACCOUNTANT, VIEWER)
├── invitedAt / joinedAt
└── unique(organizationId, userId)
```

### 11.2 Transaction & Reconciliation Entities

```
Transaction
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── source (enum: FEL, TPV, BANK_CSV, MANUAL)
├── externalId (source-specific unique ID)
├── type (enum: INCOME, EXPENSE, TRANSFER)
├── amount (Decimal, precision 12 scale 2)
├── currency (default GTQ)
├── ivaAmount (Decimal)
├── date (Date)
├── time (Time, nullable)
├── description
├── merchantName (nullable)
├── merchantNit (nullable)
├── categoryId (FK, nullable)
├── reconciliationId (FK, nullable)
├── reconciliationStatus (enum: UNMATCHED, MATCHED, MANUAL_MATCH, EXCLUDED)
├── reconciliationConfidence (Float, 0.0–1.0)
├── postingStatus (enum: PENDING, POSTED, REVERSED)
├── aiCategoryConfidence (Float)
├── metadata (JSONB — source-specific raw data)
├── createdAt / updatedAt
│
├── felData: FelDteData? (1:1)
├── tpvData: TpvTransactionData? (1:1)
├── reconciliation: Reconciliation?
├── journalEntryLines: JournalEntryLine[]
└── auditTrail: TransactionAudit[]

FelDteData
├── id (UUID, PK)
├── transactionId (FK, unique)
├── dteUuid (unique)
├── dteType (enum: FACTURA, NOTA_CREDITO, NOTA_DEBITO, RECIBO, etc.)
├── series
├── number
├── nitEmisor
├── nitReceptor
├── certifierName
├── certificationDate
├── xmlStoragePath (S3 key)
├── lineItems (JSONB)
└── rawPayload (JSONB)

TpvTransactionData
├── id (UUID, PK)
├── transactionId (FK, unique)
├── acquirer (enum: BAC, BANCO_INDUSTRIAL, EVERTEC, OTHER)
├── authorizationCode
├── cardLastFour
├── cardBrand (enum: VISA, MASTERCARD, AMEX)
├── terminalId
├── batchNumber
├── settlementDate
└── rawPayload (JSONB)

Reconciliation
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── felTransactionId (FK)
├── tpvTransactionId (FK)
├── matchType (enum: AUTO_EXACT, AUTO_PROBABLE, MANUAL)
├── confidenceScore (Float)
├── matchedFields (JSONB — which fields matched)
├── reconciledAt
├── reconciledBy (FK → User, nullable for auto)
└── notes (nullable)
```

### 11.3 Accounting Entities

```
Account (Chart of Accounts)
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── code (e.g., "1101", "5201")
├── name
├── type (enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
├── parentId (FK → self, nullable, for tree structure)
├── isActive (boolean)
├── isSystemAccount (boolean — protected from deletion)
├── balance (Decimal — cached, updated on posting)
└── createdAt / updatedAt

JournalEntry
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── entryNumber (auto-increment per org)
├── date
├── description
├── source (enum: AUTO, MANUAL, ADJUSTMENT, REVERSAL)
├── sourceTransactionId (FK → Transaction, nullable)
├── periodId (FK → AccountingPeriod)
├── status (enum: DRAFT, POSTED, REVERSED)
├── postedAt / postedBy
├── reversedEntryId (FK → self, nullable)
├── createdAt / updatedAt
│
└── lines: JournalEntryLine[]

JournalEntryLine
├── id (UUID, PK)
├── journalEntryId (FK)
├── accountId (FK → Account)
├── debitAmount (Decimal)
├── creditAmount (Decimal)
├── description (nullable)
└── transactionId (FK → Transaction, nullable)

AccountingRule
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── name
├── priority (Int — execution order)
├── isActive (boolean)
├── conditions (JSONB — rule predicates)
├── actions (JSONB — posting instructions)
├── matchCount (Int — times rule has fired, for analytics)
├── createdAt / updatedAt

AccountingPeriod
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── year (Int)
├── month (Int)
├── status (enum: OPEN, CLOSED, LOCKED)
├── closedAt / closedBy
└── unique(organizationId, year, month)
```

### 11.4 Financial Health Score Entities

```
HealthScore
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── score (Int, 0–1000)
├── previousScore (Int)
├── factors (JSONB — individual factor scores and details)
├── computedAt (DateTime)
├── period (enum: DAILY, ON_DEMAND)
└── metadata (JSONB — computation parameters)

HealthScoreAction
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── healthScoreId (FK)
├── actionType (enum)
├── description (text — AI-generated, Spanish)
├── estimatedImpact (Int — projected score improvement)
├── priority (Int)
├── status (enum: PENDING, COMPLETED, DISMISSED)
├── completedAt
└── createdAt
```

### 11.5 Gamification Entities

```
GamificationProfile
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── userId (FK)
├── totalXp (BigInt)
├── level (Int)
├── currentStreak (Int)
├── longestStreak (Int)
├── lastActiveDate (Date)
├── streakFreezeAvailable (Int)
├── updatedAt
│
├── badges: UserBadge[]
├── missions: UserMission[]
└── xpHistory: XpEvent[]

XpEvent
├── id (UUID, PK)
├── gamificationProfileId (FK)
├── action (enum — matches XP table)
├── xpEarned (Int)
├── metadata (JSONB)
├── earnedAt

Badge
├── id (String, PK — e.g., "streak_7", "health_700")
├── name (Spanish)
├── description (Spanish)
├── iconUrl
├── category (enum)
├── condition (JSONB — machine-readable unlock condition)
├── xpReward (Int)

UserBadge
├── id (UUID, PK)
├── gamificationProfileId (FK)
├── badgeId (FK)
├── unlockedAt
└── unique(gamificationProfileId, badgeId)

Mission
├── id (UUID, PK)
├── type (enum: ONBOARDING, WEEKLY, MONTHLY)
├── name (Spanish)
├── description (Spanish)
├── condition (JSONB)
├── xpReward (Int)
├── badgeReward (FK → Badge, nullable)
├── isActive (boolean)
├── startDate / endDate (nullable, for time-bound)

UserMission
├── id (UUID, PK)
├── gamificationProfileId (FK)
├── missionId (FK)
├── progress (Float, 0.0–1.0)
├── status (enum: ACTIVE, COMPLETED, EXPIRED)
├── startedAt / completedAt
```

### 11.6 Integration & System Entities

```
Integration
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── type (enum: FEL_CERTIFIER, TPV_ACQUIRER, BANK_CSV, QUICKBOOKS)
├── provider (enum: GUATEFACTURAS, DIGIFACT, INFILE, BAC, BANCO_INDUSTRIAL, etc.)
├── status (enum: CONNECTED, DISCONNECTED, ERROR)
├── credentials (encrypted JSONB — KMS-encrypted)
├── lastSyncAt
├── lastError (nullable)
├── config (JSONB — polling intervals, mappings)
├── createdAt / updatedAt

AuditLog
├── id (UUID, PK)
├── organizationId (FK, indexed)
├── userId (FK, nullable — null for system actions)
├── action (enum)
├── entityType (String)
├── entityId (UUID)
├── changes (JSONB — before/after diff)
├── ipAddress
├── userAgent
├── createdAt (indexed)

Notification
├── id (UUID, PK)
├── userId (FK, indexed)
├── organizationId (FK)
├── type (enum: ALERT, INFO, ACHIEVEMENT, MISSION, SYSTEM)
├── title
├── body
├── actionUrl (nullable)
├── channel (enum: IN_APP, EMAIL, PUSH)
├── status (enum: UNREAD, READ, DISMISSED)
├── createdAt

TransactionAudit
├── id (UUID, PK)
├── transactionId (FK)
├── action (enum: CREATED, CATEGORIZED, RECONCILED, POSTED, REVERSED, EDITED)
├── performedBy (enum: SYSTEM, AI, USER)
├── userId (FK, nullable)
├── details (JSONB)
├── createdAt
```

---

## 12. API Structure

### 12.1 Route Convention

```
/api/v1/
├── auth/
│   ├── callback          POST — Auth0 callback
│   └── session           GET — Current session
│
├── organizations/
│   ├── /                 GET (list) / POST (create)
│   ├── /[orgId]          GET / PATCH / DELETE
│   ├── /[orgId]/members  GET / POST / DELETE
│   └── /[orgId]/settings PATCH
│
├── transactions/
│   ├── /                 GET (paginated, filtered) / POST (manual)
│   ├── /[txId]           GET / PATCH
│   ├── /import           POST (CSV upload)
│   ├── /reconcile        POST (trigger reconciliation)
│   └── /bulk             PATCH (bulk categorize/actions)
│
├── accounting/
│   ├── accounts/         GET / POST / PATCH / DELETE
│   ├── journal-entries/  GET / POST / PATCH
│   ├── rules/            GET / POST / PATCH / DELETE
│   └── periods/          GET / PATCH (open/close)
│
├── reports/
│   ├── income-statement  GET (params: startDate, endDate)
│   ├── balance-sheet     GET (params: asOfDate)
│   ├── cash-flow         GET (params: startDate, endDate)
│   ├── iva               GET (params: period)
│   ├── bank-reconciliation GET (params: accountId, period)
│   └── export            POST (params: format, type)
│
├── intelligence/
│   ├── insights          GET (paginated feed)
│   ├── anomalies         GET
│   ├── forecast          GET (params: horizon)
│   ├── recommendations   GET
│   └── health-score      GET / POST (trigger recalculation)
│
├── gamification/
│   ├── profile           GET
│   ├── missions          GET
│   ├── badges            GET
│   ├── leaderboard       GET (params: industry, size)
│   └── xp-history        GET (paginated)
│
├── integrations/
│   ├── /                 GET / POST
│   ├── /[intId]          GET / PATCH / DELETE
│   ├── /[intId]/sync     POST (trigger manual sync)
│   └── /[intId]/health   GET
│
├── notifications/
│   ├── /                 GET (paginated)
│   ├── /[notifId]        PATCH (mark read/dismissed)
│   └── /mark-all-read    POST
│
└── webhooks/
    ├── fel/[certifier]   POST — DTE push notifications
    ├── tpv/[acquirer]    POST — Transaction push
    └── stripe            POST — Billing events
```

### 12.2 API Standards

| Standard | Value |
|---|---|
| Pagination | Cursor-based (`?cursor=xxx&limit=50`) |
| Filtering | Query params: `?source=FEL&status=UNMATCHED&dateFrom=2026-01-01` |
| Sorting | `?sort=date&order=desc` |
| Response envelope | `{ data, meta: { cursor, total, hasMore } }` |
| Error format | `{ error: { code, message, details } }` |
| Rate limiting | 100 req/min per organization (Redis-backed) |
| Versioning | URL path (`/api/v1/`) |
| Content-Type | `application/json` (file uploads: `multipart/form-data`) |

---

## 13. Internationalization Strategy

### 13.1 Language Support

| Phase | Languages | Markets |
|---|---|---|
| MVP | es-GT (Spanish, Guatemala) | Guatemala |
| Phase 2 | es-SV, es-HN, es-CR, es-PA, es-NI | Central America |
| Phase 3 | es-MX, es-CO, es-PE, es-CL, es-AR, pt-BR | Latin America |
| Phase 4 | en-US | US-based LATAM businesses |

### 13.2 Implementation

| Concern | Solution |
|---|---|
| Framework | next-intl (App Router compatible) |
| String storage | JSON message files per locale |
| Number formatting | `Intl.NumberFormat` with locale-specific currency (GTQ, USD, etc.) |
| Date formatting | `Intl.DateTimeFormat` with timezone per organization |
| Tax terminology | Per-country configuration (FEL → CFDI in Mexico, FE in Costa Rica, etc.) |
| Chart of Accounts templates | Per-country accounting standard templates |

### 13.3 Country Expansion Adapter

Each country requires a regulatory adapter:

```typescript
interface CountryAdapter {
  readonly countryCode: string;
  readonly currency: string;
  readonly taxIdFormat: RegExp; // NIT for GT, RFC for MX, etc.
  readonly taxIdLabel: string;
  readonly invoiceSystemName: string; // FEL, CFDI, FE, etc.
  readonly defaultChartOfAccounts: AccountTemplate[];
  readonly taxRates: TaxRate[];
  validateTaxId(id: string): boolean;
  formatCurrency(amount: number): string;
}
```

---

## 14. Security Architecture

| Layer | Measure |
|---|---|
| Transport | TLS 1.3 everywhere, HSTS headers |
| Authentication | Auth0 JWTs, short-lived access tokens (15 min), refresh tokens |
| Authorization | RBAC at API layer + row-level security at Prisma middleware |
| Secrets | AWS Secrets Manager for API keys, DB credentials, integration tokens |
| Encryption at rest | Aurora encrypted (AES-256), S3 encrypted (SSE-S3) |
| Encryption of credentials | Integration credentials encrypted with AWS KMS before storage in JSONB |
| Input validation | Zod schemas on all API inputs, parameterized queries via Prisma |
| CSRF | SameSite cookies + CSRF tokens for state-changing operations |
| Rate limiting | Per-organization, per-endpoint, Redis-backed sliding window |
| Audit trail | Immutable `AuditLog` table, write-only (no UPDATE/DELETE) |
| DTE integrity | Original XML stored in S3, hash stored in DB for tamper detection |
| PII handling | NIT, email, name — tagged as PII in schema, included in data export |
| Dependency scanning | GitHub Dependabot + Snyk for vulnerability scanning |
| Content Security Policy | Strict CSP headers via Vercel middleware |
| Session management | Auth0 session revocation, concurrent session limits |

---

## 15. Deployment Architecture

```
                    ┌──────────────────────┐
                    │    Vercel Edge       │
                    │  (Next.js Frontend   │
                    │   + API Routes)      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   AWS VPC            │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ App Runner     │  │
                    │  │ (Python AI     │  │
                    │  │  microservice) │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Lambda         │  │
                    │  │ (FEL/TPV       │  │
                    │  │  ingestion     │  │
                    │  │  workers)      │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Aurora         │  │
                    │  │ Serverless v2  │  │
                    │  │ (PostgreSQL)   │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ ElastiCache    │  │
                    │  │ (Redis)        │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ S3 / SQS /    │  │
                    │  │ EventBridge    │  │
                    │  └────────────────┘  │
                    │                      │
                    └──────────────────────┘
```

### Environments

| Environment | Purpose | Database |
|---|---|---|
| `development` | Local dev | Local PostgreSQL (Docker) |
| `staging` | Pre-production testing | Aurora Serverless (separate cluster) |
| `production` | Live | Aurora Serverless (multi-AZ) |

### CI/CD Pipeline

```
Push to main → GitHub Actions:
  1. Lint (ESLint + Prettier)
  2. Type check (tsc --noEmit)
  3. Unit tests (Vitest)
  4. Integration tests (Playwright for critical flows)
  5. Prisma migrate deploy (staging)
  6. Deploy to Vercel (staging preview)
  7. Smoke tests against staging
  8. Manual approval gate
  9. Prisma migrate deploy (production)
  10. Deploy to Vercel (production)
  11. Post-deploy smoke tests
  12. Sentry release tracking
```

---

## 16. Observability & Monitoring

| Concern | Tool | Implementation |
|---|---|---|
| Error tracking | Sentry | Next.js + Python SDK, source maps, release tracking |
| Structured logging | Axiom | JSON logs from Vercel + Lambda + App Runner |
| Uptime monitoring | Better Stack | HTTP checks on critical endpoints, status page |
| APM | Vercel Analytics + AWS X-Ray | Request tracing, cold start monitoring |
| Business metrics | PostHog | Feature usage, funnel analysis, retention cohorts |
| Infrastructure | AWS CloudWatch | Aurora metrics, Lambda invocations, SQS queue depth |
| Alerting | PagerDuty (or Axiom alerts) | Threshold-based alerts for error spikes, queue backlog, ingestion failures |

### Key Alerts

| Alert | Condition | Severity |
|---|---|---|
| FEL ingestion failure | >3 consecutive failures for any org | HIGH |
| Reconciliation backlog | >100 unmatched transactions for any org over 48h | MEDIUM |
| Health Score computation failure | Nightly batch fails | HIGH |
| Auth0 login failures spike | >10% error rate in 5 min | CRITICAL |
| Database connection exhaustion | >80% connection pool utilization | HIGH |
| API error rate | >5% 5xx responses in 5 min | HIGH |

---

## 17. Capacitor Mobile Preparation

**Phase:** Post-MVP, triggered upon approval.

### Architecture Decisions for Mobile Readiness

| Decision | Rationale |
|---|---|
| Responsive-first CSS | All components designed mobile-first (Tailwind breakpoints) |
| SSE instead of WebSockets | Better Capacitor compatibility for real-time updates |
| OneSignal push | Works identically for web and Capacitor native push |
| Offline-first transactions | IndexedDB cache for transaction review when offline |
| Biometric auth | Capacitor plugin for Face ID / fingerprint unlock |
| Camera for CSV | Capacitor camera plugin for scanning paper bank statements (OCR) |
| Native share | Share reports via native share sheet |

### Capacitor Plugin List (Pre-Selected)

| Plugin | Purpose |
|---|---|
| `@capacitor/app` | App lifecycle, deep links |
| `@capacitor/push-notifications` | Native push notifications |
| `@capacitor/camera` | Document scanning |
| `@capacitor/share` | Native share sheet for reports |
| `@capacitor/haptics` | Tactile feedback on XP earn, badge unlock |
| `@capacitor/local-notifications` | Streak reminders, reconciliation nudges |
| `@capacitor/biometric` | Biometric authentication |
| `@capacitor/splash-screen` | Branded splash |
| `@capacitor/status-bar` | Status bar color matching nav (navy) |

---

## Appendix A: File Structure

```
inteligencia-financiera/
├── apps/
│   ├── web/                          # Next.js 15 App
│   │   ├── app/
│   │   │   ├── (auth)/               # Auth-required layout group
│   │   │   │   ├── dashboard/
│   │   │   │   ├── transacciones/
│   │   │   │   ├── contabilidad/
│   │   │   │   ├── reportes/
│   │   │   │   ├── inteligencia/
│   │   │   │   ├── logros/
│   │   │   │   └── configuracion/
│   │   │   ├── (public)/             # Public layout group
│   │   │   │   ├── page.tsx          # Landing page
│   │   │   │   ├── precios/
│   │   │   │   └── login/
│   │   │   ├── onboarding/
│   │   │   ├── api/v1/               # API routes
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui primitives
│   │   │   ├── dashboard/
│   │   │   ├── transactions/
│   │   │   ├── accounting/
│   │   │   ├── reports/
│   │   │   ├── intelligence/
│   │   │   ├── gamification/
│   │   │   ├── settings/
│   │   │   └── shared/               # Layout, nav, org-switcher
│   │   ├── lib/
│   │   │   ├── auth/                 # Auth0 config + middleware
│   │   │   ├── db/                   # Prisma client + middleware
│   │   │   ├── integrations/         # FEL, TPV, QB adapters
│   │   │   ├── services/             # Business logic layer
│   │   │   ├── gamification/         # XP, streak, mission engine
│   │   │   ├── health-score/         # Score computation client
│   │   │   ├── ai/                   # Claude API client
│   │   │   ├── validators/           # Zod schemas
│   │   │   ├── utils/
│   │   │   └── constants/
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── stores/                   # Zustand stores
│   │   ├── types/                    # TypeScript types
│   │   ├── messages/                 # i18n JSON files
│   │   │   ├── es-GT.json
│   │   │   └── en-US.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts               # Chart of accounts templates (NOT mock data)
│   │   ├── public/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── ai-service/                   # Python FastAPI microservice
│       ├── app/
│       │   ├── main.py
│       │   ├── routers/
│       │   │   ├── health_score.py
│       │   │   ├── anomaly_detection.py
│       │   │   ├── categorization.py
│       │   │   └── forecast.py
│       │   ├── models/               # ML models + data models
│       │   ├── services/
│       │   └── config.py
│       ├── tests/
│       ├── requirements.txt
│       ├── Dockerfile
│       └── pyproject.toml
│
├── packages/                         # Shared packages (if monorepo)
│   ├── types/                        # Shared TypeScript types
│   └── validators/                   # Shared Zod schemas
│
├── infrastructure/
│   ├── terraform/                    # AWS infrastructure as code
│   └── docker-compose.yml            # Local development
│
├── docs/                             # Architecture documentation
├── .github/
│   └── workflows/                    # CI/CD pipelines
├── turbo.json                        # Turborepo config
├── package.json
└── README.md
```

---

## Appendix B: Key Database Indexes

```sql
-- Transaction queries (most frequent)
CREATE INDEX idx_tx_org_date ON "Transaction" ("organizationId", "date" DESC);
CREATE INDEX idx_tx_org_status ON "Transaction" ("organizationId", "reconciliationStatus");
CREATE INDEX idx_tx_org_source ON "Transaction" ("organizationId", "source");
CREATE INDEX idx_tx_merchant_nit ON "Transaction" ("merchantNit") WHERE "merchantNit" IS NOT NULL;

-- FEL lookups
CREATE UNIQUE INDEX idx_fel_dte_uuid ON "FelDteData" ("dteUuid");

-- Reconciliation matching
CREATE INDEX idx_tx_match ON "Transaction" ("organizationId", "amount", "date", "source");

-- Accounting
CREATE INDEX idx_je_org_period ON "JournalEntry" ("organizationId", "periodId");
CREATE INDEX idx_jel_account ON "JournalEntryLine" ("accountId");

-- Audit (time-series queries)
CREATE INDEX idx_audit_org_time ON "AuditLog" ("organizationId", "createdAt" DESC);

-- Gamification
CREATE INDEX idx_xp_profile_time ON "XpEvent" ("gamificationProfileId", "earnedAt" DESC);

-- Health score history
CREATE INDEX idx_health_org_time ON "HealthScore" ("organizationId", "computedAt" DESC);
```

---

*End of Scaffolding Document*
