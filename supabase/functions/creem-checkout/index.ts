import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createBillingPortal, createCheckout } from '../_shared/creem.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
