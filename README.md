# Vibe Coding Template

<p align="center">
  <img src="docs/assets/vibe_tmpl_schema.png" alt="Vibe Coding Template architecture schema" width="100%">
</p>

A full-stack, Supabase-native starter for web products. One repository ships a React 19 + Vite browser app behind login (`webapp`), an Astro public/SEO site (`website`), shared Zod contracts, and a Supabase backend made of SQL migrations and Deno Edge Functions. There is **no application server to run or host**: Supabase owns auth, database, and serverless functions; Vercel hosts the two frontends as static deployments.

Authentication is **Google sign-in only** (via Supabase Auth). Payments are **creem.io subscriptions**, wired through two Edge Functions. The runnable Expo mobile template lives on the `mobile` branch so the default branch stays focused on the web surfaces, contracts, and Supabase backend.

This is a **template**. Every install-specific value (Supabase project ref/URL/keys, creem product id and keys, domains) is a placeholder you fill in for your own project — nothing here is hardcoded to a real project.

> **Setting up your own copy?** Follow **[docs/SETUP.md](docs/SETUP.md)** — step-by-step setup for Supabase (database + Google sign-in), creem.io (subscriptions), local dev, and Vercel deployment. The sections below explain how each piece works.

## What's Inside

- `webapp` — React 19 + Vite client-side (CSR) browser app. Lives behind login (Google sign-in + an active subscription). Uses TanStack Router for client routing and TanStack Query for server state. Talks to Supabase directly with the anon/publishable key.
- `website` — separate Astro project for public, SEO-facing pages (landing, marketing, content). Static SSG by default, SSR per route.
- `packages/contracts` — shared Zod schemas and TypeScript types (currently `profileSchema` and an API error schema). Imported as `@web-app-demo/contracts`.
- `supabase/migrations` — SQL migrations: the `profiles` and `subscriptions` tables, Row Level Security policies, and the signup trigger that mirrors each new auth user into `profiles`.
- `supabase/functions` — Deno Edge Functions: `creem-checkout` (authenticated — creates checkout / billing-portal links) and `creem-webhook` (public — HMAC-verifies creem events and upserts subscriptions with the service-role key).
- `mobile/README.md` — pointer to the runnable Expo mobile template on the `mobile` branch.

## Architecture

There is no custom backend process. The system is three pieces that talk to one Supabase project:

- **Supabase** owns identity, data, and server logic. Supabase Auth handles Google OAuth and issues sessions. PostgreSQL holds `profiles` and `subscriptions` with Row Level Security so each user can read only their own rows. Edge Functions (Deno) run the small amount of server-side logic the product needs (creem checkout and webhook handling).
- **Vercel** hosts the two frontends as separate projects. `webapp` deploys as a static SPA; `website` deploys as an Astro site. Neither needs a long-running server you operate.
- **creem.io** handles subscription billing. The `webapp` calls the `creem-checkout` Edge Function to start a checkout or open the billing portal; creem calls the public `creem-webhook` Edge Function to report subscription changes, which are persisted to the `subscriptions` table.

Contracts in `packages/contracts` are the shared source of truth for payload and error shapes, imported by `webapp` and reusable by `website`. Keep the architecture monolithic-by-Supabase: add Edge Functions for new server logic rather than standing up a separate API server.

### Choosing `webapp` vs `website`

This template ships two browser surfaces. Putting a feature in the wrong one is the most common early mistake, so pick deliberately and explain the choice in product terms.

- Build it in **`website`** (Astro, static by default, SSR per route) when the pages must be **public and found by search engines or shared with rich link previews**: marketing/landing pages, content sites, blogs, docs, and the public storefront of a **marketplace** (home, category, search, product pages that Google must index). This is the SEO surface. Pages are static SSG by default; switch a single dynamic route to server rendering with `export const prerender = false` when its data changes often or is request-specific.
- Build it in **`webapp`** (React, client-side rendered, behind login) when the screens live **behind sign-in and do not need SEO**: dashboards, account settings, authenticated tools, the seller/admin panel of a marketplace. No crawler needs these, so CSR is the simpler, cheaper choice.

Rule of thumb: *if a page must rank in search or preview nicely when shared, it belongs in `website`; if it is only reachable after login, it belongs in `webapp`.* Real products often use **both**, and both can reuse the same `@web-app-demo/contracts` schemas. Do not rebuild SEO pages inside `webapp` to "keep everything in one app"; that loses the SEO the product needs.

## Quick Start (Local)

No Docker and no local PostgreSQL are required — local development runs the frontends against your hosted Supabase project.

Install dependencies from the repository root:

```bash
bun install
```

Create the webapp env file and fill in your Supabase project values:

```bash
# macOS, Linux, or Git Bash on Windows
cp webapp/.env.example webapp/.env
```

```powershell
# Windows PowerShell
Copy-Item webapp/.env.example webapp/.env
```

Set both variables in `webapp/.env` to your Supabase project's API settings:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-or-publishable-key>
```

Run the surfaces you need, in separate terminals:

```bash
bun run dev:webapp
bun run dev:website
```

The `webapp` Vite dev server defaults to `http://localhost:5173`. Sign-in and subscription features need a Supabase project with Google OAuth and the creem Edge Functions configured — see the setup sections below.

## How Auth Works (Supabase)

- **Provider:** Google OAuth only, via Supabase Auth. There is no email/password path.
- **Profiles:** a database trigger creates a matching `public.profiles` row whenever a new user signs up, so every authenticated user has a profile with their `id` and `email`.
- **Access control:** Row Level Security is enabled on `profiles` and `subscriptions`. Users can read only their own rows. `subscriptions` has no client write policy — only the service-role webhook writes there.
- **Client:** the `webapp` uses the Supabase JS client with the anon/publishable key. Supabase manages the session; gated screens require both a valid session and an active subscription.

Per-install setup: in the Supabase dashboard, enable the **Google** auth provider (add your Google OAuth client id/secret and the project's callback URL), then add your local and production app URLs to the Auth redirect allow-list.

## How Subscriptions Work (creem.io)

Two Edge Functions in `supabase/functions` connect the app to creem:

- **`creem-checkout`** (authenticated): the `webapp` calls it with the user's Supabase session. With `action: "checkout"` it creates a creem checkout link for `CREEM_PRODUCT_ID` (tagging the user via metadata and customer email). With `action: "portal"` it returns a creem billing-portal link for the user's existing customer.
- **`creem-webhook`** (public): creem calls this on subscription events. It verifies the `creem-signature` header (HMAC-SHA256 over the raw body using `CREEM_WEBHOOK_SECRET`), then upserts the user's row in `subscriptions` using the **service-role key** (bypassing RLS). The upsert is idempotent, keyed by `creem_subscription_id`, and resolves the user by matching the checkout customer email to a `profiles` email.

Per-install setup in creem: create a product, copy its product id, and configure a webhook pointing at your deployed `creem-webhook` function URL. Set these Edge Function secrets in Supabase (Project Settings → Edge Functions secrets):

- `CREEM_API_KEY` — creem API key.
- `CREEM_PRODUCT_ID` — the subscription product id.
- `CREEM_WEBHOOK_SECRET` — the signing secret for webhook signature verification.
- `CREEM_API_BASE` — optional; defaults to creem's test API base. Set to the live base for production.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by the Supabase platform.

## Deploy to Vercel

Deploy `webapp` and `website` as **two separate Vercel projects** from the same repository, each with a different **Root Directory**:

| Vercel project | Root Directory | Notes |
| --- | --- | --- |
| webapp | `webapp` | SPA. `webapp/vercel.json` rewrites all routes to `/index.html`. |
| website | `website` | Astro build output. |

Environment variables per project:

- **webapp** (same values as local `webapp/.env`):
  - `VITE_SUPABASE_URL` — `https://<your-project-ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` — your anon/publishable key
- **website**:
  - `PUBLIC_WEBAPP_URL` — the webapp's production URL, so the landing's "Get started" / "Sign in" links point at the app. Use the webapp project's **stable production domain** (e.g. `https://<your-webapp>.vercel.app`), not a per-deploy preview URL. Redeploy `website` after setting it (it is read at build time).

**Make the deployments public.** New Vercel projects often enable **Deployment Protection (Vercel Authentication)**, which puts a Vercel login wall in front of the site (visitors get `401`/a login screen). For a public app and landing, turn it off: each project → Settings → Deployment Protection → disable Vercel Authentication (or scope it to preview deployments only).

When wiring URLs (PUBLIC_WEBAPP_URL, Supabase redirect list, Google origins), always use each project's **stable production domain**, not the hashed per-deploy URLs, which change on every deploy.

Per-install backend setup that must exist before the deployed app works:

1. **Supabase project** — create the project, apply the SQL in `supabase/migrations` (in order) to create `profiles`, `subscriptions`, RLS policies, and the signup trigger.
2. **Google OAuth** — enable the Google provider in Supabase Auth and add your production `webapp` domain to the redirect allow-list.
3. **creem** — create the subscription product and webhook, then deploy both Edge Functions and set the `CREEM_*` secrets described above. Point the creem webhook at the deployed `creem-webhook` URL.

Add your production domains to the relevant Vercel projects, and keep the Supabase Auth redirect list and creem success/portal URLs in sync with those domains.

## Workspace Commands

Run from the repository root:

- `bun run dev` — start all workspace projects in parallel dev mode.
- `bun run dev:webapp` — start the Vite CSR webapp.
- `bun run dev:website` — start the Astro website project.
- `bun run build` — build all workspaces.
- `bun run build:webapp` — build the webapp.
- `bun run build:website` — build the website.
- `bun run typecheck` — run TypeScript checks across workspaces.
- `bun run test` — run contract and webapp tests.
- `bun run test:contracts` — run shared Zod contract tests.
- `bun run test:webapp` — run webapp client tests.
- `bun run e2e:webapp` — run the webapp Playwright end-to-end suite.

## Project READMEs

- [webapp/README.md](webapp/README.md) — CSR browser client setup, env, and Playwright E2E.
- [website/README.md](website/README.md) — Astro website commands, hybrid rendering, and publishing model.
- [packages/contracts/README.md](packages/contracts/README.md) — shared schema and type rules.
- [mobile/README.md](mobile/README.md) — pointer to the full mobile template branch.

First-run setup lives in [docs/SETUP.md](docs/SETUP.md). Engineering guidance lives in [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/TESTING.md](docs/TESTING.md).

## Current Upstream Documentation

For framework, platform, or testing questions, consult the current upstream documentation first. The repository docs describe this template's conventions; the linked docs are authoritative for tool behavior.

- Runtime and package manager: [Bun docs](https://bun.sh/docs)
- Web app: [React docs](https://react.dev/reference/react), [Vite guide](https://vite.dev/guide/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), and [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- Website: [Astro docs](https://docs.astro.build/en/getting-started/)
- Validation and contracts: [Zod docs](https://zod.dev/)
- Backend platform: [Supabase docs](https://supabase.com/docs), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase Edge Functions](https://supabase.com/docs/guides/functions), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Payments: [creem.io docs](https://docs.creem.io/)
- Hosting: [Vercel docs](https://vercel.com/docs)
- Testing: [Playwright docs](https://playwright.dev/docs/intro)
