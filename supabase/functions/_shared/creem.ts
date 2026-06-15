// Shared creem.io REST helpers + webhook signature verification (Deno runtime).

function apiBase(): string {
  return Deno.env.get('CREEM_API_BASE') ?? 'https://test-api.creem.io'
}

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

// Pure mapping from a creem subscription event to our subscriptions row shape.
// Lives here (not in the serve entrypoint) so unit tests import it without
// starting the HTTP server.
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

export async function createCheckout(input: {
  productId: string
  userId: string
  email: string
  successUrl: string
}): Promise<{ checkoutUrl: string }> {
  const res = await fetch(`${apiBase()}/v1/checkouts`, {
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
  const res = await fetch(`${apiBase()}/v1/customers/billing`, {
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
