import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Typography } from '@/components/ui/typography'
import { supabase } from '@/lib/supabase'
import { isActive, useSubscription } from '@/lib/use-subscription'

export function SubscriptionCard({ userId }: { userId: string }) {
  const subscription = useSubscription(userId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startBilling(action: 'checkout' | 'portal') {
    setBusy(true)
    setError(null)
    const { data, error: invokeError } = await supabase.functions.invoke('creem-checkout', {
      body: { action, origin: window.location.origin },
    })

    if (data?.url) {
      window.location.href = data.url as string
      return
    }

    // Surface the function's error body instead of failing silently.
    let message = 'Could not start checkout. Please try again.'
    const context = (invokeError as { context?: Response } | null)?.context
    if (context) {
      try {
        const body = await context.json()
        if (body?.error) message = String(body.error)
      } catch {
        /* keep the default message */
      }
    }
    console.error('creem-checkout failed', invokeError, data)
    setError(message)
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
      <CardContent className="grid gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Checkout failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {active ? (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={busy}
            onClick={() => void startBilling('portal')}
          >
            {busy ? 'Opening…' : 'Manage subscription'}
          </Button>
        ) : (
          <Button
            type="button"
            className="w-fit"
            disabled={busy}
            onClick={() => void startBilling('checkout')}
          >
            {busy ? 'Redirecting…' : 'Subscribe'}
          </Button>
        )}
        <Typography variant="bodySm" tone="muted">
          Status updates automatically after checkout via the creem webhook.
        </Typography>
      </CardContent>
    </Card>
  )
}
