import { useEffect, useRef, useState } from 'react'
import { useSyncStore, type SyncStatus } from '../stores/syncStore'

// How long a 'syncing' state must persist before we actually flip the chip
// to amber. Anything faster than this stays green — fast round trips feel
// instant instead of flashing amber for 200ms.
const SYNCING_VISIBLE_AFTER_MS = 600

export default function SyncStatusChip() {
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const lastError = useSyncStore((s) => s.lastError)
  const [open, setOpen] = useState(false)
  // Effective status: same as `status` except 'syncing' is delayed.
  const [effective, setEffective] = useState<SyncStatus>(status)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status !== 'syncing') {
      setEffective(status)
      return
    }
    const t = window.setTimeout(() => setEffective('syncing'), SYNCING_VISIBLE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [status])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (effective === 'disabled') return null

  const config = {
    starting:  { dot: 'bg-amber-400 animate-pulse', label: 'Connecting…' },
    syncing:   { dot: 'bg-amber-400 animate-pulse', label: 'Syncing…' },
    synced:    { dot: 'bg-emerald-400',             label: 'Synced' },
    error:     { dot: 'bg-red-500',                 label: 'Sync error' },
  }[effective as 'starting' | 'syncing' | 'synced' | 'error']

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={status === 'error' ? lastError ?? 'Sync error' : config.label}
        className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.07]"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        <span>{config.label}</span>
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

