import { useEffect, useRef, useState } from 'react'
import { useSyncStore, type SyncStatus } from '../stores/syncStore'
import * as uploadQueue from '../lib/uploadQueue'

const MAX_ERROR_CHARS = 240

// How long a 'syncing' state must persist before we actually flip the chip
// to amber. Anything faster than this stays green — fast round trips feel
// instant instead of flashing amber for 200ms.
const SYNCING_VISIBLE_AFTER_MS = 600

export default function SyncStatusChip() {
  const status = useSyncStore((s) => s.status)
  const pendingPushes = useSyncStore((s) => s.pendingPushes)
  const pendingUploads = useSyncStore((s) => s.pendingUploads)
  const failedUploads = useSyncStore((s) => s.failedUploads)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const lastError = useSyncStore((s) => s.lastError)
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [failureDetail, setFailureDetail] = useState<string | null>(null)
  // Effective status: same as `status` except 'syncing' is delayed.
  const [effective, setEffective] = useState<SyncStatus>(status)
  const ref = useRef<HTMLDivElement>(null)

  const hasUploads = pendingUploads > 0
  const hasPushes = pendingPushes > 0
  const hasFailures = failedUploads > 0

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

  // Pull the most recent failed entry's lastError when the popover opens, so
  // the user can see *why* uploads failed without digging through DevTools.
  // Re-fetched on every open so retries that re-fail produce fresh detail.
  useEffect(() => {
    if (!open || !hasFailures) { setFailureDetail(null); return }
    let cancelled = false
    uploadQueue.failedEntries().then((entries) => {
      if (cancelled) return
      const newest = entries
        .filter((e) => e.lastError)
        .sort((a, b) => b.addedAt - a.addedAt)[0]
      const msg = newest?.lastError ?? null
      setFailureDetail(msg && msg.length > MAX_ERROR_CHARS ? `${msg.slice(0, MAX_ERROR_CHARS)}…` : msg)
    }).catch(() => { if (!cancelled) setFailureDetail(null) })
    return () => { cancelled = true }
  }, [open, hasFailures, failedUploads])

  if (effective === 'disabled') return null

  // Decide what to show. Failures take precedence (they're actionable);
  // uploads come next (slow + visible); pushes happen too fast to perceive.
  let dot: string
  let label: string
  if (hasFailures) {
    dot = 'bg-red-500'
    label = failedUploads === 1 ? '1 upload failed' : `${failedUploads} uploads failed`
  } else if (status === 'error') {
    dot = 'bg-red-500'
    label = 'Sync error'
  } else if (hasUploads) {
    dot = 'bg-amber-400 animate-pulse'
    label = pendingUploads === 1 ? 'Uploading 1 file…' : `Uploading ${pendingUploads} files…`
  } else if (effective === 'starting') {
    dot = 'bg-amber-400 animate-pulse'
    label = 'Connecting…'
  } else if (effective === 'syncing') {
    dot = 'bg-amber-400 animate-pulse'
    label = 'Syncing…'
  } else {
    dot = 'bg-emerald-400'
    label = 'Synced'
  }

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await uploadQueue.retryAll()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={hasFailures ? `${failedUploads} upload${failedUploads === 1 ? '' : 's'} failed — click to retry` : (status === 'error' ? lastError ?? 'Sync error' : label)}
        className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.07]"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-white/10 bg-[#0a0a0a] p-3 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <span className="text-[12px] font-medium text-zinc-200">{label}</span>
          </div>
          <div className="space-y-1.5 pt-2 text-[11px] text-zinc-500">
            {hasFailures && (
              <div className="space-y-2">
                <div className="text-red-300">
                  {failedUploads === 1 ? 'An asset upload' : `${failedUploads} asset uploads`} couldn't reach the cloud after several retries.
                  Your files are still saved locally — click below to try again.
                </div>
                {failureDetail && (
                  <details className="group rounded-md border border-red-500/20 bg-red-500/[0.06] px-2 py-1.5">
                    <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-red-300/80 outline-none transition-colors hover:text-red-200">
                      Show error detail
                    </summary>
                    <div className="mt-1.5 break-words font-mono text-[10px] leading-relaxed text-red-200/90">
                      {failureDetail}
                    </div>
                  </details>
                )}
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="w-full rounded-md bg-red-500/15 px-2 py-1.5 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry all uploads'}
                </button>
              </div>
            )}
            {hasUploads && !hasFailures && (
              <div>{pendingUploads} {pendingUploads === 1 ? 'file is' : 'files are'} uploading. Don’t close this tab.</div>
            )}
            {hasPushes && !hasUploads && !hasFailures && (
              <div>Saving your latest changes to the cloud…</div>
            )}
            {status === 'error' && !hasFailures && lastError && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Last error</div>
                <div className="break-words text-red-300">{lastError}</div>
              </div>
            )}
            {!hasUploads && !hasPushes && !hasFailures && status === 'synced' && lastSyncAt && (
              <div>Last sync {formatAgo(lastSyncAt)}</div>
            )}
            {!hasUploads && !hasPushes && status === 'starting' && (
              <div>Connecting to the cloud…</div>
            )}
            <div className="pt-1.5 text-[10px] leading-relaxed text-zinc-600">
              Your banks and assets sync to your account automatically. We’ll warn you before refresh if anything is still in flight.
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
