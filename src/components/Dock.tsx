import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Settings, Workflow } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useActivityStore } from '../stores/activityStore'
import { useChromeHidden } from '../stores/chromeStore'
import { useSkillUpdateUnseen } from '../stores/skillUpdateStore'
import { useIsAppVisible } from '../stores/appVisibilityStore'
import { useNewErrorCount } from '../stores/errorInboxStore'
import { APP_REGISTRY, SECTION_ORDER, type AppConfig } from '../utils/constants'
import AppGlassTile, { GlassTile } from './AppGlassTile'
import { useBankStore } from '../stores/bankStore'
import { MountOnce, SettingsModal } from './LazyOverlays'
import { loadSettingsModal, preloadApp } from '../appChunks'

// macOS-style bottom dock — the sidebar's replacement for this experiment.
// Every icon carries its label underneath (no hover-only tooltips), app tiles
// are filled with each app's accent, and Settings sits on the right. Credits
// and the theme toggle live in the menu bar; Account + Admin live in the
// Settings modal.

// Dashboard leads (its own 'system' group → divider between it and Bank).
// Tools sit between Bank and the Create row, fenced by a divider on each side:
// finding a winning ad and tearing it down is what you do BEFORE the production
// line starts, so the dock reads left to right in the order the work happens.
// The order itself lives in constants.ts — Meet Your Team lays the same crew
// out in the same order and reads it from there.

export default function Dock() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const openApp = useAppStore((s) => s.openApp)
  const activityCounts = useActivityStore((s) => s.counts)
  // Edit hands out a file that never auto-updates, so a new cut of the skill
  // has to announce itself from the dock — nobody reopens a download page.
  const skillUpdate = useSkillUpdateUnseen()
  // On a phone the dock slides away while the member reads (see
  // useChromeAutoHide) and comes back the moment they scroll up.
  const chromeHidden = useChromeHidden()
  // Outliers ships switched off (Settings → Appearance). An app a member has
  // turned off never renders a tile — a group left empty by that is dropped
  // below, so its divider goes with it.
  const isVisible = useIsAppVisible()
  // Admin only (0 for everyone else): members hit errors the operator hasn't
  // looked at yet. Admin is reached through Settings, so that's the tile that
  // dots.
  const newErrors = useNewErrorCount()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Flows pinned to the dock open as apps of their own, beside Flow. The whole
  // bank list is read and filtered here: a selector returning a fresh array
  // re-renders the dock on every store change.
  const flows = useBankStore((s) => s.flows)
  const pinnedFlows = isVisible('flow') ? flows.filter((f) => f.pinned) : []
  const sendToApp = useAppStore((s) => s.sendToApp)

  // On a phone the dock is wider than the screen and scrolls, so the running
  // app's tile is often off to one side — including right after a handoff moved
  // you to an app you never tapped. Bring it into view whenever it changes.
  // `inline: 'nearest'` so a tile already on screen doesn't jump, and `block:
  // 'nearest'` so this can never scroll the page itself.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!activeApp) return
    const nav = navRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) return
    nav.querySelector(`[data-dock-app="${activeApp}"]`)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    })
  }, [activeApp])

  const groups = SECTION_ORDER.map((category) =>
    APP_REGISTRY.filter((app) => app.category === category && isVisible(app.id))
  ).filter((apps) => apps.length > 0)

  return (
    <>
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:translate-y-0 ${
          chromeHidden ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        {/* overflow-x-auto keeps the dock usable on narrow screens; md+ fits
            everything so overflow stays visible. */}
        <nav ref={navRef} className="pointer-events-auto flex max-w-full items-start gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-hide rounded-[26px] border border-ink/10 bg-surface-1/75 px-2 pb-1 pt-1.5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl backdrop-saturate-150 md:overflow-visible md:px-2.5 md:pt-2 light:bg-white/75 light:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]">
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
                  badge={app.id === 'edit-studio' && skillUpdate}
                  onClick={() => openApp(app.id)}
                />
              ))}
              {apps[0].category === 'automate' && pinnedFlows.map((f) => (
                <DockItem
                  key={f.id}
                  label={f.name}
                  title={f.name}
                  accent="#0891B2"
                  onClick={() => sendToApp({ targetApp: 'flow', targetField: 'openFlow', data: { flowId: f.id, view: 'run' } })}
                  onIntent={() => preloadApp('flow')}
                >
                  <GlassTile icon={Workflow} accent="#0E7490" />
                </DockItem>
              ))}
            </Fragment>
          ))}

          <DockDivider />
          <DockItem
            label="Settings"
            title={newErrors > 0 ? `Settings · ${newErrors} new ${newErrors === 1 ? 'error' : 'errors'} in Admin` : 'Settings'}
            onClick={() => setSettingsOpen(true)}
            onIntent={() => { loadSettingsModal().catch(() => {}) }}
          >
            {/* The badge sits outside the tile: UtilityTile clips its
                children, and this has to overhang the corner like an app
                tile's does. */}
            <span className="relative">
              <UtilityTile>
                <Settings className="h-[22px] w-[22px] text-ink-200" strokeWidth={1.75} />
              </UtilityTile>
              {newErrors > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 z-20 h-3 w-3 rounded-full border-2 border-surface-1 bg-red-500"
                  aria-hidden
                />
              )}
            </span>
          </DockItem>
        </nav>
      </div>
      <MountOnce when={settingsOpen}>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </MountOnce>
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
  // Marks the tile so the dock can scroll the running app into view.
  appId?: string
  active?: boolean
  running?: boolean
  // A generation is in flight in this app — the dot pulses in the app accent
  // so the dock reads as "this teammate is working".
  busy?: boolean
  accent?: string
  onClick: () => void
  // The pointer arrived, or focus did: the press is probably a few hundred ms
  // away, which is time enough to have fetched what it opens.
  onIntent?: () => void
  children: ReactNode
}

// Shared item chrome: tile on top, always-visible label under it, and a
// macOS-style running/active dot below the label. Hover gives a slow eased
// lift (no scale — that's what felt clunky); no click press, it felt slow.
function DockItem({ label, title, appId, active, running, busy, accent, onClick, onIntent, children }: DockItemProps) {
  return (
    <button
      onClick={onClick}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      title={title}
      data-dock-app={appId}
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

// The dock's app button: the shared glass tile (components/AppGlassTile, which
// also dresses Meet Your Team) plus the dock's own label, running dot and
// update badge.
function DockAppTile({
  app,
  active,
  running,
  busy,
  badge,
  onClick,
}: {
  app: AppConfig
  active: boolean
  running: boolean
  busy: boolean
  // Something new is waiting inside — a notification dot on the tile itself,
  // not the running dot under the label (that one means "this app is open").
  badge: boolean
  onClick: () => void
}) {
  return (
    // No title attr: the native tooltip popping over the dock on hover was
    // distracting — what each app does is in Meet Your Team.
    <DockItem
      label={app.name}
      appId={app.id}
      active={active}
      running={running}
      busy={busy}
      accent={app.accent}
      onClick={onClick}
      onIntent={() => preloadApp(app.id)}
    >
      <AppGlassTile
        app={app}
        overlay={
          // Top-right, where a notification badge sits on every dock a member
          // has used. It was top-left while a crab peeked out of that corner on
          // hover; the crab is gone, so the badge goes back to the convention.
          // Ringed in the dock's own fill so it reads as a badge on the tile.
          badge ? (
            <span
              className="absolute -right-0.5 -top-0.5 z-20 h-3 w-3 rounded-full border-2 border-surface-1 bg-red-500"
              aria-hidden
            />
          ) : null
        }
      />
    </DockItem>
  )
}

// Neutral glass tile for the utility cluster (credits / theme / settings /
// account) so they read as chrome, not apps. Same `glass-fill` as an app tile,
// just over ink rather than an accent.
function UtilityTile({ children }: { children: ReactNode }) {
  return (
    <span className="glass-fill relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] bg-ink/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] ring-1 ring-inset ring-ink/10 transition-colors duration-300 group-hover:bg-ink/[0.12] light:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(255,255,255,0.3)]">
      {children}
    </span>
  )
}

