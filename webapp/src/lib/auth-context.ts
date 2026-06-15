import { createContext } from 'react'
import type { Profile } from '@web-app-demo/contracts'

export type AuthContextValue = {
  user: Profile | null
  isBootstrapping: boolean
  isAuthenticated: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
