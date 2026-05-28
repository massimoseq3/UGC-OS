import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// We expose `cloud` as a getter so the app can launch in pure-local mode if
// the env vars aren't configured (developer using Vite without a Supabase
// project) — every cloud-touching code path checks `isCloudEnabled()` first.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

// Most-recently-seen access token, kept current by an onAuthStateChange
// listener installed when the client is created. Used as the fallback when
// getSession() stalls (see ensureFreshSession). Lives here — not in authStore —
// so this low-level module has no import cycle with the store.
let cachedAccessToken: string | null = null

export function isCloudEnabled(): boolean {
  return !!(url && anonKey)
}

// supabase-js takes the access token via navigator.locks before every request
// (to attach the Authorization header). The default lock can stall indefinitely
// after a backgrounded tab returns — which hung our upserts until their 15s
// timeout fired. This replacement bounds lock acquisition: if we can't get the
// lock within ~2s, we run the operation WITHOUT it rather than block. A rare
// cross-tab token race is acceptable for a single-user app; an indefinite stall
// is not. Matches the signature supabase-js expects: (name, acquireTimeout, fn).
const LOCK_ACQUIRE_TIMEOUT_MS = 2_000
async function nonBlockingLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) {
    return fn()
  }
  try {
    return await locks.request(name, { signal: AbortSignal.timeout(LOCK_ACQUIRE_TIMEOUT_MS) }, () => fn())
  } catch {
    // Acquisition timed out / aborted (another tab holds the lock, or the SDK's
    // own lock stalled). Proceed unlocked instead of hanging the request.
    return fn()
  }
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
        lock: nonBlockingLock,
      },
    })
    // Keep the cached token current. Fires on SIGNED_IN / TOKEN_REFRESHED /
    // SIGNED_OUT — exactly the events that change the access token. authStore
    // installs its own listener for app state; this one is independent and only
    // touches the module-local fallback.
    client.auth.onAuthStateChange((_event, session) => {
      cachedAccessToken = session?.access_token ?? null
    })
  }
  return client
}

// 3s is plenty for a healthy getSession() (it's normally synchronous against
// the in-memory session). Past that we assume the SDK's auth lock has stalled
// and fall back rather than block the caller.
const SESSION_TIMEOUT_MS = 3_000
const TIMED_OUT = Symbol('session-timeout')

// Returns the current access token, refreshing if the SDK deems it necessary.
//
// Why the timeout fallback exists: the SDK's `autoRefreshToken` timer gets
// throttled when the tab is backgrounded, and supabase-js's auth lock can
// stall after a long-idle tab returns — leaving getSession() hung. Every cloud
// write awaits this helper, so a hung getSession() used to pin writes until
// their 15–60s timeouts fired (surfacing as "save failed / generation failed"
// until a page refresh cleared the lock). Racing it against a short timeout and
// falling back to the last-seen token keeps writes moving: they either succeed,
// or fail fast on a stale token (recoverable) instead of hanging.
export async function ensureFreshSession(): Promise<string | null> {
  if (!isCloudEnabled()) return null
  try {
    const token = await Promise.race([
      getSupabase().auth.getSession().then((r) => r.data.session?.access_token ?? null),
      new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), SESSION_TIMEOUT_MS)),
    ])
    if (token !== TIMED_OUT) {
      cachedAccessToken = token
      return token
    }
    console.warn('[supabase] getSession() stalled — using cached access token')
    return cachedAccessToken
  } catch (e) {
    console.warn('[supabase] getSession() failed — using cached access token', e)
    return cachedAccessToken
  }
}

// One-time install: proactively recover the session when the user brings the
// tab back. ensureFreshSession() is timeout-guarded, so this can't hang.
// Module-level so it runs once on first import. Guarded so it's inert in
// local-only mode and during SSR.
if (isCloudEnabled() && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void ensureFreshSession().catch((e) => console.warn('[supabase] visibility refresh failed', e))
    }
  })
}
