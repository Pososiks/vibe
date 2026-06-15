import { existsSync, readFileSync } from 'node:fs'
import { test as base, expect, type Page } from '@playwright/test'
import { sessionFile } from '../global-setup'

// Must match `authStorageKey` in src/lib/supabase.ts. Duplicated here so this Node
// helper does not import the Vite-only client module (which reads import.meta.env).
const authStorageKey = 'webapp-auth'

type SeededSession = {
  userId: string
  email: string
  displayName: string
  session: Record<string, unknown>
}

export function readSeededSession(): SeededSession | null {
  if (!existsSync(sessionFile)) return null
  return JSON.parse(readFileSync(sessionFile, 'utf8')) as SeededSession
}

// Inject the Supabase session into localStorage before any app code runs,
// so supabase-js restores it on load (no real Google redirect in E2E).
export async function injectSession(page: Page, seeded: SeededSession) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [authStorageKey, JSON.stringify(seeded.session)] as const,
  )
}

export const test = base
export { expect }
