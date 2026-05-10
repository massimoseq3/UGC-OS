import { useEffect, useState } from 'react'
import { Menu, Coins, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditsStore } from '../stores/creditsStore'
import ProjectSwitcher from './ProjectSwitcher'

export default function MenuBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const apiKey = useSettingsStore((s) => s.kieApiKey)
  const balance = useCreditsStore((s) => s.balance)
  const refresh = useCreditsStore((s) => s.refresh)
  const [refreshing, setRefreshing] = useState(false)

  // Refresh on mount + whenever the API key changes.
  useEffect(() => {
    if (apiKey) refresh()
  }, [apiKey, refresh])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-3 border-b border-white/5 bg-[#09090b] px-3 select-none">
      <button
        onClick={toggleSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.06]"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      <span className="text-[19px] font-bold tracking-tight text-zinc-100">
        UGC Lab
      </span>

      <div className="flex-1" />

      <ProjectSwitcher />

      {/* Credits chip — only visible once an API key is configured.
          Locked to h-9 so it matches the ProjectSwitcher chip exactly. */}
      {apiKey && (
        <div
          className="flex h-9 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-1.5 text-xs font-medium text-zinc-200"
          title="kie.ai credits remaining"
        >
          <Coins className="mr-0.5 h-3.5 w-3.5 text-zinc-400" />
          <span className="tabular-nums">
            {balance !== null ? balance.toLocaleString() : '—'}
          </span>
          <span className="text-zinc-500">credits left</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200 disabled:opacity-50"
            title="Refresh credits balance"
            aria-label="Refresh credits balance"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}
    </header>
  )
}
