# A. Plan shape (drives the document itself)

## Granularity: roadmap-level (quarters/milestones), sprint-level (2-week tickets with owners), or full work-breakdown (engineering stories with acceptance criteria)?

-> Full work breakdown

## MVP definition: all P0 features across all 7 modules (Dashboard, Transactions, Contabilidad, Reportes, Inteligencia, Logros, Configuración), or a tighter wedge that ships sooner — e.g., FEL ingestion + auto-reconciliation + dashboard + IVA report + QuickBooks export only, with Inteligencia/Logros deferred to v1.1?

-> all P0 features across all 7 modules

## Plan horizon: MVP only, MVP → Phase 2 (Central America expansion), or full multi-year through LATAM?

-> MVP only

# B. Team, timeline, capacity

## Who is building this? Solo (you), in-house team (size + roles?), agency, or to-be-hired? This determines parallelism and critical path.

-> Solo

## Target launch date (or any hard deadline), and budget envelope for AWS/Auth0/Anthropic/Vercel/etc.?

-> No launch date. Best-in-the-world quality is the criteria, take the time it requires.

# C. Tech foundations to confirm (defaults exist in scaffolding — confirm or override)

## Monorepo + Turborepo from day 1 (per Appendix A), or single Next.js repo first and split later?

-> Next.js repo is ok for MVP, split if MVP gains support and traction.

## Python AI microservice in parallel from day 1, or TS-only MVP (Health Score initially computed in TypeScript, Python service introduced when ML complexity justifies it)?

-> TS only MVP.

# D. Account/infrastructure status (Rule 1: I need real status, not assumptions)

## Which of these already exist vs. need provisioning: AWS account, Auth0 tenant, Vercel team, Anthropic API key, GitHub org, Sentry, Axiom, OneSignal, Better Stack, PostHog, domain name?

-> Github, Vercel, Supabase, Anthropic

# E. Integration partners & real data (this is the biggest Rule 4 risk)

## FEL certifiers: any existing partnership, sandbox credentials, or contact at GUATEFACTURAS / DIGIFACT / INFILE / G4S / SAT directo? Without sandbox access, adapters can be scaffolded but not validated — and Rule 4 forbids fake DTEs.

-> MVP will serve as POC to seek partnership with a FEL certifier.

## TPV/Acquirers: pre-existing relationship with BAC Credomatic, Banco Industrial, or Evertec/Visanet, or should the plan assume CSV-upload-only for MVP and treat API/SFTP as post-launch?

-> MVP will serve as POC to seek partnership with banks.

## Pilot SME(s): any signed or lined up to provide real production data for testing reconciliation, AI categorization, and the Financial Health Score? If none, the plan must include a data-acquisition workstream — I cannot test the engine on invented data.

-> MVP will serve as POC to seek partnership with a test users willing to upload their real data.

# F. Billing, legal, compliance

## Subscription billing for IFA itself: Stripe (which requires a non-GT entity), local gateway (Recurrente, Visanet GT, NeoNet, etc.), or defer billing until post-launch with a free pilot phase?

-> Defer.

## Legal gating: who authors Privacy Policy / Terms of Service / SAT compliance attestations? Is there a launch-blocking legal review or DPO role assigned?

-> We have a legal department. If the MVP gains support and traction, we can request hours from the legal department.

# G. Brand / identity

## Domain name decided? Logo/brand assets exist? Confirm public product name = "Inteligencia Financiera App" abbreviated "IFA" consistently?

-> No brand or identity exist yet. Use name and abbreviation consistently until further notice. Use lucide react appropriate icon for logo, favicon, and og images.

# H. Multi-tenancy nuance

## Scaffolding §3 supports one User being OWNER of Org A and ACCOUNTANT of Org B — implying the Canal Contable (accounting-firm) channel is live from day 1. Confirm this is in MVP, not deferred to a later tier.

-> Defer.
