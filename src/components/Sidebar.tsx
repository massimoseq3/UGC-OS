import { useEffect, useState } from 'react'
import { Coins, Menu, Moon, RefreshCw, Settings, Sun } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import { APP_REGISTRY, CATEGORY_LABELS, type AppCategory, type AppConfig } from '../utils/constants'
import AppLogo from './AppLogo'
import SegmentedToggle from './SegmentedToggle'
import SettingsModal from './SettingsModal'
import UserMenu from './auth/UserMenu'
import { useIsDesktop } from '../hooks/useBreakpoint'

const SECTION_ORDER: AppCategory[] = ['library', 'create', 'tools', 'admin']

export default function Sidebar() {
  const activeApp = useAppStore((s) => s.activeApp)
  const openApp = useAppStore((s) => s.openApp)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const mobileOpen = useAppStore((s) => s.mobileSidebarOpen)
  const closeMobileSidebar = useAppStore((s) => s.closeMobileSidebar)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const isSignedIn = useAuthStore((s) => !!s.profile)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isDesktop = useIsDesktop()
  // On mobile the drawer mirrors the desktop *collapsed* layout (icon + label
  // underneath). On desktop, the user's persisted collapse preference applies.
  const showExpanded = isDesktop && !collapsed

  const handleNav = (action: () => void) => {
    action()
    if (!isDesktop) closeMobileSidebar()
  }

  const handleBurger = () => {
    if (isDesktop) toggleSidebar()
    else closeMobileSidebar()
  }

  const sections = SECTION_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    apps: APP_REGISTRY.filter((app) => app.category === category),
  }))
    .map((s) => s.category === 'admin' && !isAdmin ? { ...s, apps: [] } : s)
    .filter((s) => s.apps.length > 0)

  // Below md: render as overlay drawer with the collapsed (icon + label) layout.
  // Above md: fixed gutter — width follows the persisted collapse preference.
  const widthClass = isDesktop
    ? collapsed ? 'w-20' : 'w-56'
    : 'w-20'
  const translateClass = isDesktop
    ? 'translate-x-0'
    : mobileOpen ? 'translate-x-0' : '-translate-x-full'

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && (
        <div
          className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={closeMobileSidebar}
        />
      )}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex flex-col border-r border-ink/5 bg-surface-1 light:border-ink/10 light:bg-[#F1F1F2] transition-[width,transform] duration-200 ease-out ${widthClass} ${translateClass}`}
      >
        {/* Header — burger + logo on a plain row, separated from the nav by an
            inset hairline divider (same side gaps as the section dividers
            below; replaces the old rounded "island" pill). */}
        <div
          className={`flex shrink-0 select-none items-center ${
            showExpanded ? 'gap-2 px-3 py-3' : 'flex-col gap-1 px-2 py-3'
          }`}
        >
          <button
            onClick={handleBurger}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink/[0.06]"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className={`flex items-center gap-2 ${showExpanded ? 'min-w-0' : ''}`}>
            <AppLogo className="h-8 w-8 shrink-0" />
            {showExpanded && (
              <span className="truncate text-[18px] font-bold tracking-tight text-ink-100">
                UGC OS
              </span>
            )}
          </div>
        </div>
        <div className="mx-3 border-t border-ink/5" />

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, i) => (
            <div key={section.category}>
              {i > 0 && <div className="mx-1 my-3 border-t border-ink/5" />}
              {showExpanded && (
                <div className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-500">
                  {section.label}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {section.apps.map((app) => (
                  <SidebarRow
                    key={app.id}
                    app={app}
                    active={activeApp === app.id}
                    collapsed={!showExpanded}
                    onClick={() => handleNav(() => openApp(app.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-ink/5 px-2 py-3">
          <CreditsChip collapsed={!showExpanded} />
          <ThemeQuickToggle collapsed={!showExpanded} />
          <SidebarRow
            app={{ id: 'settings', name: 'Settings', icon: Settings, accent: '#a1a1aa', category: 'tools' }}
            active={false}
            collapsed={!showExpanded}
            onClick={() => handleNav(() => setSettingsOpen(true))}
          />
          {isSignedIn && <UserMenu collapsed={!showExpanded} />}
        </div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

// Dark/Light segmented toggle — the same house control as everywhere else,
// trimmed to two options (the three-way Dark/Light/System lives in Settings).
// Picks an explicit preference, overriding "system".
function ThemeQuickToggle({ collapsed }: { collapsed: boolean }) {
  const resolved = useThemeStore((s) => s.resolved)
  const setPref = useThemeStore((s) => s.setPref)

  // Collapsed rail is too narrow for labels — show a stacked icon-only toggle.
  if (collapsed) {
    const next = resolved === 'dark' ? 'light' : 'dark'
    const Icon = resolved === 'dark' ? Sun : Moon
    return (
      <button
        onClick={() => setPref(next)}
        className="flex w-full items-center justify-center rounded-full border border-ink/10 bg-ink/[0.03] p-2 transition-colors hover:bg-ink/[0.06]"
        title={`Switch to ${next} mode`}
      >
        <Icon className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
      </button>
    )
  }

  // Compact house toggle — sized to match the sidebar rows, keeps the
  // sliding-indicator animation.
  return (
    <SegmentedToggle<'dark' | 'light'>
      dense
      value={resolved}
      onChange={setPref}
      options={[
        { value: 'dark', label: 'Dark', icon: Moon },
        { value: 'light', label: 'Light', icon: Sun },
      ]}
    />
  )
}

// kie.ai credit balance — lives above Settings now that the top bar is gone.
// Auto-refreshes every minute and on window focus; the manual refresh button
// stays for impatient moments right after a generation.
function CreditsChip({ collapsed }: { collapsed: boolean }) {
  const apiKey = useSettingsStore((s) => s.kieApiKey)
  const balance = useCreditsStore((s) => s.balance)
  const refresh = useCreditsStore((s) => s.refresh)
  const [refreshing, setRefreshing] = useState(false)

  // Refresh on mount + whenever the API key changes, then keep the number
  // current: poll every 60 s and re-fetch when the tab regains focus.
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

  if (!apiKey) return null

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }

  const label = balance !== null ? balance.toLocaleString() : '—'

  if (collapsed) {
    return (
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex w-full flex-col items-center gap-1 rounded-full px-1 py-2 transition-colors hover:bg-ink/[0.04] disabled:opacity-60"
        title="kie.ai credits remaining — click to refresh"
      >
        <Coins className={`h-5 w-5 shrink-0 text-ink-300 ${refreshing ? 'animate-pulse' : ''}`} strokeWidth={1.75} />
        <span className="text-center text-[10px] leading-tight tabular-nums text-ink-300">{label}</span>
      </button>
    )
  }

  return (
    <div
      // h-9 matches the dense theme toggle below so the sidebar footer reads
      // as one stack of equal-height pills.
      className="flex h-9 w-full items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.04] px-3"
      title="kie.ai credits remaining"
    >
      <Coins className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-300">
        <span className="tabular-nums">{label}</span>
        <span className="text-ink-500"> credits</span>
      </span>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/[0.08] hover:text-ink-200 disabled:opacity-50"
        title="Refresh credits balance"
        aria-label="Refresh credits balance"
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}

interface SidebarRowProps {
  app: AppConfig
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function SidebarRow({ app, active, collapsed, onClick }: SidebarRowProps) {
  const Icon = app.icon

  if (collapsed) {
    return (
      <button
        onClick={onClick}
        className={`flex w-full flex-col items-center gap-1 rounded-full px-1 py-2 transition-colors ${
          active ? 'bg-ink/[0.08]' : 'hover:bg-ink/[0.04]'
        }`}
      >
        <Icon
          className={`h-5 w-5 shrink-0 ${active ? 'text-ink-50' : ''}`}
          strokeWidth={active ? 2 : 1.75}
        />
        <span
          className={`text-center text-[10px] leading-tight ${
            active ? 'font-medium text-ink' : 'font-normal text-ink-300'
          }`}
        >
          {app.name}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-full px-3 py-2 transition-colors ${
        active ? 'bg-ink/[0.08]' : 'hover:bg-ink/[0.04]'
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${active ? 'text-ink-50' : ''}`}
        strokeWidth={active ? 2 : 1.75}
      />
      <span
        className={`truncate text-sm ${
          active ? 'font-medium text-ink' : 'font-normal text-ink-300'
        }`}
      >
        {app.name}
      </span>
    </button>
  )
}
