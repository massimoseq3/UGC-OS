import { useState } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'ugc-lab:cookie-consent'

export default function CookieBanner() {
  // Read consent synchronously on first render (client-only app, no SSR) so we
  // never flash the banner and never setState from an effect.
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'accepted' } catch { return false }
  })

  if (dismissed) return null

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, 'accepted') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-[180] -translate-x-1/2 flex max-w-[640px] items-center gap-3 rounded-xl border border-white/10 bg-[#09090b]/95 px-4 py-2.5 text-[12px] text-zinc-300 shadow-lg backdrop-blur-xl">
      <Cookie className="h-4 w-4 shrink-0 text-amber-300" />
      <span className="leading-snug">
        We use browser storage (localStorage + IndexedDB) and authentication cookies to run the app.{' '}
        <Link to="/legal/privacy" className="text-zinc-100 underline">
          Privacy Policy
        </Link>
        .
      </span>
      <button
        onClick={accept}
        className="ml-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
      >
        OK
      </button>
      <button
        onClick={accept}
        aria-label="Dismiss"
        className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
