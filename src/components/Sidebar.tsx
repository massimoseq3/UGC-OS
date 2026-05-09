import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { APP_REGISTRY, CATEGORY_LABELS, type AppCategory, type AppConfig } from '../utils/constants'
import SettingsModal from './SettingsModal'
import UserMenu from './auth/UserMenu'

const SECTION_ORDER: AppCategory[] = ['library', 'create', 'tools', 'admin']

export default function Sidebar() {
  const activeApp = useAppStore((s) => s.activeApp)
  const openApp = useAppStore((s) => s.openApp)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const isSignedIn = useAuthStore((s) => !!s.profile)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const sections = SECTION_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    apps: APP_REGISTRY.filter((app) => app.category === category),
  }))
    .map((s) => s.category === 'admin' && !isAdmin ? { ...s, apps: [] } : s)
    .filter((s) => s.apps.length > 0)

  return (
    <>
      <aside
        className={`fixed left-0 top-14 bottom-0 z-40 flex flex-col border-r border-white/5 bg-[#09090b] transition-[width] duration-200 ease-out ${
          collapsed ? 'w-20' : 'w-56'
        }`}
      >
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, i) => (
            <div key={section.category}>
              {i > 0 && <div className="mx-1 my-3 border-t border-white/5" />}
              {!collapsed && (
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
                    collapsed={collapsed}
                    onClick={() => openApp(app.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-white/5 px-2 py-3">
          <SidebarRow
            app={{ id: 'settings', name: 'Settings', icon: Settings, accent: '#a1a1aa', category: 'tools' }}
            active={false}
            collapsed={collapsed}
            onClick={() => setSettingsOpen(true)}
          />
          {isSignedIn && <UserMenu collapsed={collapsed} />}
        </div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
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
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors ${
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
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
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
