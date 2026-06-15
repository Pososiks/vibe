import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseEnv, sessionFile } from './global-setup'

export default async function globalTeardown() {
  if (!existsSync(sessionFile)) return
  const { userId } = JSON.parse(readFileSync(sessionFile, 'utf8')) as { userId: string }

  const { supabaseUrl, serviceRoleKey } = resolveSupabaseEnv()
  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await admin.auth.admin.deleteUser(userId).catch(() => undefined)
  }
  rmSync(sessionFile, { force: true })
}
