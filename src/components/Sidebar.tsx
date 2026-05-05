import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { APP_REGISTRY } from '../utils/constants'
import SettingsModal from './SettingsModal'

export default function Sidebar() {
  const activeApp = useAppStore((s) => s.activeApp)
  const openApp = useAppStore((s) => s.openApp)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const finder = APP_REGISTRY[0]
  const apps = APP_REGISTRY.slice(1)

  return (
    <>
      <aside
        className={`fixed left-0 top-14 bottom-0 z-40 flex flex-col border-r border-white/5 bg-[#09090b]/80 backdrop-blur-xl transition-[width] duration-200 ease-out ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarRow
            app={finder}
            active={activeApp === finder.id}
            collapsed={collapsed}
            onClick={() => openApp(finder.id)}
          />

          <div className="my-3 mx-3 border-t border-white/5" />

          {!collapsed && (
            <div className="px-5 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Apps
            </div>
          )}

          {apps.map((app) => (
            <SidebarRow
              key={app.id}
              app={app}
              active={activeApp === app.id}
              collapsed={collapsed}
              onClick={() => openApp(app.id)}
            />
          ))}
        </div>

        <div className="border-t border-white/5 py-3">
          <SidebarRow
            app={{ id: 'settings', name: 'Settings', icon: Settings, accent: '#a1a1aa' }}
            active={false}
            collapsed={collapsed}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

interface SidebarRowProps {
  app: { id: string; name: string; icon: React.ElementType; accent: string }
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function SidebarRow({ app, active, collapsed, onClick }: SidebarRowProps) {
  const Icon = app.icon

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 px-3 py-2.5 mx-0 transition-colors ${
        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon
        className="h-5 w-5 shrink-0 transition-colors"
        style={{ color: active ? app.accent : undefined }}
        strokeWidth={active ? 2 : 1.5}
      />
      {!collapsed && (
        <span
          className={`truncate text-[13px] tracking-tight ${
            active ? 'font-medium text-white' : 'text-zinc-400'
          }`}
        >
          {app.name}
        </span>
      )}

      {collapsed && (
        <div className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-zinc-200 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100">
          {app.name}
        </div>
      )}
    </button>
  )
}
