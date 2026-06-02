# Vercel setup

One-time manual setup to connect the IFA repository to Vercel. Takes ~10 minutes.

## 1. Import the repository

1. Sign in to https://vercel.com with the account that owns this project.
2. Click **Add New → Project**.
3. Select the `innovationwizard/ifa` repository from GitHub.
4. Accept the default framework detection (`Next.js`).
5. Leave the root directory as `./` and the build command as `pnpm build`.
6. Click **Deploy**.

The first deploy will fail because environment variables are not set yet — that is expected.

## 2. Configure environment variables

Vercel has three environment scopes: **Production**, **Preview**, and **Development**. Copy every variable from [`.env.example`](../../.env.example) into the Vercel project settings under **Settings → Environment Variables**. Assign scopes as follows:

| Variable                        | Production                                                                                         | Preview                 | Development                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`          | Set to the custom domain when available; leave unset otherwise (we auto-fall-back to `VERCEL_URL`) | leave unset             | `http://localhost:3000` (local `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_URL`      | prod project URL                                                                                   | prod project URL (same) | prod or local Supabase URL                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key                                                                                      | prod anon key           | prod or local anon key                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | prod service role                                                                                  | prod service role       | prod or local service role                   |
| `DATABASE_URL`                  | prod pooled URL                                                                                    | prod pooled URL         | prod or local pooled URL                     |
| `DIRECT_URL`                    | prod direct URL                                                                                    | prod direct URL         | prod or local direct URL                     |
| `ANTHROPIC_API_KEY`             | real key                                                                                           | real key                | real key                                     |
| `NEXT_PUBLIC_DEMO_MODE`         | `false`                                                                                            | `false`                 | `false`                                      |
| `CRON_SECRET`                   | random 32+ char string                                                                             | same as production      | same as production (any value works locally) |

**Important**: per locked **D-5**, there is a single Supabase project; `main` branch is production. Preview deploys read/write the **same** Supabase. This is acceptable for MVP with a solo builder and no live users; revisit when the first pilot onboards.

### `CRON_SECRET` notes

Shared-secret Bearer token consumed by three server-side endpoints — none of them user-facing:

- `GET /api/cron/jobs` — manual ops drain for the `PendingJob` queue (kept after [ADR-001](./_DECISIONS.md#adr-001--no-cron-for-job-queue-draining-user-triggered-procesar-ahora-button-instead) removed the cron schedule)
- `GET /api/cron/health-score` — manual ops drain for nightly Health Score recompute (kept after [ADR-002](./_DECISIONS.md#adr-002--no-vercel-cron-at-all-health-score-auto-recomputes-on-dashboard-visit-when-stale) removed the cron schedule)
- `POST /api/admin/backfill-categorization?confirm=yes` — one-off backfill for transactions inserted before the auto-categorization wiring (B5)

All three routes **fail-closed** when `CRON_SECRET` is unset — they return 401 rather than running unauthenticated. No scheduler currently fires them; they are curl-able from the operator's machine when needed (`curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/health-score`).

Rotate on leak. After rotation, redeploy production so the new value is picked up by the route handlers (Vercel does this automatically on env-var change).

## 2.5 Transactional email (Phase L4 — provider-agnostic)

IFA's email layer supports BOTH **Resend** and **AWS SES**. Pick one per environment via `EMAIL_PROVIDER`. The same `sendEmail()` API works against either — swapping later is an env-var change, not a code edit. When `EMAIL_PROVIDER` is unset, the app runs in "email-disabled" mode (sends are logged + skipped). This is the only mode that ships without configuration; pick a provider before opening signups to anyone outside your phone contacts.

There are **two distinct surfaces** that send email:

1. **Supabase Auth emails** (magic links, email-change confirmations, OTP for delete confirmation). These are sent by Supabase, not by our code. To brand them with our domain, configure Supabase's **Custom SMTP** to relay through Resend or SES — instructions below.
2. **App-level transactional emails** (welcome, deletion receipt, billing, etc.). These go through our `sendEmail()` helper at `src/lib/email`. No code calls it today (L4 ships the foundation only); L5+ will wire callsites as features need them.

You can configure surface #1 without #2 (Supabase SMTP relay only) or both — they're independent.

### 2.5.A Choose a provider

|                | **Resend**                    | **AWS SES**                                       |
| -------------- | ----------------------------- | ------------------------------------------------- |
| Setup time     | 10 min                        | 30 min (IAM + production access request)          |
| Free tier      | 100/day, 3 000/mo             | 200/day from EC2 only; 62 000/mo if sent from EC2 |
| Paid pricing   | $20/mo + $0.001/extra         | $0.10 per 1 000 emails                            |
| Region         | Global                        | Pick one (we recommend `us-east-1`)               |
| DKIM/SPF setup | Resend dashboard guides you   | Manual DNS in Route 53 / your registrar           |
| Best for       | MVP / friends-and-family beta | Scale (hundreds of thousands/mo)                  |

The recommendation for the friends-and-family beta is **Resend** for the relay AND `EMAIL_PROVIDER=resend` in the codebase. Migrate to SES only when monthly volume × Resend's $0.001 starts to matter.

### 2.5.B Set the env vars (both providers)

Three vars are always required when `EMAIL_PROVIDER` is set:

| Variable             | Purpose                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`     | `resend` or `ses`                                                                                                            |
| `EMAIL_FROM_ADDRESS` | The sender address. **Must be DKIM/SPF-verified at the chosen provider**, otherwise sends bounce. Example: `noreply@ifa.gt`. |
| `EMAIL_FROM_NAME`    | Display name shown in the From header. Example: `IFA`.                                                                       |

Plus the provider-specific creds:

**For Resend** (`EMAIL_PROVIDER=resend`):

| Variable         | Purpose                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) → API Keys. Scope to "Sending access" only. |

**For AWS SES** (`EMAIL_PROVIDER=ses`):

| Variable                    | Purpose                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_SES_REGION`            | The SES region you provisioned. Example: `us-east-1`.                                                                                               |
| `AWS_SES_ACCESS_KEY_ID`     | IAM user access key. The IAM user should have ONLY the `AmazonSesSendingAccess` AWS-managed policy. Never use root credentials or a broader policy. |
| `AWS_SES_SECRET_ACCESS_KEY` | Paired secret.                                                                                                                                      |

> The AWS keys are deliberately namespaced `AWS_SES_*` (not the standard `AWS_*`) so they don't collide with other AWS integrations on the same Vercel project.

### 2.5.C Set up Resend (recommended path)

1. Sign up at [resend.com](https://resend.com).
2. Add your sending domain in **Domains** → click your domain → copy the SPF, DKIM, and DMARC records into your DNS provider. Wait for "Verified" status (usually < 10 min).
3. **API Keys** → Create API key → scope: "Sending access" → copy the `re_*` key.
4. Set Vercel env vars: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=re_...`, `EMAIL_FROM_ADDRESS=noreply@your-domain`, `EMAIL_FROM_NAME=IFA`.

### 2.5.D Set up AWS SES (when scale demands it)

1. AWS Console → SES → pick a region (typically `us-east-1`).
2. **Verified identities** → add your sending domain → publish the DKIM CNAMEs SES gives you to your DNS provider.
3. **Request production access** (new accounts start in sandbox: only verified recipients can receive). Approval usually takes 24 hours.
4. IAM → create a dedicated user (e.g. `ifa-ses-sender`) → attach the AWS-managed policy `AmazonSesSendingAccess` → create access keys → copy the key + secret.
5. Set Vercel env vars: `EMAIL_PROVIDER=ses`, `AWS_SES_REGION=us-east-1`, `AWS_SES_ACCESS_KEY_ID=...`, `AWS_SES_SECRET_ACCESS_KEY=...`, `EMAIL_FROM_ADDRESS=noreply@your-domain`, `EMAIL_FROM_NAME=IFA`.

### 2.5.E Wire Supabase Auth to use the same provider (Custom SMTP)

Both Resend and SES expose SMTP endpoints. Supabase's **Auth → Emails → SMTP Settings** form accepts either — same fields, different host/port.

Open the Supabase dashboard → **Authentication** → **Emails** → **SMTP Settings** → enable **Custom SMTP**. Then fill in:

**If using Resend SMTP relay:**

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| Sender email | matches `EMAIL_FROM_ADDRESS` (e.g. `noreply@ifa.gt`) |
| Sender name  | `IFA`                                                |
| Host         | `smtp.resend.com`                                    |
| Port         | `465` (SSL) — or `587` (STARTTLS)                    |
| Username     | `resend` (literal string)                            |
| Password     | the same `re_*` API key from §2.5.C                  |

**If using AWS SES SMTP relay:**

| Field        | Value                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sender email | matches `EMAIL_FROM_ADDRESS`                                                                                                                                                                   |
| Sender name  | `IFA`                                                                                                                                                                                          |
| Host         | `email-smtp.us-east-1.amazonaws.com` (substitute your region)                                                                                                                                  |
| Port         | `587` (STARTTLS)                                                                                                                                                                               |
| Username     | SMTP username — **NOT** the IAM access key. Generate via AWS Console → SES → **SMTP settings** → Create SMTP credentials. SES gives you a different username/password pair than the SDK creds. |
| Password     | the paired SMTP password from the same SES creds page                                                                                                                                          |

After saving, **Authentication → Email Templates** → edit each template (Confirm signup, Magic Link, Change Email Address, Reset Password, Invite user) into es-GT, tú-register. Keep the `{{ .ConfirmationURL }}` placeholder intact — Supabase substitutes it at send time. See §2.5.F for the recommended copy.

### 2.5.F Verify and rotate

After configuring, trigger a magic link from `/ingresar` and inspect the message: it must come from `EMAIL_FROM_ADDRESS`, be branded "IFA", and have a clean DMARC pass in Gmail's "Show original".

Rotate credentials on suspected leak. After rotation, redeploy production (Vercel auto-redeploys on env-var change) so the cached HTTP/SMTP clients pick up the new value.

## 2.6 Stripe billing (Phase L5 — live keys, day-one)

IFA bills $1 USD/month for INDIVIDUAL and $20 USD/month for BUSINESS. The codebase is fully wired (checkout, customer portal, webhook with bulletproof idempotency). What's missing is the founder-side configuration in the Stripe dashboard, listed below.

> **Test mode vs live mode.** The founder's decision (2026-06-02) is **live keys from day one**. Test customers do NOT carry over to live, so any test-mode dry-runs must happen on a separate Stripe test account. Don't mix.

### 2.6.A Create products + prices in Stripe (live mode)

1. Sign in to [dashboard.stripe.com](https://dashboard.stripe.com), toggle to **Live mode** (top right).
2. **Products** → **Add product**.
   - Name: `IFA Individual`
   - Pricing model: **Recurring**
   - Price: `$1.00 USD` / **Monthly**
   - Click **Save product**. Copy the resulting price id (`price_*`) — this is `STRIPE_PRICE_INDIVIDUAL_ID`.
3. Repeat for `IFA Business` at `$20.00 USD` / Monthly. Copy that price id as `STRIPE_PRICE_BUSINESS_ID`.

### 2.6.B Enable Stripe-sent invoice emails

Founder decision (2026-06-02): Stripe sends the official receipt. No app-level receipt code (deferred to a later L4 callsite if branded receipts become a priority).

1. **Settings → Invoices** → **Customer emails**.
2. Toggle ON: **Email invoices to customers**.
3. Toggle ON: **Email finalized invoices to customers**.
4. (Optional but recommended) Customize the invoice template's logo, color, footer in **Settings → Branding**.

### 2.6.C Configure the webhook endpoint

1. **Developers → Webhooks** → **Add an endpoint**.
2. Endpoint URL: `https://<your-domain>/api/stripe/webhook`. For Vercel preview deploys, also add a separate endpoint pointing at the preview URL pattern if you want preview-deploy testing.
3. **Events to send**: select these five:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. **Add endpoint** → copy the **Signing secret** (`whsec_*`) — this is `STRIPE_WEBHOOK_SECRET`.

> The webhook handler is idempotent (every event id is recorded in `stripe_event_logs` inside a `$transaction` — duplicate deliveries are no-ops). Safe to leave Stripe's automatic retries enabled.

### 2.6.D Set the Vercel env vars

Production scope:

| Variable                     | Value                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `STRIPE_SECRET_KEY`          | live secret (`sk_live_*`) from **Developers → API keys** |
| `STRIPE_WEBHOOK_SECRET`      | from §2.6.C                                              |
| `STRIPE_PRICE_INDIVIDUAL_ID` | from §2.6.A (Individual product)                         |
| `STRIPE_PRICE_BUSINESS_ID`   | from §2.6.A (Business product)                           |

After saving, redeploy production so the Stripe client picks up the new env (Vercel does this automatically on env-var change).

### 2.6.E Verify

1. Go to `/precios` while signed in → click "Pasar a este plan" on Individual → Stripe Checkout opens.
2. Pay with a real card. The webhook fires; check Stripe dashboard → **Developers → Events** for the matching `checkout.session.completed` and the 200 response from our endpoint.
3. Visit `/configuracion/facturacion` — should show "Tu suscripción está activa".
4. Click "Gestionar pago" → Stripe customer portal opens; verify you can update the card and cancel.
5. (Optional, after a few minutes) check `select * from stripe_event_logs order by processed_at desc limit 10` in Supabase to confirm event ids landed.

If anything fails: the webhook returns the error key in the JSON body — visible in Stripe → Developers → Events → click the failed event. Common issues:

- `invalid_signature`: `STRIPE_WEBHOOK_SECRET` mismatch (re-copy from §2.6.C).
- `billing_not_configured`: `STRIPE_SECRET_KEY` not set in production scope.
- 500 with `handler_failed`: bug in our code; check the Vercel function logs.

### 2.6.F Rotate

If a secret key leaks: **Developers → API keys** → **Roll** → copy the new `sk_live_*` → update Vercel env → redeploy. The old key is invalidated immediately. For the webhook secret: re-add the endpoint and copy the new signing secret (Stripe doesn't expose rotation in-place for webhooks).

## 3. Configure the `ifa-demo` deployment (D-1.B)

The demo deployment is a **separate Vercel project** (`ifa-demo`) that connects to a **separate, throwaway Supabase project**. This guarantees that DEMO mode cannot contaminate production data (Rule 4 + plan §S-10.7).

1. Add New → Project → same GitHub repo → name it `ifa-demo`.
2. Under **Settings → Git**, change the production branch to a dedicated `demo` branch (or keep `main` and only redeploy manually).
3. Copy all environment variables from the `ifa` project, **but replace** Supabase credentials with a brand-new throwaway project's credentials, and set `NEXT_PUBLIC_DEMO_MODE=true`.
4. CI assertion in S-10.7 will verify `NEXT_PUBLIC_DEMO_MODE !== 'true'` in the production `ifa` deployment.

## 4. Verify the flow

1. Push a dummy commit to a new branch and open a PR.
2. Vercel creates a preview URL — open it; the home page should render in Spanish with the correct OG image.
3. Merge the PR; `main` auto-deploys to production.

## 5. Custom domain (deferred)

Per the plan, MVP runs on `*.vercel.app` URLs. When a custom domain is acquired:

1. **Settings → Domains** → add the domain.
2. Follow Vercel's DNS instructions (A records or CNAME).
3. Set `NEXT_PUBLIC_SITE_URL` in production to the new domain, **with https://** and **no trailing slash**.
4. Vercel auto-provisions Let's Encrypt TLS.

## 6. Secret hygiene

- Never commit any file matching `.env*` except `.env.example` (enforced by `.gitignore`).
- Rotate `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` if exposed in logs, browser bundles, or a public commit.
- Gitleaks or secret-scanning CI will be added in a later hardening story (see plan §S-11.4).
