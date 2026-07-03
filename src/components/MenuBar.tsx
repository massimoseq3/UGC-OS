import { useEffect, useState } from 'react'
import { ArrowUpRight, Coins, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import { getAppConfig, SKOOL_COMMUNITY_URL } from '../utils/constants'
import AppLogo from './AppLogo'

// Thin macOS-style menu bar: branding + the active app's name on the left,
// credits balance, external quick links + clock on the right. Pure chrome —
// app navigation stays in the dock.

function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)
}

export default function MenuBar() {
  const activeApp = useAppStore((s) => s.activeApp)
  const appName = activeApp ? getAppConfig(activeApp)?.name : null
  const clock = useClock()

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-9 select-none items-center gap-2 border-b border-ink/5 bg-surface-1/75 px-3 backdrop-blur-2xl light:bg-white/75">
      <div className="flex shrink-0 items-center gap-1.5">
        <AppLogo className="h-5 w-5" />
        <span className="whitespace-nowrap text-[13px] font-bold tracking-tight text-ink-100">
          UGC{' '}
          <span
            className="italic font-normal"
            style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
          >
            OS
          </span>
        </span>
      </div>
      {/* Active app name, like macOS shows the frontmost app beside the logo. */}
      {appName && (
        <span className="truncate text-[13px] font-medium text-ink-400">{appName}</span>
      )}

      <div className="flex-1" />

      <CreditsItem />
      <MenuLink href="https://kie.ai/billing" label="Get Credits" />
      <MenuLink href={SKOOL_COMMUNITY_URL} label="Community" />
      <span className="hidden pl-1 text-[12px] tabular-nums text-ink-400 sm:block">{clock}</span>
    </header>
  )
}

// kie.ai balance as a menu-bar item — clicking refreshes it (the coin glyph
// swaps to a spinner). Same polling as the old dock tile: mount + 60s +
// window focus.
function CreditsItem() {
  const apiKey = useSettingsStore((s) => s.kieApiKey)
  const balance = useCreditsStore((s) => s.balance)
  const refresh = useCreditsStore((s) => s.refresh)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!apiKey) return
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [apiKey, refresh])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      title="kie.ai credits remaining — click to refresh"
      aria-label="Refresh credits balance"
      className="group flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06] hover:text-ink-100 disabled:opacity-60"
    >
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        {refreshing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-400" strokeWidth={1.75} />
        ) : (
          <>
            <Coins className="h-3.5 w-3.5 text-ink-400 group-hover:opacity-0" strokeWidth={1.75} />
            <RefreshCw className="absolute h-3.5 w-3.5 text-ink-300 opacity-0 group-hover:opacity-100" strokeWidth={1.75} />
          </>
        )}
      </span>
      <span>
        <span className="tabular-nums">{balance !== null ? balance.toLocaleString() : '—'}</span>
        <span className="text-ink-500"> credits left</span>
      </span>
    </button>
  )
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06] hover:text-ink-100"
    >
      {label}
      <ArrowUpRight className="h-3 w-3 text-ink-500" strokeWidth={2} />
    </a>
  )
}
