import { Fragment, useState, type ReactNode } from 'react'
import { Moon, Settings, Sun } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useActivityStore } from '../stores/activityStore'
import { useThemeStore, type ThemePref } from '../stores/themeStore'
import { APP_REGISTRY, type AppCategory, type AppConfig } from '../utils/constants'
import { getTeamMember } from '../utils/team'
import CrabSprite from './CrabSprite'
import SettingsModal from './SettingsModal'

// macOS-style bottom dock — the sidebar's replacement for this experiment.
// Every icon carries its label underneath (no hover-only tooltips), app tiles
// are filled with each app's accent, and a utility cluster (theme, settings)
// sits on the right. Credits moved to the menu bar; Account + Admin live in
// the Settings modal.

const SECTION_ORDER: AppCategory[] = ['library', 'create', 'tools']

export default function Dock() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const openApp = useAppStore((s) => s.openApp)
  const activityCounts = useActivityStore((s) => s.counts)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const groups = SECTION_ORDER.map((category) =>
    APP_REGISTRY.filter((app) => app.category === category)
  ).filter((apps) => apps.length > 0)

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {/* overflow-x-auto keeps the dock usable on narrow screens; md+ fits
            everything so overflow stays visible. */}
        <nav className="pointer-events-auto flex max-w-full items-start gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-hide rounded-[26px] border border-ink/10 bg-surface-1/75 px-2 pb-1.5 pt-2 shadow-2xl shadow-black/25 backdrop-blur-2xl md:overflow-visible md:px-2.5 md:pt-2.5 light:bg-white/75">
          {groups.map((apps, i) => (
            <Fragment key={apps[0].category}>
              {i > 0 && <DockDivider />}
              {apps.map((app) => (
                <DockAppTile
                  key={app.id}
                  app={app}
                  active={activeApp === app.id}
                  running={runningApps.includes(app.id)}
                  busy={(activityCounts[app.id] ?? 0) > 0}
                  onClick={() => openApp(app.id)}
                />
              ))}
            </Fragment>
          ))}

          <DockDivider />
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
  // A generation is in flight in this app — the dot pulses in the app accent
  // so the dock reads as "this teammate is working".
  busy?: boolean
  accent?: string
  onClick: () => void
  children: ReactNode
}

// Shared item chrome: tile on top, always-visible label under it, and a
// macOS-style running/active dot below the label. Hover gives a slow eased
// lift (no scale — that's what felt clunky); no click press, it felt slow.
function DockItem({ label, title, active, running, busy, accent, onClick, children }: DockItemProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="group flex w-[3.4rem] shrink-0 select-none flex-col items-center gap-1 pt-0.5 md:w-16"
    >
      <span className="flex h-12 w-12 items-center justify-center will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px">
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
        {busy ? (
          <span
            className="h-1 w-1 animate-pulse rounded-full"
            style={{ backgroundColor: accent }}
          />
        ) : (
          (active || running) && (
            <span
              className={`h-1 w-1 rounded-full ${active ? 'bg-ink-200' : 'bg-ink-500/60'}`}
            />
          )
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
  busy,
  onClick,
}: {
  app: AppConfig
  active: boolean
  running: boolean
  busy: boolean
  onClick: () => void
}) {
  const Icon = app.icon
  // Admin's accent is near-white — a white glyph would vanish on it.
  const iconColor = app.id === 'admin' ? '#27272a' : '#ffffff'
  const member = getTeamMember(app.id)

  return (
    <DockItem
      label={app.name}
      title={member ? `${member.name} · ${member.role}` : undefined}
      active={active}
      running={running}
      busy={busy}
      accent={app.accent}
      onClick={onClick}
    >
      <span
        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] shadow-sm shadow-black/10"
        style={{ backgroundColor: app.accent }}
      >
        <span className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/5 to-transparent" />
        <span className="absolute inset-0 rounded-[14px] ring-1 ring-inset ring-white/20" />
        {/* Hover cross-fades the glyph to the app's crab persona — the crew
            peeks out of the dock without changing the label. The tile keeps
            its solid accent; a soft drop shadow hugging the sprite's pixel
            silhouette lifts the coral crab off saturated fills. */}
        <Icon
          className={`relative h-[22px] w-[22px] ${member ? 'transition-opacity duration-200 group-hover:opacity-0' : ''}`}
          style={{ color: iconColor }}
          strokeWidth={1.9}
        />
        {member && (
          <CrabSprite
            variant={member.appId}
            className="absolute h-[26px] w-9 opacity-0 transition-opacity duration-200 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.45))] group-hover:opacity-100"
          />
        )}
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

