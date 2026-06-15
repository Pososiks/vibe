# Architecture

This repository is a Supabase-native template: there is no application server. The browser talks directly to Supabase for auth and data, and only privileged payment logic runs in Supabase Edge Functions. The surfaces are shared contracts, one CSR browser app (`webapp`), one Astro public site (`website`), and the Supabase project (Postgres + Auth + Edge Functions). The runnable mobile app lives on the `mobile` branch and extends this architecture only when mobile is active.

## Surfaces

- `webapp` — React 19 + Vite CSR app behind Google sign-in. Owns the authenticated experience: the account/subscription area. Uses TanStack Router for routing and TanStack Query for server state. Talks to Supabase through `@supabase/supabase-js`.
- `website` — Astro public site (static by default, SSR per route). Owns everything that must be public and search-indexable: landing and marketing content.
- `packages/contracts` — shared Zod schemas used by both frontends.
- `supabase/migrations/` — declarative SQL for the `profiles` and `subscriptions` tables, RLS policies, and the signup trigger.
- `supabase/functions/` — Deno Edge Functions for the payment flow.

The decision rule for putting a page in `webapp` vs `website` is in the root [README.md](../README.md) under "Choosing `webapp` vs `website`".

## Data Flow

There are two paths, and neither goes through a custom backend.

### Reads and writes: Browser → Supabase

```text
Browser → @supabase/supabase-js → Supabase Auth (Google OAuth)
                                 → Postgres (RLS-guarded)
```

The webapp authenticates with Supabase Auth and then reads/writes Postgres directly through the Supabase client. There is no API tier to forward requests. Authorization is enforced entirely by Row Level Security in the database (see [Authorization](#authorization-rls-is-the-boundary)). The Supabase URL and anon key are public, browser-shipped values; safety comes from RLS, not from hiding the key.

### Payments: Browser → Edge Function, and creem → webhook

```text
Browser → creem-checkout (Edge Function, authenticated)  → creem.io checkout session
creem.io → creem-webhook (Edge Function, public)         → subscriptions table (service-role write)
```

- `creem-checkout` runs on the user's Supabase session. It verifies the caller's JWT, then creates a creem.io checkout session for that user and returns the redirect URL. It exists as a function (not a direct browser call) because it needs the creem secret API key, which must never reach the browser.
- `creem-webhook` is a public endpoint that creem.io calls on subscription events. It verifies the `creem-signature` HMAC header against the webhook secret, rejects anything that does not match, and then upserts the `subscriptions` row using the Supabase service-role key (which bypasses RLS). It is public because creem calls it server-to-server; the HMAC signature is the trust boundary, not a Supabase session.

Shared helpers for signature verification and event→row mapping live in `supabase/functions/_shared/creem.ts`.

## Contracts

`packages/contracts` is the source of truth for shared payload and error shapes. It currently exports:

- `profileSchema` — the shape of a user profile row (`id`, `email`, `displayName`, `createdAt`).
- `apiErrorSchema` / `apiErrorCodeSchema` — the canonical error envelope used across surfaces.

New shared shapes should start as Zod schemas in contracts; the webapp imports them rather than hand-copying the shape. When a contract changes, validate every consumer in one pass: the webapp client/UI and any Edge Function that produces or consumes the shape. On the `mobile` branch, include the mobile client in that pass.

## Authorization: RLS Is The Boundary

Because the browser talks to Postgres directly, RLS is the authorization layer — there is no server-side guard in front of the database to fall back on.

- Auth is Google OAuth only, through Supabase Auth. There is no email/password and no custom JWT auth.
- A signup trigger auto-creates the matching `profiles` row when a new auth user is created, so the app never has to insert profiles from the client.
- RLS policies on `profiles` are owner-only: a user can read only their own row. `subscriptions` rows are likewise readable only by their owner.
- Writes to `subscriptions` come only from the webhook using the service-role key, which bypasses RLS. The browser never writes `subscriptions` directly.

Treat any new table the same way: add it as a migration, enable RLS, and write owner-scoped policies before any client reads it. The migration `0002_harden_functions.sql` exists to keep database functions safe (fixed `search_path`); follow that pattern for new functions.

## Real-Time

If a future feature needs live updates (presence, notifications, collaboration), use Supabase Realtime (Postgres changes / broadcast / presence) rather than introducing a separate backend or a broker. There is no application server in this template, so the obsolete pattern of a Redis/Valkey Pub/Sub bus between backend instances does not apply here.

## Deployment Topology

Hosting is Vercel. `webapp` and `website` deploy as two separate Vercel projects from this repository.

- Build-time env for `webapp`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are public, browser-shipped values.
- The Supabase project (Postgres, Auth, Edge Functions) is the single backing service. Migrations under `supabase/migrations/` and functions under `supabase/functions/` are deployed to Supabase, not to Vercel.
- Edge Function secrets (creem API key, webhook secret, service-role key) live in the Supabase function environment and never appear in any frontend build.

Use placeholders for the Supabase project ref, keys, and creem credentials in this template; fill them per install.

## Current Upstream Documentation

For framework and API questions, consult the current upstream documentation linked here first. This document describes repository conventions; upstream docs are authoritative for tool behavior.

- [Supabase docs](https://supabase.com/docs)
- [Supabase Auth (Google OAuth)](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [supabase-js client](https://supabase.com/docs/reference/javascript/introduction)
- [creem.io docs](https://docs.creem.io/)
- [Vercel docs](https://vercel.com/docs)
- [Astro docs](https://docs.astro.build/)
- [Zod docs](https://zod.dev/)
- [TanStack Query React docs](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Router docs](https://tanstack.com/router/latest/docs/overview)
