import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getAppConfig, SKOOL_COMMUNITY_URL } from '../utils/constants'
import AppLogo from './AppLogo'

// Thin macOS-style menu bar: branding + the active app's name on the left,
// external quick links + clock on the right. Pure chrome — app navigation
// stays in the dock.

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

      <MenuLink href={SKOOL_COMMUNITY_URL} label="Community" />
      <MenuLink href="https://kie.ai/billing" label="Get Credits" />
      <span className="hidden pl-1 text-[12px] tabular-nums text-ink-400 sm:block">{clock}</span>
    </header>
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
