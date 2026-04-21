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

**Important**: per locked **D-5**, there is a single Supabase project; `main` branch is production. Preview deploys read/write the **same** Supabase. This is acceptable for MVP with a solo builder and no live users; revisit when the first pilot onboards.

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
