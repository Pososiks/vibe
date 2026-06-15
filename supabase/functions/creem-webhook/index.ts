import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  resolveStatusRow,
  type SubscriptionEvent,
  verifyWebhookSignature,
} from '../_shared/creem.ts'

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

  // Resolve the Supabase user via the customer email set at checkout, which
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
