import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2 } from 'lucide-react'
import { isAssetRef } from '../utils/assetStore'
import * as uploadQueue from '../lib/uploadQueue'

type Status = uploadQueue.UploadStatus | 'unknown'

interface AssetSyncBadgeProps {
  // Any number of asset refs the card represents. The badge reflects the
  // worst status across all of them — failed > uploading/pending > uploaded.
  refs: Array<string | undefined | null>
  // Visual size. Cards typically use 'sm'; larger previews use 'md'.
  size?: 'sm' | 'md'
  // Optional override for positioning. Defaults to absolute top-right.
  className?: string
  // If true, hide entirely when everything is `uploaded` or `unknown`.
  // Defaults to true — we don't want a "synced" pill on every card forever.
  hideWhenSynced?: boolean
  // Tap behaviour for failed uploads — kicks a retry of all queue items.
  onRetry?: () => void
}

// Per-card cloud-sync indicator. Subscribes to the upload queue for the
// specific asset refs this card cares about, so it updates the moment the
// underlying state machine moves.
export default function AssetSyncBadge({
  refs,
  size = 'sm',
  className,
  hideWhenSynced = true,
  onRetry,
}: AssetSyncBadgeProps) {
  const assetIds = refs.filter((r): r is string => !!r && isAssetRef(r))
  const [status, setStatus] = useState<Status>('unknown')

  useEffect(() => {
    if (assetIds.length === 0) {
      setStatus('unknown')
      return
    }

    let cancelled = false
    const refresh = async () => {
      const statuses = await Promise.all(assetIds.map((id) => uploadQueue.getStatus(id)))
      if (cancelled) return
      setStatus(worstStatus(statuses))
    }
    refresh()

    const unsub = uploadQueue.subscribe((entry) => {
      if (assetIds.includes(entry.id)) refresh()
    })
    return () => { cancelled = true; unsub() }
    // assetIds is derived from refs each render. Use refs.join as a stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.join('|')])

  if (assetIds.length === 0) return null
  if (hideWhenSynced && (status === 'uploaded' || status === 'unknown')) return null

  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const icon = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  const pos = className ?? 'absolute right-1.5 top-1.5'

  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRetry?.(); if (!onRetry) uploadQueue.retryAll() }}
        title="Upload failed — click to retry"
        className={`${pos} flex ${dim} items-center justify-center rounded-full bg-red-500/80 text-white shadow ring-1 ring-red-300/40 transition-colors hover:bg-red-500`}
      >
        <CloudOff className={icon} />
      </button>
    )
  }

  if (status === 'uploading' || status === 'pending') {
    return (
      <span
        title="Uploading to cloud…"
        className={`${pos} flex ${dim} items-center justify-center rounded-full bg-amber-500/85 text-white shadow ring-1 ring-amber-300/40`}
      >
        <Loader2 className={`${icon} animate-spin`} />
      </span>
    )
  }

  // status === 'uploaded' AND hideWhenSynced is false
  return (
    <span
      title="Saved to cloud"
      className={`${pos} flex ${dim} items-center justify-center rounded-full bg-emerald-500/85 text-white shadow ring-1 ring-emerald-300/40`}
    >
      <Cloud className={icon} />
    </span>
  )
}

function worstStatus(statuses: Status[]): Status {
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('uploading')) return 'uploading'
  if (statuses.includes('pending')) return 'pending'
  if (statuses.every((s) => s === 'uploaded')) return 'uploaded'
  return 'unknown'
}
