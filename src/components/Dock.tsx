import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Coins, LogOut, Monitor, Moon, RefreshCw, Settings, Sun, User } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import { useThemeStore, type ThemePref } from '../stores/themeStore'
import { APP_REGISTRY, type AppCategory, type AppConfig } from '../utils/constants'
import SettingsModal from './SettingsModal'

// macOS-style bottom dock — the sidebar's replacement for this experiment.
// Every icon carries its label underneath (no hover-only tooltips), app tiles
// are filled with each app's accent, and the sidebar footer's essentials
// (credits, theme, settings, account) live in a utility cluster on the right.

const SECTION_ORDER: AppCategory[] = ['library', 'create', 'tools', 'admin']

export default function Dock() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const openApp = useAppStore((s) => s.openApp)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const isSignedIn = useAuthStore((s) => !!s.profile)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const groups = SECTION_ORDER.map((category) =>
    APP_REGISTRY.filter(
      (app) => app.category === category && (category !== 'admin' || isAdmin)
    )
  ).filter((apps) => apps.length > 0)

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {/* overflow-x-auto keeps the dock usable on narrow screens; md+ fits
            everything so overflow stays visible (popovers need it). */}
        <nav className="pointer-events-auto flex max-w-full items-start gap-0.5 overflow-x-auto rounded-[26px] border border-ink/10 bg-surface-1/75 px-2.5 pb-1.5 pt-2.5 shadow-2xl shadow-black/25 backdrop-blur-2xl md:overflow-visible light:bg-white/75">
          {groups.map((apps, i) => (
            <Fragment key={apps[0].category}>
              {i > 0 && <DockDivider />}
              {apps.map((app) => (
                <DockAppTile
                  key={app.id}
                  app={app}
                  active={activeApp === app.id}
                  running={runningApps.includes(app.id)}
                  onClick={() => openApp(app.id)}
                />
              ))}
            </Fragment>
          ))}

          <DockDivider />
          <CreditsTile />
          <ThemeTile />
          <DockItem label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            <UtilityTile>
              <Settings className="h-[22px] w-[22px] text-ink-200" strokeWidth={1.75} />
            </UtilityTile>
          </DockItem>
          {isSignedIn && <AccountTile />}
        </nav>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

// Inset vertical hairline between dock sections — sized and offset to sit
// centered on the icon tiles, not the full item height (labels excluded).
function DockDivider() {
  return <span className="mx-1 mt-1.5 h-10 w-px shrink-0 self-start bg-ink/10" />
}

interface DockItemProps {
  label: string
  title?: string
  active?: boolean
  running?: boolean
  onClick: () => void
  children: ReactNode
}

// Shared item chrome: tile on top, always-visible label under it, and a
// macOS-style running/active dot below the label. Hover gives a slow eased
// lift (no scale — that's what felt clunky); click presses the tile down.
function DockItem({ label, title, active, running, onClick, children }: DockItemProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="group flex w-16 shrink-0 select-none flex-col items-center gap-1 pt-0.5"
    >
      <span className="flex h-12 w-12 items-center justify-center will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px group-active:translate-y-0 group-active:scale-[0.985] group-active:duration-150">
        {children}
      </span>
      <span
        className={`max-w-full truncate text-[10px] leading-tight transition-colors duration-200 ${
          active ? 'font-medium text-ink' : 'text-ink-400 group-hover:text-ink-200'
        }`}
      >
        {label}
      </span>
      <span className="flex h-1 items-center">
        {(active || running) && (
          <span
            className={`h-1 w-1 rounded-full ${active ? 'bg-ink-200' : 'bg-ink-500/60'}`}
          />
        )}
      </span>
    </button>
  )
}

// Colorful macOS-app-icon-style tile: flat accent fill with a soft top
// sheen and an inset highlight ring so it reads as a "real" app icon.
function DockAppTile({
  app,
  active,
  running,
  onClick,
}: {
  app: AppConfig
  active: boolean
  running: boolean
  onClick: () => void
}) {
  const Icon = app.icon
  // Admin's accent is near-white — a white glyph would vanish on it.
  const iconColor = app.id === 'admin' ? '#27272a' : '#ffffff'

  return (
    <DockItem label={app.name} active={active} running={running} onClick={onClick}>
      <span
        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] shadow-sm shadow-black/10"
        style={{ backgroundColor: app.accent }}
      >
        <span className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/5 to-transparent" />
        <span className="absolute inset-0 rounded-[14px] ring-1 ring-inset ring-white/20" />
        <Icon className="relative h-[22px] w-[22px]" style={{ color: iconColor }} strokeWidth={1.9} />
      </span>
    </DockItem>
  )
}

// Neutral glass tile for the utility cluster (credits / theme / settings /
// account) so they read as chrome, not apps.
function UtilityTile({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center rounded-[14px] bg-ink/[0.07] ring-1 ring-inset ring-ink/10 transition-colors duration-300 group-hover:bg-ink/[0.1]">
      {children}
    </span>
  )
}

// kie.ai balance — the label IS the number; clicking the tile refreshes it.
// Same polling behaviour as the sidebar chip (mount + 60s + window focus).
function CreditsTile() {
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

  const label = balance !== null ? balance.toLocaleString() : '—'

  return (
    <DockItem
      label={label}
      title="kie.ai credits remaining — click to refresh"
      onClick={handleRefresh}
    >
      <UtilityTile>
        {refreshing ? (
          <RefreshCw className="h-[22px] w-[22px] animate-spin text-ink-200" strokeWidth={1.75} />
        ) : (
          <>
            <Coins
              className="h-[22px] w-[22px] text-ink-200 transition-opacity group-hover:opacity-0"
              strokeWidth={1.75}
            />
            <RefreshCw
              className="absolute h-[22px] w-[22px] text-ink-200 opacity-0 transition-opacity group-hover:opacity-100"
              strokeWidth={1.75}
            />
          </>
        )}
      </UtilityTile>
    </DockItem>
  )
}

const THEME_CYCLE: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
]

// One tile instead of the sidebar's segmented toggle: clicking cycles
// dark → light → system, and the label always names the current preference.
function ThemeTile() {
  const pref = useThemeStore((s) => s.pref)
  const setPref = useThemeStore((s) => s.setPref)

  const index = THEME_CYCLE.findIndex((o) => o.value === pref)
  const current = THEME_CYCLE[index] ?? THEME_CYCLE[0]
  const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length]
  const Icon = current.icon

  return (
    <DockItem
      label={current.label}
      title={`Theme: ${current.label} — click for ${next.label}`}
      onClick={() => setPref(next.value)}
    >
      <UtilityTile>
        <Icon className="h-[22px] w-[22px] text-ink-200" strokeWidth={1.75} />
      </UtilityTile>
    </DockItem>
  )
}

// Account tile with an upward popover — same content as the sidebar's
// UserMenu (masked email + sign out), restyled for the dock.
function AccountTile() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!profile) return null

  const initial = (profile.email[0] || '?').toUpperCase()

  return (
    <div ref={ref} className="relative shrink-0">
      <DockItem label="Account" title="My Account" onClick={() => setOpen((v) => !v)}>
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#e8dcc8] to-[#c4a77d] text-lg font-semibold text-stone-800 shadow-sm shadow-black/10 ring-1 ring-inset ring-white/20">
          {initial}
        </span>
      </DockItem>

      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-3 w-[min(224px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-lg border border-ink/10 bg-surface-1 p-1 shadow-xl">
          <div className="flex items-center gap-2 border-b border-ink/5 px-3 py-2.5">
            <User className="h-3.5 w-3.5 text-ink-500" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-500">Signed in as</div>
              <div className="truncate text-[12px] font-medium text-ink-200">{profile.email}</div>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false)
              signOut()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
