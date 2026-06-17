# Setup Guide

Step-by-step setup for a fresh install of this template: Supabase (database + Google auth),
creem.io (subscriptions), and Vercel (hosting). Replace every `<placeholder>` with your own value.
Nothing here is committed — keys live in env files (gitignored) and provider dashboards.

## 1. Supabase project (database + auth)

1. Create a project at <https://supabase.com/dashboard>. Note its **Project ref** (the
   `<project-ref>` in `https://<project-ref>.supabase.co`), the **Project URL**, and the
   **anon / publishable key** (Project Settings → API).
2. Apply the SQL in `supabase/migrations/` (in filename order) to your project. Either:
   - Supabase CLI: `supabase link --project-ref <project-ref>` then `supabase db push`, or
   - paste each migration into the dashboard SQL Editor and run it in order.
   This creates `profiles`, `subscriptions`, the RLS policies, and the signup trigger.
3. After applying, run the security advisors (dashboard → Advisors, or the Supabase MCP
   `get_advisors`) and confirm there are no RLS findings.

## 2. Google sign-in

You configure an OAuth client in Google, then hand its credentials to Supabase.

### 2a. Google Cloud Console

1. <https://console.cloud.google.com> → create (or pick) a project.
2. **APIs & Services → OAuth consent screen** (a.k.a. Google Auth Platform → Branding):
   - User type **External**; fill app name, user support email, developer email.
   - **Audience → Test users**: add the Google accounts that may sign in while the app is in
     Testing mode (otherwise Google blocks them).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` (local) and, after deploying,
     your webapp production origin (e.g. `https://<your-webapp>.vercel.app`).
   - **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
     (this is the Supabase callback, not your app — it stays the same for local and prod).
   - Create, then copy the **Client ID** and **Client secret**.

### 2b. Supabase Auth

1. Dashboard → **Authentication → Sign In / Providers → Google**: enable it and paste the
   Client ID and Client secret. Save. (These go in Supabase, never in the app code/env.)
2. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173` for local; your webapp production URL for prod.
   - **Redirect URLs**: add `http://localhost:5173/**` and, after deploying,
     `https://<your-webapp>.vercel.app/**`.

## 3. creem.io subscriptions

1. Create a creem account at <https://creem.io> and switch to **Test mode** for development.
2. **Products → create a subscription product**; copy its **product id** (`prod_...`).
3. **Developers → API Keys**: copy the (test) API key (`creem_test_...`).
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<project-ref>.supabase.co/functions/v1/creem-webhook`
   - Save, then copy the **signing secret**.
5. Deploy the Edge Functions to your project (Supabase CLI `supabase functions deploy creem-checkout`
   and `... creem-webhook`, or the Supabase MCP). Deploy `creem-webhook` with **JWT verification
   disabled** (it authenticates via the creem signature); keep it enabled for `creem-checkout`.
6. Set the Edge Function secrets (dashboard → Project Settings → **Edge Functions → secrets**):
   - `CREEM_API_KEY` — the API key from step 3.
   - `CREEM_PRODUCT_ID` — the product id from step 2.
   - `CREEM_WEBHOOK_SECRET` — the signing secret from step 4.
   - `CREEM_API_BASE` — `https://test-api.creem.io` for test mode (set the live base for prod).
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 4. Run locally

```bash
bun install
cp webapp/.env.example webapp/.env   # then fill in the two values below
```

`webapp/.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

```bash
bun run dev:webapp     # http://localhost:5173
bun run dev:website    # the Astro landing
```

Sign in with a Google account you added as a test user. A `profiles` row is created
automatically; clicking **Subscribe** opens a creem test checkout, and the webhook flips the
subscription to `active`.

## 5. Deploy to Vercel

Deploy `webapp` and `website` as **two separate Vercel projects** from the same repo.

1. **webapp** — New Project → import the repo → **Root Directory `webapp`** → framework Vite.
   Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Deploy and note its **stable
   production domain** (e.g. `https://<your-webapp>.vercel.app`).
2. **website** — New Project → import the same repo → **Root Directory `website`** → framework
   Astro. Env var: `PUBLIC_WEBAPP_URL` = the webapp production domain from step 1. Redeploy.
3. **Disable Deployment Protection** on both projects (Settings → Deployment Protection → turn
   off Vercel Authentication), otherwise visitors hit a Vercel login wall (`401`).
4. Go back and add the **webapp production domain** to:
   - Supabase → Authentication → URL Configuration (Site URL + a `…/**` redirect URL), and
   - Google Cloud → your OAuth client → Authorized JavaScript origins.

Always wire URLs to each project's **stable production domain**, never the hashed per-deploy
preview URLs (those change on every deploy).

## Checklist

- [ ] Supabase project created; migrations applied; advisors clean.
- [ ] Google OAuth client created; redirect URI = Supabase callback; provider enabled in Supabase.
- [ ] Supabase Auth URL Configuration has local + prod URLs.
- [ ] creem product, API key, and webhook created; Edge Functions deployed; secrets set.
- [ ] `webapp/.env` filled; `bun run dev:webapp` signs in with Google.
- [ ] Vercel: two projects, env vars set, Deployment Protection off, prod domains wired into Supabase + Google.
