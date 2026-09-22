import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import AuthShell, { AuthField, AuthForm, AuthNotice, AuthSubmit } from './AuthShell'
import { useAuthStore } from '../../stores/authStore'

const MIN_PASSWORD = 8

// Shown when this page load arrived on a Supabase recovery link. The link
// carries a real session, so the screen exists to make sure the member sets a
// password before the app lets them anywhere near the workspace.
export default function ResetPasswordScreen() {
  const session = useAuthStore((s) => s.session)
  const completePasswordReset = useAuthStore((s) => s.completePasswordReset)
  const exitRecovery = useAuthStore((s) => s.exitRecovery)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // No session on a recovery URL means the token was expired, already spent, or
  // opened in a browser that mangled it. Nothing to do here but start again.
  if (!session) {
    return (
      <AuthShell subtitle="Reset your password">
        <AuthForm
          onSubmit={(e) => {
            e.preventDefault()
            exitRecovery()
          }}
        >
          <AuthNotice tone="warn">This reset link has expired or has already been used. Request a new one.</AuthNotice>
          <AuthSubmit busy={false} disabled={false}>
            Back to Sign In
          </AuthSubmit>
        </AuthForm>
      </AuthShell>
    )
  }

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length >= MIN_PASSWORD && password === confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!ready) return
    setBusy(true)
    try {
      const res = await completePasswordReset(password)
      // On success the store drops out of recovery mode and AuthGate takes over
      // — there is nothing to render here afterwards.
      if (!res.ok) setError(res.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell subtitle="Choose a new password">
      <AuthForm onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 text-[12px] text-ink-400">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-500" />
          <span className="truncate">{session.user.email}</span>
        </div>

        <AuthField
          label="New Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD}
          placeholder={`Min ${MIN_PASSWORD} characters`}
        />

        <AuthField
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Type it again"
        />

        {(error || tooShort || mismatch) && (
          <AuthNotice tone="error">
            {error ?? (tooShort ? `Use at least ${MIN_PASSWORD} characters.` : 'Those two passwords don’t match.')}
          </AuthNotice>
        )}

        <AuthSubmit busy={busy} disabled={!ready}>
          Set New Password
        </AuthSubmit>

        <button
          type="button"
          onClick={exitRecovery}
          className="w-full rounded-full py-2 text-[12px] text-ink-500 transition-colors hover:text-ink-300"
        >
          Cancel
        </button>
      </AuthForm>
    </AuthShell>
  )
}
