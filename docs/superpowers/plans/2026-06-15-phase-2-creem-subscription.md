# Phase 2: creem.io Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user subscribe through creem.io and have their subscription status reflected in the webapp, kept in sync by a signature-verified webhook.

**Architecture:** No application server. Two Supabase Edge Functions (Deno) hold all server-side creem logic: `creem-checkout` (authenticated — creates a checkout or billing-portal link for the current user) and `creem-webhook` (public, signature-verified — writes subscription state with the service-role key). A `subscriptions` table under RLS lets the webapp read only its owner's row. The webapp shows status and a Subscribe / Manage button.

**Tech Stack:** Supabase Edge Functions (Deno, Web Crypto HMAC), Supabase Postgres + RLS, `@supabase/supabase-js`, creem.io REST API (`x-api-key`), React + TanStack Query.

---

## Repo policy on commits

Same as Phase 1: commit only on the user's explicit OK (`CLAUDE.md`). Steps end with a commit step; get the go-ahead before running it. Work continues on branch `replatform/supabase-vercel-creem`.

## Manual prerequisites (user actions — cannot be automated via MCP)

Track these; the code can be built/deployed before they exist, but the end-to-end test needs them:

1. Create a creem.io account; switch to **Test mode**.
2. Create a **subscription product** → note its **product_id**.
3. Copy the **API key** (test) — used as `x-api-key`.
4. Developers → Webhooks → add an endpoint pointing at the deployed function URL
   `https://vywdqqxlqealqaorfrtp.supabase.co/functions/v1/creem-webhook` → copy the **webhook secret**.
5. In Supabase Dashboard → Edge Functions → **Manage secrets**, set:
   - `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_PRODUCT_ID`, `CREEM_API_BASE` (`https://test-api.creem.io`).
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions.)

## File structure

- Create: `supabase/migrations/0003_subscriptions.sql` — `subscriptions` table + RLS.
- Create: `supabase/functions/_shared/creem.ts` — creem REST helpers + HMAC verify (Deno).
- Create: `supabase/functions/creem-checkout/index.ts` — authenticated checkout / portal.
- Create: `supabase/functions/creem-webhook/index.ts` — public, signature-verified sync.
- Create: `supabase/functions/creem-webhook/creem-webhook.test.ts` — pure mapping/verify unit tests.
- Modify: `webapp/src/lib/` — add `use-subscription.ts` hook.
- Modify: `webapp/src/pages.tsx` — subscription status + Subscribe / Manage UI.
- Modify: `webapp/src/components/` — add `SubscriptionCard.tsx`.

---

### Task 1: `subscriptions` table + RLS

**Files:**
- Create: `supabase/migrations/0003_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  creem_customer_id      text,
  creem_subscription_id  text not null unique,
  status                 text not null,
  product_id             text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

-- Owner can read their own subscription rows. No write policy: only the
-- service-role webhook (which bypasses RLS) ever writes here.
create policy "Subscriptions are viewable by their owner"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_profiles_updated_at();
```
Reuses `set_profiles_updated_at()` from migration 0001 (generic; despite the name it only touches `new.updated_at`).

- [ ] **Step 2: Apply via MCP**

Apply with the Supabase MCP `apply_migration` (name `subscriptions`, project `vywdqqxlqealqaorfrtp`) using the SQL above; also save the file in `supabase/migrations/`.
Expected: `{"success": true}`.

- [ ] **Step 3: Check advisors**

Run MCP `get_advisors` (type `security`). Expected: no new lints for `public.subscriptions` (RLS enabled, no over-broad policy).

- [ ] **Step 4: Commit** (after user OK)

```bash
git add supabase/migrations/0003_subscriptions.sql
git commit -m "feat(db): add subscriptions table with owner-read RLS"
```

---

### Task 2: Shared creem helpers (Deno)

**Files:**
- Create: `supabase/functions/_shared/creem.ts`

- [ ] **Step 1: Write the helper module**

```ts
// Shared creem.io REST helpers + webhook signature verification (Deno runtime).

const CREEM_API_BASE = Deno.env.get('CREEM_API_BASE') ?? 'https://test-api.creem.io'

function apiKey(): string {
  const key = Deno.env.get('CREEM_API_KEY')
  if (!key) throw new Error('CREEM_API_KEY is not set')
  return key
}

export type SubscriptionEvent = {
  eventType: string
  object: {
    id: string
    status: string
    current_period_end_date?: string
    customer?: { id?: string; email?: string }
    product?: { id?: string }
  }
}

export async function createCheckout(input: {
  productId: string
  userId: string
  email: string
  successUrl: string
}): Promise<{ checkoutUrl: string }> {
  const res = await fetch(`${CREEM_API_BASE}/v1/checkouts`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: input.productId,
      success_url: input.successUrl,
      customer: { email: input.email },
      metadata: { user_id: input.userId },
    }),
  })
  if (!res.ok) throw new Error(`creem checkout failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { checkoutUrl: data.checkout_url }
}

export async function createBillingPortal(customerId: string): Promise<{ url: string }> {
  const res = await fetch(`${CREEM_API_BASE}/v1/customers/billing`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId }),
  })
  if (!res.ok) throw new Error(`creem portal failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { url: data.customer_portal_link ?? data.url ?? data.link }
}

// HMAC-SHA256(rawBody, secret) as lowercase hex, compared to the creem-signature header.
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signatureHeader.trim())
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Map a creem subscription status to the value we store.
export function normalizeStatus(status: string): string {
  return status
}
```

- [ ] **Step 2: Commit** (after user OK)

```bash
git add supabase/functions/_shared/creem.ts
git commit -m "feat(edge): shared creem REST + webhook signature helpers"
```

---

### Task 3: `creem-checkout` Edge Function (authenticated)

Handles two actions for the signed-in user: `checkout` (start a subscription) and `portal` (manage an existing one).

**Files:**
- Create: `supabase/functions/creem-checkout/index.ts`

- [ ] **Step 1: Write the function**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createBillingPortal, createCheckout } from '../_shared/creem.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)
    const user = userData.user

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'checkout'
    const origin = req.headers.get('Origin') ?? body.origin ?? ''

    if (action === 'portal') {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: sub } = await admin
        .from('subscriptions')
        .select('creem_customer_id')
        .eq('user_id', user.id)
        .not('creem_customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!sub?.creem_customer_id) return json({ error: 'No customer to manage' }, 400)
      const { url } = await createBillingPortal(sub.creem_customer_id)
      return json({ url })
    }

    const { checkoutUrl } = await createCheckout({
      productId: Deno.env.get('CREEM_PRODUCT_ID')!,
      userId: user.id,
      email: user.email ?? '',
      successUrl: origin || 'http://localhost:5173',
    })
    return json({ url: checkoutUrl })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy via MCP**

Deploy with the Supabase MCP `deploy_edge_function` (project `vywdqqxlqealqaorfrtp`, name `creem-checkout`). Keep default JWT verification ON (it is authenticated).
Expected: deploy succeeds; function visible via `list_edge_functions`.

- [ ] **Step 3: Commit** (after user OK)

```bash
git add supabase/functions/creem-checkout/index.ts
git commit -m "feat(edge): authenticated creem checkout/portal function"
```

---

### Task 4: `creem-webhook` Edge Function (public, signature-verified)

**Files:**
- Create: `supabase/functions/creem-webhook/index.ts`
- Create: `supabase/functions/creem-webhook/creem-webhook.test.ts`

- [ ] **Step 1: Write the pure mapping/verify test first (TDD)**

```ts
import { assert, assertEquals } from 'jsr:@std/assert'
import { verifyWebhookSignature } from '../_shared/creem.ts'
import { resolveStatusRow } from './index.ts'

Deno.test('verifyWebhookSignature accepts a correct HMAC-SHA256 hex signature', async () => {
  const secret = 'whsec_test'
  const body = '{"eventType":"subscription.active"}'
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const sig = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  assert(await verifyWebhookSignature(body, sig, secret))
  assert(!(await verifyWebhookSignature(body, 'deadbeef', secret)))
})

Deno.test('resolveStatusRow maps a subscription event to a db row', () => {
  const row = resolveStatusRow({
    eventType: 'subscription.active',
    object: {
      id: 'sub_123',
      status: 'active',
      current_period_end_date: '2026-12-01T00:00:00.000Z',
      customer: { id: 'cust_1', email: 'u@example.com' },
      product: { id: 'prod_1' },
    },
  })
  assertEquals(row.creem_subscription_id, 'sub_123')
  assertEquals(row.status, 'active')
  assertEquals(row.creem_customer_id, 'cust_1')
  assertEquals(row.product_id, 'prod_1')
  assertEquals(row.current_period_end, '2026-12-01T00:00:00.000Z')
})
```

- [ ] **Step 2: Write the function (exports `resolveStatusRow` for the test)**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { type SubscriptionEvent, verifyWebhookSignature } from '../_shared/creem.ts'

export function resolveStatusRow(event: SubscriptionEvent) {
  const o = event.object
  return {
    creem_subscription_id: o.id,
    creem_customer_id: o.customer?.id ?? null,
    customer_email: o.customer?.email ?? null,
    status: o.status,
    product_id: o.product?.id ?? null,
    current_period_end: o.current_period_end_date ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()
  const secret = Deno.env.get('CREEM_WEBHOOK_SECRET')!
  const valid = await verifyWebhookSignature(rawBody, req.headers.get('creem-signature'), secret)
  if (!valid) return new Response('Invalid signature', { status: 401 })

  const event = JSON.parse(rawBody) as SubscriptionEvent
  if (!event.eventType?.startsWith('subscription.')) {
    return new Response('ignored', { status: 200 })
  }

  const row = resolveStatusRow(event)
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve the Supabase user: prefer the customer email (set at checkout), which
  // matches the user's profile email.
  let userId: string | null = null
  if (row.customer_email) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', row.customer_email)
      .maybeSingle()
    userId = profile?.id ?? null
  }
  if (!userId) return new Response('no matching user', { status: 200 })

  // Idempotent upsert keyed by creem_subscription_id.
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      creem_subscription_id: row.creem_subscription_id,
      creem_customer_id: row.creem_customer_id,
      status: row.status,
      product_id: row.product_id,
      current_period_end: row.current_period_end,
    },
    { onConflict: 'creem_subscription_id' },
  )
  if (error) return new Response(`db error: ${error.message}`, { status: 500 })

  return new Response('ok', { status: 200 })
})
```

- [ ] **Step 3: Run the Deno unit tests**

Run: `PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" deno test supabase/functions/creem-webhook` (Deno required; install if absent via `brew install deno`).
Expected: both tests pass. If Deno is unavailable locally, note partial validation and rely on the live test in Task 7.

- [ ] **Step 4: Deploy via MCP with JWT verification OFF**

Deploy with MCP `deploy_edge_function` (name `creem-webhook`). The webhook is called by creem, not a logged-in user, so JWT verification MUST be disabled. If the MCP deploy cannot set `verify_jwt=false`, set it afterward in Dashboard → Edge Functions → `creem-webhook` → Details, or add to `supabase/config.toml`:
```toml
[functions.creem-webhook]
verify_jwt = false
```
Expected: function deployed and publicly reachable.

- [ ] **Step 5: Commit** (after user OK)

```bash
git add supabase/functions/creem-webhook
git commit -m "feat(edge): signature-verified creem subscription webhook"
```

---

### Task 5: webapp subscription hook + UI

**Files:**
- Create: `webapp/src/lib/use-subscription.ts`
- Create: `webapp/src/components/SubscriptionCard.tsx`
- Modify: `webapp/src/pages.tsx` (render `SubscriptionCard` in the signed-in view)

- [ ] **Step 1: Subscription query hook**

`webapp/src/lib/use-subscription.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type Subscription = {
  status: string
  currentPeriodEnd: string | null
}

export function useSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: ['subscription', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return { status: data.status, currentPeriodEnd: data.current_period_end }
    },
  })
}

export function isActive(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing'
}
```

- [ ] **Step 2: Subscription card**

`webapp/src/components/SubscriptionCard.tsx`:
```tsx
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Typography } from '@/components/ui/typography'
import { supabase } from '@/lib/supabase'
import { isActive, useSubscription } from '@/lib/use-subscription'

export function SubscriptionCard({ userId }: { userId: string }) {
  const subscription = useSubscription(userId)
  const [busy, setBusy] = useState(false)

  async function startBilling(action: 'checkout' | 'portal') {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('creem-checkout', {
      body: { action, origin: window.location.origin },
    })
    if (!error && data?.url) {
      window.location.href = data.url as string
      return
    }
    setBusy(false)
  }

  const active = isActive(subscription.data?.status)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Subscription
          <Badge variant={active ? 'default' : 'outline'}>
            {subscription.data?.status ?? 'none'}
          </Badge>
        </CardTitle>
        {active && subscription.data?.currentPeriodEnd && (
          <CardDescription>
            Renews {new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {active ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void startBilling('portal')}>
            {busy ? 'Opening…' : 'Manage subscription'}
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void startBilling('checkout')}>
            {busy ? 'Redirecting…' : 'Subscribe'}
          </Button>
        )}
        <Typography variant="bodySm" tone="muted" className="mt-3">
          Status updates automatically after checkout via the creem webhook.
        </Typography>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Render it in the signed-in view of `pages.tsx`**

In `webapp/src/pages.tsx`, add the import:
```tsx
import { SubscriptionCard } from '@/components/SubscriptionCard'
```
Then inside `HomePage`'s signed-in `return`, add `SubscriptionCard` as the first item in the cards grid:
```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <SubscriptionCard userId={auth.user.id} />
        <Card size="sm">
          <CardHeader>
            <CardTitle>User ID</CardTitle>
            <CardDescription wrap="break">{auth.user.id}</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Created</CardTitle>
            <CardDescription>{new Date(auth.user.createdAt).toLocaleString()}</CardDescription>
          </CardHeader>
        </Card>
      </div>
```

- [ ] **Step 4: Typecheck + unit tests**

Run:
```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" bun run --cwd webapp typecheck
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" bun run --cwd webapp test
```
Expected: both pass.

- [ ] **Step 5: Commit** (after user OK)

```bash
git add webapp/src/lib/use-subscription.ts webapp/src/components/SubscriptionCard.tsx webapp/src/pages.tsx
git commit -m "feat(webapp): subscription status with Subscribe/Manage actions"
```

---

### Task 6: Generate DB types (optional but recommended)

- [ ] **Step 1:** Run MCP `generate_typescript_types` for the project and save the output to `webapp/src/lib/database.types.ts`; optionally type the supabase client with it for stronger query typing. Skip if it introduces churn beyond Phase 2 scope.

---

### Task 7: Live end-to-end test (creem test mode)

Requires the manual prerequisites. Primary signal for Phase 2.

- [ ] **Step 1:** Ensure secrets are set (prerequisites 5) and the webhook endpoint is registered (prerequisite 4).
- [ ] **Step 2:** `bun run dev:webapp`, sign in with Google, open the account view → the Subscription card shows `none` with a **Subscribe** button.
- [ ] **Step 3:** Click **Subscribe** → redirected to the creem **test** checkout → complete payment with a creem test card.
- [ ] **Step 4:** Within a few seconds, verify via MCP `execute_sql`:
  ```sql
  select user_id, status, current_period_end, creem_subscription_id from public.subscriptions;
  ```
  Expected: one row, `status = 'active'`, linked to the signed-in user.
- [ ] **Step 5:** Reload the webapp → card shows `active` + renew date + **Manage subscription**. Click it → redirected to the creem billing portal.
- [ ] **Step 6 (cancel path):** Cancel in the portal → creem sends `subscription.canceled`/`scheduled_cancel` → re-query the table and confirm the status updates.
- [ ] **Step 7:** Check MCP `get_logs` (service `edge-function`) if any step fails.

---

## Phase 2 done criteria

- **Primary signal:** a test checkout flips the user's `subscriptions.status` to `active` via the webhook, and the webapp reflects it; Manage opens the billing portal (Task 7).
- **Secondary signals:** `subscriptions` RLS clean in advisors (Task 1); Deno unit tests for signature + mapping (Task 4); webapp typecheck + tests (Task 5).
- **Security:** webhook rejects bad signatures; subscription writes are service-role only; creem secrets live only in Edge Function secrets, never in the client or repo.

## Self-review notes

- Spec coverage: subscriptions table + RLS (T1), `creem-checkout` (T3), `creem-webhook` (T4), Subscribe/Manage + status UI (T5), secrets isolation (prereqs). Matches the Phase 2 section of the design spec.
- Consistent names across tasks: `creem_subscription_id` (unique upsert key), `resolveStatusRow`, `verifyWebhookSignature`, `useSubscription`/`isActive`.
- Open item to verify during implementation: whether creem propagates `metadata.user_id` onto subscription webhook objects. The plan maps by `customer.email` (always set at checkout) to avoid depending on it; revisit if email mapping proves insufficient.
