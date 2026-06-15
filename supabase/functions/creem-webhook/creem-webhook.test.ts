import { assert, assertEquals } from 'jsr:@std/assert'
import { resolveStatusRow, verifyWebhookSignature } from '../_shared/creem.ts'

Deno.test('verifyWebhookSignature accepts a correct HMAC-SHA256 hex signature', async () => {
  const secret = 'whsec_test'
  const body = '{"eventType":"subscription.active"}'
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const sig = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  assert(await verifyWebhookSignature(body, sig, secret))
  assert(!(await verifyWebhookSignature(body, 'deadbeef', secret)))
  assert(!(await verifyWebhookSignature(body, null, secret)))
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
  assertEquals(row.customer_email, 'u@example.com')
  assertEquals(row.product_id, 'prod_1')
  assertEquals(row.current_period_end, '2026-12-01T00:00:00.000Z')
})
