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

// Force the SDK to consult its refresh path. getSession() is a no-op when the
// access token is well clear of expiry; when it's close to or past expiry the
// SDK swaps in a fresh token and fires TOKEN_REFRESHED, which authStore is
// already listening for. Returns the (possibly refreshed) access token.
//
// Why this exists: the SDK's own `autoRefreshToken` timer gets throttled when
// the tab is backgrounded, so a long-idle tab can return with a dead token in
// memory. Calling this before every cloud write closes that window.
export async function ensureFreshSession(): Promise<string | null> {
  if (!isCloudEnabled()) return null
  const { data } = await getSupabase().auth.getSession()
  return data.session?.access_token ?? null
}

// One-time install: refresh the session when the user brings the tab back.
// Module-level so it runs once on first import. Guarded so it's inert in
// local-only mode and during SSR.
if (isCloudEnabled() && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Fire and forget — onAuthStateChange in authStore picks up the new
      // session and updates the store. We don't want to await here.
      void getSupabase().auth.getSession()
    }
  })
}
