import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isCloudEnabled } from '../lib/supabase'
import { resetBankStore } from './bankStore'
import { resetSettingsStore } from './settingsStore'
import { resetAssetStore } from '../utils/assetStore'

// Wipe every local trace of the current user — banks, settings, IndexedDB
// blobs, and their localStorage snapshots — so the next person to sign in
// on this browser starts from a clean slate. Cloud data is untouched; the
// next sign-in re-hydrates from Supabase + R2.
async function wipeLocalUserData(): Promise<void> {
  resetBankStore()
  resetSettingsStore()
  await resetAssetStore()
}

export interface ProfileRow {
  id: string
  email: string
  display_name: string | null
  is_admin: boolean
  disabled_at: string | null
  kie_api_key: string | null
  per_app_model: Record<string, string>
  active_project_id: string | null
}

interface AuthState {
  // Hydration runs once on app start: read existing session, fetch profile.
  // While `bootstrapping` is true, AuthGate shows a spinner instead of the
  // login screen — avoids a flash of "logged out" for already-signed-in users.
  bootstrapping: boolean

  session: Session | null
  user: User | null
  profile: ProfileRow | null

  bootstrap: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  signUp: (email: string, password: string) => Promise<{ ok: true; needsConfirm: boolean } | { ok: false; error: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, display_name, is_admin, disabled_at, kie_api_key, per_app_model, active_project_id')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[auth] fetchProfile failed', error)
    return null
  }
  return data as ProfileRow | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  bootstrapping: isCloudEnabled(),
  session: null,
  user: null,
  profile: null,

  bootstrap: async () => {
    if (!isCloudEnabled()) {
      set({ bootstrapping: false })
      return
    }
    const sb = getSupabase()
    const { data } = await sb.auth.getSession()
    const session = data.session ?? null
    const user = session?.user ?? null
    let profile: ProfileRow | null = null
    if (user) {
      profile = await fetchProfile(user.id)
      // If admin removed the user from allowlist, sign them out immediately.
      if (profile?.disabled_at) {
        await sb.auth.signOut()
        await wipeLocalUserData()
        set({ session: null, user: null, profile: null, bootstrapping: false })
        return
      }
    }
    set({ session, user, profile, bootstrapping: false })

    // Keep state in sync with auth changes (other-tab sign-in, refresh, etc.)
    sb.auth.onAuthStateChange(async (_event, nextSession) => {
      const prevUserId = get().user?.id
      const nextUser = nextSession?.user ?? null
      let nextProfile: ProfileRow | null = null
      if (nextUser) {
        nextProfile = await fetchProfile(nextUser.id)
        if (nextProfile?.disabled_at) {
          await sb.auth.signOut()
          await wipeLocalUserData()
          set({ session: null, user: null, profile: null })
          return
        }
      }
      // If the user changed (sign-out or account swap in another tab), wipe
      // every trace of the previous user before letting cloudSync hydrate
      // the next account.
      if (prevUserId && prevUserId !== nextUser?.id) {
        await wipeLocalUserData()
      }
      set({ session: nextSession, user: nextUser, profile: nextProfile })
    })
  },

  signIn: async (email, password) => {
    if (!isCloudEnabled()) return { ok: false, error: 'Cloud not configured.' }
    const sb = getSupabase()
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, error: error.message }
    if (data.user) {
      const profile = await fetchProfile(data.user.id)
      if (profile?.disabled_at) {
        await sb.auth.signOut()
        return { ok: false, error: 'Your access has been revoked. Contact your community admin.' }
      }
      set({ session: data.session, user: data.user, profile })
    }
    return { ok: true }
  },

  signUp: async (email, password) => {
    if (!isCloudEnabled()) return { ok: false, error: 'Cloud not configured.' }
    const sb = getSupabase()
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
    if (error) {
      // Surface our allowlist-trigger message verbatim — that's the friendly
      // "not on access list" copy.
      return { ok: false, error: prettifyAuthError(error.message) }
    }
    // If email confirmation is enabled in Supabase, session is null and the
    // user has to click a link before they can log in.
    const needsConfirm = !data.session
    if (data.session && data.user) {
      const profile = await fetchProfile(data.user.id)
      set({ session: data.session, user: data.user, profile })
    }
    return { ok: true, needsConfirm }
  },

  signOut: async () => {
    if (!isCloudEnabled()) return
    const sb = getSupabase()
    await sb.auth.signOut()
    await wipeLocalUserData()
    set({ session: null, user: null, profile: null })
  },

  refreshProfile: async () => {
    const user = get().user
    if (!user) return
    const profile = await fetchProfile(user.id)
    set({ profile })
  },
}))

function prettifyAuthError(message: string): string {
  // Postgres trigger errors come back with the `P0001` prefix stripped; we
  // recognise our specific phrase and clean it up. Everything else passes
  // through so kie/Supabase errors stay debuggable.
  if (/not on the access list/i.test(message)) {
    return "This email isn't on the access list. Join the Skool community first, then try again."
  }
  return message
}
