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
