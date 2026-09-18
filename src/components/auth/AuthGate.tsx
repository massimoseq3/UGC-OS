import { useEffect, useState } from 'react'
import Spinner from '../Spinner'
import { useAuthStore } from '../../stores/authStore'
import { isCloudEnabled } from '../../lib/supabase'
import { startCloudSync, stopCloudSync } from '../../lib/cloudSync'
import AuthScreen from './AuthScreen'
import ResetPasswordScreen from './ResetPasswordScreen'
import LapsedScreen from './LapsedScreen'

interface AuthGateProps {
  children: React.ReactNode
}

export default function AuthGate({ children }: AuthGateProps) {
  const bootstrapping = useAuthStore((s) => s.bootstrapping)
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const recovery = useAuthStore((s) => s.recovery)
  // A locked-out member holds a valid session but no data access — RLS locks
  // every bank table until they redeem the access code. Two ways to get here:
  // cancelled by hand (0023) or past the 30-day renewal checkpoint (0025).
  // The verdict is the server's: being past a checkpoint stamps no flag, so
  // profile.lapsed_at answers only half the question.
  const access = useAuthStore((s) => s.access)
  const refreshAccessState = useAuthStore((s) => s.refreshAccessState)
  const lapsed = access.locked
  const [syncing, setSyncing] = useState(false)
  const [syncReady, setSyncReady] = useState(!isCloudEnabled())

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // Run cloud sync once we have a session + profile. Re-runs if the user
  // signs out and a different account signs in (we stop + restart). This
  // effect orchestrates an external subscription (start/stopCloudSync) with
  // cleanup, so the synchronous loading-flag setState calls are the standard
  // async-effect pattern, not a cascading-render smell.
  //
  // Neither a lapsed member nor a half-finished password reset may start a
  // sync: the first would hydrate against tables RLS refuses, reporting a
  // per-table error for every bank, and the second hasn't decided who is
  // signed in yet.
  const userId = session?.user.id
  const syncBlocked = lapsed || recovery
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isCloudEnabled()) { setSyncReady(true); return }
    if (!userId || syncBlocked) { stopCloudSync(); setSyncReady(false); return }
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
  }, [userId, syncBlocked])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Hand over to the code screen ON the checkpoint rather than discovering it
  // through failures: at the deadline every bank write starts being refused by
  // RLS, which would otherwise reach the member as a toast per table and a
  // workspace that silently stopped saving. Re-checks hourly until the
  // deadline is close, because a 30-day setTimeout is both unreliable and
  // dead wrong for a laptop that slept through the moment.
  const renewsAt = access.renewsAt
  const [renewalTick, setRenewalTick] = useState(0)
  useEffect(() => {
    if (lapsed || !renewsAt) return
    const due = new Date(renewsAt).getTime() - Date.now()
    if (Number.isNaN(due)) return
    const HOUR = 60 * 60_000
    // Far out, the wake-up only re-arms — asking the server hourly for thirty
    // days would be a round trip per member per hour to learn nothing. Past
    // the deadline while the server still says fine (clock skew) this settles
    // into a harmless once-a-minute re-ask that stops the moment the server
    // agrees, since a locked member returns above.
    const dueSoon = due <= HOUR
    const delay = dueSoon ? Math.max(due + 1_000, 60_000) : HOUR
    const timer = setTimeout(() => {
      if (dueSoon) void refreshAccessState()
      setRenewalTick((n) => n + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [renewsAt, lapsed, refreshAccessState, renewalTick])

  // No Supabase env configured — fall back to local-only mode so the app runs
  // fully client-side without a backend.
  if (!isCloudEnabled()) {
    return <>{children}</>
  }

  if (bootstrapping) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-surface-0 text-ink-500">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  // Before the session check: a recovery link carries a real session, so
  // without this the member lands in the workspace with the password they
  // came here to change still set.
  if (recovery) {
    return <ResetPasswordScreen />
  }

  if (!session || !profile) {
    return <AuthScreen />
  }

  if (lapsed) {
    return <LapsedScreen reason={access.reason} />
  }

  if (syncing || !syncReady) {
    return (
      <div className="flex h-dvh w-screen flex-col items-center justify-center gap-3 bg-surface-0 text-ink-400">
        <Spinner className="h-5 w-5" />
        <span className="text-[12px]">Syncing your workspace…</span>
      </div>
    )
  }

  return <>{children}</>
}
