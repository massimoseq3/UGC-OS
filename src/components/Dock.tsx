import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Coins, Moon, RefreshCw, Settings, Sun } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import { useThemeStore, type ThemePref } from '../stores/themeStore'
import { APP_REGISTRY, type AppCategory, type AppConfig } from '../utils/constants'
import SettingsModal from './SettingsModal'

// macOS-style bottom dock — the sidebar's replacement for this experiment.
// Every icon carries its label underneath (no hover-only tooltips), app tiles
// are filled with each app's accent, and a utility cluster (credits, theme,
// settings) sits on the right. Account + Admin live in the Settings modal.

const SECTION_ORDER: AppCategory[] = ['library', 'create', 'tools']

export default function Dock() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const openApp = useAppStore((s) => s.openApp)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const groups = SECTION_ORDER.map((category) =>
    APP_REGISTRY.filter((app) => app.category === category)
  ).filter((apps) => apps.length > 0)

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {/* overflow-x-auto keeps the dock usable on narrow screens; md+ fits
            everything so overflow stays visible. */}
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

// Simple dark ↔ light switch — System is a Settings-only option. When the
// preference is System, the tile shows whichever theme it currently resolves
// to, and clicking flips to the opposite explicit theme.
function ThemeTile() {
  const pref = useThemeStore((s) => s.pref)
  const resolved = useThemeStore((s) => s.resolved)
  const setPref = useThemeStore((s) => s.setPref)

  const current: ThemePref = pref === 'system' ? resolved : pref
  const next: ThemePref = current === 'dark' ? 'light' : 'dark'
  const Icon = current === 'dark' ? Moon : Sun
  const label = current === 'dark' ? 'Dark' : 'Light'

  return (
    <DockItem
      label={label}
      title={`Theme: ${label} — click for ${next === 'dark' ? 'Dark' : 'Light'}`}
      onClick={() => setPref(next)}
    >
      <UtilityTile>
        <Icon className="h-[22px] w-[22px] text-ink-200" strokeWidth={1.75} />
      </UtilityTile>
    </DockItem>
  )
}

