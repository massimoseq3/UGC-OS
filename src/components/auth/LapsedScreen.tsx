import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import AuthShell, { AuthField, AuthForm, AuthNotice, AuthSubmit } from './AuthShell'
import { useAuthStore } from '../../stores/authStore'
import { SKOOL_ACCESS_CODE_URL } from '../../utils/constants'

// Shown to a member the server has locked out of the workspace — cancelled by
// hand (migration 0023), or past their renewal checkpoint (migration 0025).
// Their workspace is untouched behind RLS; the current shared access code is
// what opens it again, which is why the code is worth rotating.
//
// The two read differently on purpose. A cancelled member is coming back from
// somewhere; a renewing one never left, and telling them "welcome back" for a
// routine check-in reads as though something went wrong with their account.
export default function LapsedScreen({ reason }: { reason?: 'disabled' | 'lapsed' | 'renewal' | null }) {
  const renewing = reason === 'renewal'
  const email = useAuthStore((s) => s.profile?.email ?? s.user?.email ?? '')
  const redeemAccessCode = useAuthStore((s) => s.redeemAccessCode)
  const signOut = useAuthStore((s) => s.signOut)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!code.trim()) return
    setBusy(true)
    try {
      const res = await redeemAccessCode(code)
      // On success the profile reloads without lapsed_at and AuthGate hands
      // over to the workspace — nothing left to render here.
      if (!res.ok) setError(res.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell subtitle={renewing ? 'Quick Check-In' : 'Welcome Back'}>
      <AuthForm onSubmit={handleSubmit}>
        {/* No explanatory paragraph above the field, and on the renewal pass
            no hint either. The heading, the Access Code label and the Unlock My
            Workspace button already say the whole thing; copy reassuring a
            member their work is safe mostly plants the worry it answers. */}
        <AuthField
          label="Access Code"
          type="text"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          placeholder="Code from the community"
          hint={renewing ? undefined : 'It changes from time to time, so use the current one.'}
        />

        {error && <AuthNotice tone="error">{error}</AuthNotice>}

        <AuthSubmit busy={busy} disabled={!code.trim()}>
          Unlock My Workspace
        </AuthSubmit>
      </AuthForm>

      <div className="flex flex-col items-center gap-2">
        <a
          href={SKOOL_ACCESS_CODE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/5 px-4 py-2 text-[12px] font-medium text-ink-200 transition-colors hover:border-ink/20 hover:bg-ink/10 hover:text-ink"
        >
          Get the Access Code on Skool
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={() => void signOut()}
          className="text-[11px] text-ink-600 transition-colors hover:text-ink-300"
        >
          {email ? `Sign Out of ${email}` : 'Sign Out'}
        </button>
      </div>
    </AuthShell>
  )
}
