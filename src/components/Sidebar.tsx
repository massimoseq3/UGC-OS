import { useEffect, useState } from 'react'
import { Coins, Menu, RefreshCw, Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import { APP_REGISTRY, CATEGORY_LABELS, type AppCategory, type AppConfig } from '../utils/constants'
import AppLogo from './AppLogo'
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
        className={`fixed bottom-0 left-0 top-0 z-40 flex flex-col border-r border-white/5 bg-[#09090b] transition-[width,transform] duration-200 ease-out ${widthClass} ${translateClass}`}
      >
        {/* Header — burger + logo on a plain row, separated from the nav by a
            hairline divider (replaces the old rounded "island" pill). */}
        <div
          className={`flex shrink-0 select-none items-center border-b border-white/5 ${
            showExpanded ? 'gap-1.5 px-3 py-3' : 'flex-col gap-1 px-2 py-3'
          }`}
        >
          <button
            onClick={handleBurger}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.06]"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className={`flex items-center gap-1.5 ${showExpanded ? 'min-w-0' : ''}`}>
            <AppLogo className="h-7 w-7 shrink-0" />
            {showExpanded && (
              <span className="truncate text-[16px] font-bold tracking-tight text-zinc-100">
                UGC OS
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, i) => (
            <div key={section.category}>
              {i > 0 && <div className="mx-1 my-3 border-t border-white/5" />}
              {showExpanded && (
                <div className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
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

        <div className="space-y-1 border-t border-white/5 px-2 py-3">
          <CreditsChip collapsed={!showExpanded} />
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
        className="flex w-full flex-col items-center gap-1 rounded-full px-1 py-2 transition-colors hover:bg-white/[0.04] disabled:opacity-60"
        title="kie.ai credits remaining — click to refresh"
      >
        <Coins className={`h-5 w-5 shrink-0 text-zinc-300 ${refreshing ? 'animate-pulse' : ''}`} strokeWidth={1.75} />
        <span className="text-center text-[10px] leading-tight tabular-nums text-zinc-300">{label}</span>
      </button>
    )
  }

  return (
    <div
      className="flex w-full items-center gap-3 rounded-full px-3 py-2"
      title="kie.ai credits remaining"
    >
      <Coins className="h-5 w-5 shrink-0 text-zinc-300" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
        <span className="tabular-nums">{label}</span>
        <span className="text-zinc-500"> credits</span>
      </span>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200 disabled:opacity-50"
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
          active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
        }`}
      >
        <Icon
          className="h-5 w-5 shrink-0"
          style={{ color: active ? '#fafafa' : undefined }}
          strokeWidth={active ? 2 : 1.75}
        />
        <span
          className={`text-center text-[10px] leading-tight ${
            active ? 'font-medium text-white' : 'font-normal text-zinc-300'
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
        active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <Icon
        className="h-5 w-5 shrink-0"
        style={{ color: active ? '#fafafa' : undefined }}
        strokeWidth={active ? 2 : 1.75}
      />
      <span
        className={`truncate text-sm ${
          active ? 'font-medium text-white' : 'font-normal text-zinc-300'
        }`}
      >
        {app.name}
      </span>
    </button>
  )
}
