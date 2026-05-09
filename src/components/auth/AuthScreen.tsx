import { useState } from 'react'
import { FlaskConical, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

type Mode = 'login' | 'signup'

export default function AuthScreen() {
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsConfirm(false)
    if (!email.trim() || !password) return
    setBusy(true)
    try {
      if (mode === 'login') {
        const res = await signIn(email, password)
        if (!res.ok) setError(res.error)
      } else {
        const res = await signUp(email, password)
        if (!res.ok) setError(res.error)
        else if (res.needsConfirm) setNeedsConfirm(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050505] text-white antialiased">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_0%_0%,#1f1f22_0%,#09090b_45%,#000000_100%)] pointer-events-none" />

      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-orange-500 shadow-lg shadow-fuchsia-500/20">
              <FlaskConical className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
            <div className="space-y-1 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">UGC Lab</h1>
              <p className="text-sm text-zinc-500">
                {mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}
              </p>
            </div>
          </div>

          {/* Card */}
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl"
          >
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Password
              </label>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
                placeholder={mode === 'login' ? '••••••••' : 'Min 8 characters'}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {needsConfirm && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                <span>Check your inbox to confirm your email, then sign in.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="text-center text-[12px] text-zinc-500">
            {mode === 'login' ? (
              <>
                New to UGC Lab?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(null); setNeedsConfirm(false) }}
                  className="text-zinc-300 transition-colors hover:text-white"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setNeedsConfirm(false) }}
                  className="text-zinc-300 transition-colors hover:text-white"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <p className="text-center text-[11px] text-zinc-600">
            Access is limited to members of the Skool community.
          </p>
        </div>
      </div>
    </div>
  )
}
