import { useEffect, useState } from 'react'
import { FlaskConical, Settings, ChevronLeft } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getAppConfig } from '../utils/constants'
import SettingsModal from './SettingsModal'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function MenuBar() {
  const activeApp = useAppStore((s) => s.activeApp)
  const setActiveApp = useAppStore((s) => s.setActiveApp)
  const [time, setTime] = useState(() => formatTime(new Date()))
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 60_000)
    return () => clearInterval(id)
  }, [])

  const appConfig = activeApp ? getAppConfig(activeApp) : null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-12 lg:h-9 items-center justify-between border-b border-white/5 bg-[#09090b]/80 px-4 backdrop-blur-xl select-none">
        <button
          onClick={() => setActiveApp(null)}
          className="flex items-center gap-2 transition-colors hover:opacity-80"
        >
          {activeApp && (
            <ChevronLeft className="h-5 w-5 text-zinc-400 lg:hidden" />
          )}
          <FlaskConical className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[13px] font-semibold tracking-tight text-zinc-200">
            UGC Lab
          </span>
          {appConfig && (
            <>
              <span className="text-[13px] text-zinc-600 hidden sm:inline">/</span>
              <span className="text-[13px] font-medium tracking-tight text-zinc-400 hidden sm:inline">
                {appConfig.name}
              </span>
            </>
          )}
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-2 lg:p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <span className="text-[12px] font-light tracking-tight text-zinc-500 hidden sm:inline">
            {time}
          </span>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
