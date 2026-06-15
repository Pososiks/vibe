# Re-platform: Supabase + Vercel + creem.io

Date: 2026-06-15
Status: Approved design, phased delivery

## Goal

Re-platform the template from a self-hosted Bun/Hono + Prisma + DigitalOcean
stack to a Supabase-native stack hosted on Vercel:

- Database: Supabase Postgres (with Row Level Security).
- Auth: Google OAuth via Supabase Auth (Google is the only sign-in method).
- Hosting: Vercel (frontends only). No standalone application server.
- Payments: creem.io subscriptions (basic baseline feature).
- Remove entirely: DigitalOcean, Yandex Cloud, DO Spaces storage, the custom
  Bun/Hono backend, Prisma, and the custom JWT auth.

This replaces the foundation of the template, not a feature on top of it. The
existing, well-tested backend (auth, sessions, storage, worker/cron) and the
email/password flow are intentionally dropped.

## Target architecture

No application server. Frontends on Vercel talk to Supabase directly (Auth +
Postgres + RLS). The only server-side logic is what cannot be trusted to the
client (creem.io checkout creation and webhook handling); it lives in Supabase
Edge Functions running with the service-role key.

```
Browser
  ├── website (Astro, Vercel)      → public SEO pages: landing, /pricing
  └── webapp  (React CSR, Vercel)  → behind login: Google sign-in, account,
            │                          subscription status, "Subscribe"
            ├── @supabase/supabase-js (anon key) → Auth + RLS-guarded data
            └── invoke('creem-checkout')         → Edge Function returns checkout URL

creem.io ──webhook──▶ Edge Function 'creem-webhook' (service-role) ──▶ subscriptions table
```

## Data model and RLS (Supabase Postgres)

`auth.users` is owned by Supabase Auth (Google). Two tables in `public`:

- **`profiles`** — `id uuid PK = auth.users.id`, `email`, `display_name`,
  `created_at`, `updated_at`. Populated by an `on auth.user created` trigger.
  RLS: a user can select/update only their own row (`auth.uid() = id`).
- **`subscriptions`** — `user_id uuid → auth.users`, `creem_customer_id`,
  `creem_subscription_id`, `status` (`active` / `canceled` / `past_due` /
  `expired` / ...), `current_period_end`, `created_at`, `updated_at`.
  RLS: a user can select only their own row (`auth.uid() = user_id`); writes are
  service-role only (Edge Functions). Clients cannot grant themselves a
  subscription.

The current Prisma `users` / `auth_sessions` tables are removed; their role is
taken by `auth.users` + `profiles`.

## Authentication — Google OAuth via Supabase

- Enable the Google provider in Supabase Auth (Client ID/Secret from Google
  Cloud Console; redirect URL points at the Supabase project domain).
- webapp: "Sign in with Google" → `supabase.auth.signInWithOAuth({ provider: 'google' })`.
  The Supabase client stores the session (JWT) and auto-refreshes it.
- TanStack Router route guard reads the session via `supabase.auth.getSession()`
  and `onAuthStateChange`.
- Removed: backend `auth/` (passwords, access/refresh tokens, sessions),
  `JWT_SECRET`, and all email/password UI and logic. Google is the only method.
  (Email/password can be added later via Supabase Auth if needed — out of scope.)

## Payments — creem.io subscriptions

- **`creem-checkout`** (Edge Function, requires a logged-in user): creates or
  finds the creem customer and returns a checkout URL for the chosen product;
  webapp redirects there.
- **`creem-webhook`** (Edge Function, public, verifies the creem signature): on
  `subscription.active / .canceled / .expired / .update` events, upserts the
  `subscriptions` row using the service-role key. Idempotent by
  `creem_subscription_id` + event.
- Premium gating = reading `subscriptions.status = 'active'` (via RLS on the
  client for UI, and re-checked in any Edge Function that gates paid behavior).
- Secrets (`CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`)
  live in Edge Function secrets — never on Vercel and never in the client.

## Frontend surfaces and contracts

- **webapp** stays (CSR, behind login): Google sign-in screen, account page,
  subscription status + Subscribe/Manage button. `lib/api.ts`, `auth-context`,
  `bootstrap-auth`, `use-auth` are rewritten on top of `supabase-js`.
- **website** stays (Astro, SEO): landing + `/pricing`. The CTA links into webapp.
- **`packages/contracts`**: the current auth Zod schemas (`register`/`login`) are
  removed. DB types come from `supabase gen types typescript` (generated file).
  The package is either slimmed to shared form schemas + creem types, or removed
  if too little remains — decided during the plan based on what is left.

## What gets deleted

- `backend/` entirely (Hono, Prisma, auth, storage, cron/worker, env, tests).
- `docs/STORAGE.md`, `docs/YANDEX_CLOUD.md`, the DigitalOcean parts of
  `docs/DEPLOYMENT.md`, `.do/`, `scripts/prepare-do-specs.mjs`,
  `scripts/do-cron.mjs` (+ tests), `docker-compose.yml`, and every `SPACES_*` /
  DigitalOcean / Yandex reference in README/CLAUDE.md/AGENTS.md/docs.
- Updated: README, CLAUDE.md, AGENTS.md, `docs/ARCHITECTURE.md` for the new
  stack. Added: `vercel.json` and a `supabase/` directory (migrations + Edge
  Functions).
- The `mobile` branch is out of scope; only `master` is changed.

## Testing

- E2E (Playwright) for webapp: Google sign-in (Supabase test account / mock) and
  subscription-status rendering — the primary signal.
- Unit/contract: creem webhook parsing (signature, event→status mapping,
  idempotency) as a pure function with Deno tests in the Edge Function.
- Local dev: Supabase CLI (`supabase start`) provides local Postgres + Auth +
  Functions, replacing the Docker Compose + Prisma local path.

## Phased delivery

Each phase gets its own implementation plan and is validated independently.

1. **Phase 1 — Supabase foundation + auth.** Stand up the Supabase project,
   `profiles` table + RLS + trigger, Google OAuth, and rewrite webapp auth on
   `supabase-js`, removing the webapp's email/password UI and its dependency on
   the backend. Local dev via Supabase CLI. Done = a user signs in with Google
   and sees their account in webapp. The old `backend/` is left untouched and
   orphaned in this phase (webapp no longer calls it); it is deleted wholesale
   in Phase 3 so it keeps building in the meantime.
2. **Phase 2 — creem.io subscription.** `subscriptions` table + RLS,
   `creem-checkout` and `creem-webhook` Edge Functions, and webapp
   Subscribe/Manage + status UI. Done = a test checkout flips the user's status
   to `active` via the webhook and the UI reflects it.
3. **Phase 3 — Remove DO/Yandex + Vercel deploy.** Delete remaining backend,
   storage, `.do/`, Yandex/DO docs and scripts, `docker-compose.yml`; add
   `vercel.json`; rewrite README/CLAUDE.md/AGENTS.md/docs for the new stack.
   Done = webapp + website build and deploy on Vercel against the live Supabase
   project.

Note: the backend is removed in one piece in Phase 3, once the webapp no longer
depends on it (Phase 1) and creem logic lives in Edge Functions (Phase 2). This
keeps the backend buildable throughout Phases 1–2 instead of half-deleted.
