import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { isCloudEnabled } from '../../lib/supabase'
import { startCloudSync, stopCloudSync } from '../../lib/cloudSync'
import AuthScreen from './AuthScreen'

interface AuthGateProps {
  children: React.ReactNode
}

export default function AuthGate({ children }: AuthGateProps) {
  const bootstrapping = useAuthStore((s) => s.bootstrapping)
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const [syncing, setSyncing] = useState(false)
  const [syncReady, setSyncReady] = useState(!isCloudEnabled())

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // Run cloud sync once we have a session + profile. Re-runs if the user
  // signs out and a different account signs in (we stop + restart).
  const userId = session?.user.id
  useEffect(() => {
    if (!isCloudEnabled()) { setSyncReady(true); return }
    if (!userId) { stopCloudSync(); setSyncReady(false); return }
    let cancelled = false
    setSyncing(true)
    setSyncReady(false)
    startCloudSync()
      .catch((e) => console.error('[AuthGate] cloud sync failed', e))
      .finally(() => {
        if (!cancelled) {
          setSyncing(false)
          setSyncReady(true)
        }
      })
    return () => { cancelled = true; stopCloudSync() }
  }, [userId])

  // No Supabase env configured — fall back to local-only mode so devs can
  // run the app without a backend. Print a banner so it's obvious.
  if (!isCloudEnabled()) {
    return (
      <>
        <div className="fixed bottom-3 left-1/2 z-[200] -translate-x-1/2 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300 backdrop-blur">
          <AlertTriangle className="h-3 w-3" />
          Local-only mode — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for cloud sync.
        </div>
        {children}
      </>
    )
  }

  if (bootstrapping) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#050505] text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!session || !profile) {
    return <AuthScreen />
  }

  if (syncing || !syncReady) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#050505] text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[12px]">Syncing your workspace…</span>
      </div>
    )
  }

  return <>{children}</>
}
