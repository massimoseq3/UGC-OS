import { useAppStore } from '../stores/appStore'
import { DOCK_APPS } from '../utils/constants'

export default function Dock() {
  const activeApp = useAppStore((s) => s.activeApp)
  const runningApps = useAppStore((s) => s.runningApps)
  const openApp = useAppStore((s) => s.openApp)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center pb-0 lg:pb-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-0 lg:gap-1 w-full lg:w-auto rounded-none lg:rounded-2xl border-t lg:border border-white/10 bg-[#09090b]/90 lg:bg-white/[0.04] px-1 lg:px-2.5 py-1 lg:py-2 pb-[env(safe-area-inset-bottom)] lg:pb-2 backdrop-blur-2xl">
        {DOCK_APPS.map((app, i) => {
          const isActive = activeApp === app.id
          const isRunning = runningApps.includes(app.id)
          const Icon = app.icon
          const isFinder = i === 0
          const showSeparator = isFinder

          return (
            <div key={app.id} className="flex flex-1 lg:flex-initial items-center justify-center">
              <div className="group relative flex flex-col items-center">
                {/* Tooltip — desktop only */}
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-800/90 px-2.5 py-1 text-[11px] font-medium text-zinc-200 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 hidden lg:block">
                  {app.name}
                  <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-zinc-800/90" />
                </div>

                <button
                  onClick={() => openApp(app.id)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150 hover:bg-white/[0.06] active:bg-white/[0.1]"
                >
                  <Icon
                    className="h-5.5 w-5.5 transition-colors duration-150"
                    style={{
                      color: isActive ? app.accent : undefined,
                    }}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                </button>

                {/* Label — mobile only */}
                <span className="text-[9px] text-zinc-500 truncate max-w-[48px] lg:hidden">
                  {app.name.split(' ')[0]}
                </span>

                {/* Running / active dot — desktop only */}
                <div className="h-1 hidden lg:flex items-center justify-center">
                  {isRunning && (
                    <div
                      className={`h-1 w-1 rounded-full transition-all duration-200 ${
                        isActive ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  )}
                </div>
              </div>

              {/* Separator after Finder — desktop only */}
              {showSeparator && (
                <div className="mx-1.5 h-8 w-px bg-white/10 hidden lg:block" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
