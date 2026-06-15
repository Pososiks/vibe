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
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void startBilling('portal')}
          >
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
