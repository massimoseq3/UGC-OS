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
    // Phones: full-width strip sitting above the dock (centering at 375px
    // squeezed the copy into a one-word-per-line column over the dock).
    // sm+: the original centered pill at the bottom edge.
    <div className="fixed inset-x-3 bottom-[116px] z-[180] flex items-center gap-3 rounded-xl border border-ink/10 bg-surface-1/95 px-4 py-2.5 text-[12px] text-ink-300 shadow-lg backdrop-blur-xl sm:inset-x-auto sm:bottom-3 sm:left-1/2 sm:max-w-[640px] sm:-translate-x-1/2">
      <Cookie className="h-4 w-4 shrink-0 text-amber-300 light:text-amber-700" />
      <span className="leading-snug">
        We use browser storage (localStorage + IndexedDB) and authentication cookies to run the app.{' '}
        <Link to="/legal/privacy" className="text-ink-100 underline">
          Privacy Policy
        </Link>
        .
      </span>
      <button
        onClick={accept}
        className="ml-1 rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-ink-900 transition-colors hover:bg-ink-100"
      >
        OK
      </button>
      <button
        onClick={accept}
        aria-label="Dismiss"
        className="rounded-md p-1 text-ink-500 transition-colors hover:bg-ink/[0.06] hover:text-ink-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
