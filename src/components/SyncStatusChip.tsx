import { useEffect, useRef, useState } from 'react'
import { Cloud, Loader2, AlertCircle } from 'lucide-react'
import { useSyncStore } from '../stores/syncStore'

// Tiny "Synced / Syncing / Error" chip in the menu bar. Click to expand a
// popover with the last error or the timestamp of the last successful sync.
export default function SyncStatusChip() {
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const lastError = useSyncStore((s) => s.lastError)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (status === 'disabled') return null

  const config = {
    starting:  { dot: 'bg-amber-400 animate-pulse', label: 'Connecting…', icon: Loader2,  iconClass: 'text-amber-300 animate-spin' },
    syncing:   { dot: 'bg-amber-400 animate-pulse', label: 'Syncing…',    icon: Loader2,  iconClass: 'text-amber-300 animate-spin' },
    synced:    { dot: 'bg-emerald-400',             label: 'Synced',      icon: Cloud,    iconClass: 'text-emerald-300' },
    error:     { dot: 'bg-red-500',                 label: 'Sync error',  icon: AlertCircle, iconClass: 'text-red-300' },
  }[status as 'starting' | 'syncing' | 'synced' | 'error']

  const Icon = config.icon

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={status === 'error' ? lastError ?? 'Sync error' : config.label}
        className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-2.5 pr-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.07]"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        <Icon className={`h-3.5 w-3.5 ${config.iconClass}`} strokeWidth={2} />
        <span className="text-zinc-300">{config.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-white/10 bg-[#0a0a0a] p-3 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            <span className="text-[12px] font-medium text-zinc-200">{config.label}</span>
          </div>
          <div className="pt-2">
            {status === 'error' && lastError ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Last error</div>
                <div className="break-words text-[11px] leading-snug text-red-300">{lastError}</div>
              </div>
            ) : status === 'synced' && lastSyncAt ? (
              <div className="text-[11px] text-zinc-500">
                Last sync {formatAgo(lastSyncAt)}
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500">
                {status === 'syncing' ? 'Pushing your changes to the cloud…' : 'Connecting to the cloud…'}
              </div>
            )}
            <div className="mt-2 text-[10px] leading-relaxed text-zinc-600">
              Your banks and assets sync to your account in real time. If something goes wrong, the badge turns red.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  return new Date(ts).toLocaleTimeString()
}

