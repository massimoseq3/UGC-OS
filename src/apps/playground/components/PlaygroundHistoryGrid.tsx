import { useMemo, useState, useEffect } from 'react'
import { Sparkles, Loader2, Download, Trash2, Film, Image as ImageIcon, Music as MusicIcon, Play } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrlState } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import type { BRoll, VideoHistoryItem, MusicHistoryItem } from '../../../stores/types'
import AudioTile from './AudioTile'
import type { PlaygroundMode } from '../types'

// A single unified history entry. Image/Video/Music streams flow into this
// shape so day-bucketing + masonry can stay one code path.
type HistoryEntry =
  | { kind: 'image'; createdAt: number; data: BRoll }
  | { kind: 'video'; createdAt: number; data: VideoHistoryItem }
  | { kind: 'music'; createdAt: number; data: MusicHistoryItem }

export interface InFlightGen {
  id: string
  mode: PlaygroundMode
  modelId: string
  prompt: string
  startedAt: number
}

interface PlaygroundHistoryGridProps {
  inFlight: InFlightGen[]
  // Active mode filter — null shows everything.
  filterMode: PlaygroundMode | null
  // Add bottom padding so content scrolls under a floating overlay (the
  // glassmorphism prompt bar). Tuned to ~bar height + a comfortable margin.
  bottomPadding?: boolean
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(dayTs: number): string {
  const today = startOfDay(Date.now())
  const yesterday = today - 86_400_000
  if (dayTs === today) return 'Today'
  if (dayTs === yesterday) return 'Yesterday'
  return new Date(dayTs).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function PlaygroundHistoryGrid({ inFlight, filterMode, bottomPadding }: PlaygroundHistoryGridProps) {
  const brolls = useBankStore((s) => s.brolls)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const musicHistory = useBankStore((s) => s.musicHistory)
  const deleteBRoll = useBankStore((s) => s.deleteBRoll)
  const deleteVideoHistory = useBankStore((s) => s.deleteVideoHistory)
  const deleteMusicHistory = useBankStore((s) => s.deleteMusicHistory)

  const entries = useMemo<HistoryEntry[]>(() => {
    const out: HistoryEntry[] = []
    // Only show brolls created from Playground — gate by the new
    // Playground convention: empty productId/modelId/scriptId AND no
    // videos[] (video-only b-rolls come from video-studio). Brolls created
    // here are tagged via a sentinel `prompt` prefix... actually, simpler:
    // playground-created b-rolls have no productId/modelId/scriptId AND
    // they're newly-added in this session. To keep it simple, we surface
    // ALL b-rolls without those linkages — playground-only by convention.
    for (const b of brolls) {
      if (b.productId || b.modelId || b.scriptId) continue
      if (b.videos && b.videos.length > 0) continue // video-only b-roll from video-studio "save"
      if (!b.imageUrl) continue
      out.push({ kind: 'image', createdAt: b.createdAt, data: b })
    }
    for (const v of videoHistory) {
      out.push({ kind: 'video', createdAt: v.createdAt, data: v })
    }
    for (const m of musicHistory) {
      out.push({ kind: 'music', createdAt: m.createdAt, data: m })
    }
    out.sort((a, b) => b.createdAt - a.createdAt)
    if (filterMode) return out.filter((e) => e.kind === filterMode)
    return out
  }, [brolls, videoHistory, musicHistory, filterMode])

  const dayGroups = useMemo(() => {
    const map = new Map<number, HistoryEntry[]>()
    for (const e of entries) {
      const day = startOfDay(e.createdAt)
      const arr = map.get(day) ?? []
      arr.push(e)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [entries])

  const visibleInFlight = filterMode ? inFlight.filter((g) => g.mode === filterMode) : inFlight

  if (entries.length === 0 && visibleInFlight.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Sparkles className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">No generations yet</p>
        <p className="max-w-[300px] text-xs leading-relaxed text-zinc-600">
          Pick a preset or type a prompt below and hit Generate.
          Everything you make lands here, sorted by day.
        </p>
      </div>
    )
  }

  return (
    <div className={`h-full overflow-y-auto px-4 py-3 ${bottomPadding ? 'pb-64' : ''}`}>
      {visibleInFlight.length > 0 && (
        <>
          <DayPill label="In progress" />
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [column-fill:_balance]">
            {visibleInFlight.map((gen) => (
              <div key={gen.id} className="mb-2 break-inside-avoid">
                <InFlightTile gen={gen} />
              </div>
            ))}
          </div>
        </>
      )}

      {dayGroups.map(([dayTs, dayItems]) => (
        <div key={dayTs}>
          <DayPill label={dayLabel(dayTs)} />
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [column-fill:_balance]">
            {dayItems.map((entry) => (
              <div key={`${entry.kind}-${entry.data.id}`} className="mb-2 break-inside-avoid">
                {entry.kind === 'image' && (
                  <ImageTile item={entry.data} onDelete={() => deleteBRoll(entry.data.id)} />
                )}
                {entry.kind === 'video' && (
                  <VideoTile
                    item={entry.data}
                    onDelete={() => deleteVideoHistory(entry.data.id)}
                  />
                )}
                {entry.kind === 'music' && (
                  <AudioTile
                    item={entry.data}
                    onDownload={async () => {
                      const url = await getUrl(entry.data.audioRef)
                      if (url) downloadFile(url, `playground-${entry.data.id}.mp3`)
                    }}
                    onDelete={() => deleteMusicHistory(entry.data.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DayPill({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-zinc-300">{label}</span>
    </div>
  )
}

function ImageTile({ item, onDelete }: { item: BRoll; onDelete: () => void }) {
  const { url, status } = useAssetUrlState(item.imageUrl)
  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-black">
      {status === 'ready' && url ? (
        <img src={url} alt="" className="block h-auto w-full" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center">
          {status === 'loading'
            ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            : <ImageIcon className="h-6 w-6 text-zinc-700" />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{item.prompt}</p>
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileButton
          title="Download"
          onClick={async () => {
            const u = await getUrl(item.imageUrl)
            if (u) downloadFile(u, `playground-${item.id}.png`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton title="Delete" tone="danger" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>
    </div>
  )
}

function VideoTile({ item, onDelete }: { item: VideoHistoryItem; onDelete: () => void }) {
  const { url, status } = useAssetUrlState(item.videoUrl)
  const [hovering, setHovering] = useState(false)
  const ratio = aspectStyle(item.aspectRatio)
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-black"
      style={ratio}
    >
      {status === 'ready' && url ? (
        <video
          src={url}
          muted
          loop
          playsInline
          autoPlay={hovering}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {status === 'loading'
            ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            : <Film className="h-6 w-6 text-zinc-700" />}
        </div>
      )}

      {!hovering && url && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
          <Play className="h-3 w-3 fill-white text-white" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-1 text-[10px] font-medium text-zinc-200">{modelLabel}</p>
        <p className="line-clamp-1 text-[10px] text-zinc-400">{item.prompt}</p>
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileButton
          title="Download"
          onClick={async () => {
            const u = await getUrl(item.videoUrl)
            if (u) downloadFile(u, `playground-${item.id}.mp4`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton title="Delete" tone="danger" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>
    </div>
  )
}

function InFlightTile({ gen }: { gen: InFlightGen }) {
  const modelLabel = getModel(gen.modelId)?.displayName ?? gen.modelId
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - gen.startedAt) / 1000))
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - gen.startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [gen.startedAt])

  const Icon =
    gen.mode === 'image' ? ImageIcon
    : gen.mode === 'video' ? Film
    : MusicIcon

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-yellow-500/30 bg-gradient-to-br from-yellow-500/[0.08] to-zinc-950">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-yellow-500/10 via-transparent to-yellow-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-yellow-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-yellow-100 backdrop-blur">
        {gen.mode}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
        <Icon className="h-5 w-5 text-yellow-300" />
        <Loader2 className="h-4 w-4 animate-spin text-yellow-300" />
        <p className="text-[10px] font-medium text-yellow-100">{modelLabel}</p>
        <p className="text-[10px] tabular-nums text-yellow-300/80">{formatElapsed(elapsed)}</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{gen.prompt}</p>
      </div>
    </div>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TileButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'danger'
}) {
  const toneClass = tone === 'danger'
    ? 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
    : 'bg-black/60 text-zinc-200 hover:bg-black/80'
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className={`flex h-6 w-6 items-center justify-center rounded-md backdrop-blur transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}

function aspectStyle(ar: string): React.CSSProperties {
  const [w, h] = ar.split(':').map(Number)
  if (!w || !h) return { aspectRatio: '9 / 16' }
  return { aspectRatio: `${w} / ${h}` }
}

async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
