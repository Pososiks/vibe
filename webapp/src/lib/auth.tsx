import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Profile } from '@web-app-demo/contracts'
import type { Session } from '@supabase/supabase-js'
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './auth-context'

const profileQueryKey = ['auth', 'profile'] as const

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    createdAt: data.created_at,
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setIsBootstrapping(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        queryClient.removeQueries({ queryKey: profileQueryKey })
      }
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    enabled: Boolean(session?.user.id),
    queryFn: () => fetchProfile(session!.user.id),
  })

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined)
    queryClient.removeQueries({ queryKey: profileQueryKey })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: profileQuery.data ?? null,
      isBootstrapping,
      isAuthenticated: Boolean(profileQuery.data),
      signInWithGoogle,
      signOut,
    }),
    [isBootstrapping, profileQuery.data, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
