import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const e2eDir = fileURLToPath(new URL('.', import.meta.url))
export const sessionFile = resolve(e2eDir, '.artifacts/e2e-session.json')

function readEnvFile(): Record<string, string> {
  const envPath = resolve(e2eDir, '../.env')
  if (!existsSync(envPath)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return out
}

export function resolveSupabaseEnv() {
  const fileEnv = readEnvFile()
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY,
    // Server-side only. Read from process.env or the gitignored webapp/.env.
    // Never prefixed with VITE_, so Vite never ships it to the browser bundle.
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export default async function globalSetup() {
  // Start each run clean so a skipped seed never leaves a stale session behind.
  rmSync(sessionFile, { force: true })

  const { supabaseUrl, anonKey, serviceRoleKey } = resolveSupabaseEnv()

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.warn(
      '[e2e] SUPABASE_SERVICE_ROLE_KEY (or URL/anon) missing — skipping authenticated session seed. ' +
        'The authenticated auth spec will be skipped; the unauthenticated spec still runs.',
    )
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = `e2e-${Date.now()}@example.com`
  const password = 'e2e-password-123'
  const displayName = 'Web E2E User'

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  })
  if (created.error) throw created.error

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signedIn = await anon.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error('E2E sign-in returned no session')
  }

  mkdirSync(dirname(sessionFile), { recursive: true })
  writeFileSync(
    sessionFile,
    JSON.stringify({
      userId: created.data.user!.id,
      email,
      displayName,
      session: signedIn.data.session,
    }),
    'utf8',
  )
}
