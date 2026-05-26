import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { POLICY_VERSION } from '../legal/version'

// Blocking modal shown to already-signed-up users when POLICY_VERSION moves
// past their stored policy_version_accepted. They must re-accept before the
// workspace becomes interactive again.
export default function LegalAcceptModal() {
  const profile = useAuthStore((s) => s.profile)
  const acceptPolicies = useAuthStore((s) => s.acceptPolicies)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return null
  if (profile.policy_version_accepted === POLICY_VERSION) return null

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await acceptPolicies(POLICY_VERSION)
    if (!res.ok) setError(res.error)
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0a0b] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              Updated terms
            </h2>
            <p className="text-[12px] text-zinc-500">
              Our policies have been updated. Please review and accept to continue.
            </p>
          </div>
        </div>

        <ul className="mb-4 space-y-1.5 text-[13px] text-zinc-300">
          <li>
            <Link to="/legal/terms" target="_blank" rel="noreferrer" className="text-zinc-100 underline">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link to="/legal/privacy" target="_blank" rel="noreferrer" className="text-zinc-100 underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link to="/legal/aup" target="_blank" rel="noreferrer" className="text-zinc-100 underline">
              Acceptable Use Policy
            </Link>
          </li>
        </ul>

        {error && (
          <div className="mb-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Accept &amp; continue
        </button>

        <p className="mt-3 text-center text-[12px] leading-snug text-zinc-400">
          By clicking <span className="font-medium text-zinc-200">Accept &amp; continue</span>, you agree to the updated Terms of Service, Privacy Policy, and Acceptable Use Policy.
        </p>
      </div>
    </div>
  )
}
