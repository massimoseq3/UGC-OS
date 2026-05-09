import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// We expose `cloud` as a getter so the app can launch in pure-local mode if
// the env vars aren't configured (developer using Vite without a Supabase
// project) — every cloud-touching code path checks `isCloudEnabled()` first.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function isCloudEnabled(): boolean {
  return !!(url && anonKey)
}

export function getSupabase(): SupabaseClient {
  if (!isCloudEnabled()) {
    throw new Error(
      'Supabase env not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
    )
  }
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
