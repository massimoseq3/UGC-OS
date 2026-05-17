import { useMemo, useState, useEffect } from 'react'
import {
  Sparkles, Loader2, Download, Trash2, Save, Check, Film, Image as ImageIcon,
  Music as MusicIcon, Play, X,
} from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { useAppStore } from '../../../stores/appStore'
import { getUrl } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import type { ImageHistoryItem, VideoHistoryItem, MusicHistoryItem } from '../../../stores/types'
import AudioTile from './AudioTile'
import GenerationProgress from '../../../components/GenerationProgress'
import type { PlaygroundMode, InFlightGen } from '../types'
export type { InFlightGen }

// A single unified history entry. Image/Video/Music streams flow into this
// shape so day-bucketing + masonry can stay one code path.
type HistoryEntry =
  | { kind: 'image'; createdAt: number; data: ImageHistoryItem }
  | { kind: 'video'; createdAt: number; data: VideoHistoryItem }
  | { kind: 'music'; createdAt: number; data: MusicHistoryItem }

interface PlaygroundHistoryGridProps {
  inFlight: InFlightGen[]
  // Active mode filter — null shows everything.
  filterMode: PlaygroundMode | null
}

const HEADS_UP_DISMISSED_KEY = 'playground:heads-up-dismissed'

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

export default function PlaygroundHistoryGrid({ inFlight, filterMode }: PlaygroundHistoryGridProps) {
  const imageHistory = useBankStore((s) => s.imageHistory)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const musicHistory = useBankStore((s) => s.musicHistory)
  const deleteImageHistory = useBankStore((s) => s.deleteImageHistory)
  const deleteVideoHistory = useBankStore((s) => s.deleteVideoHistory)
  const deleteMusicHistory = useBankStore((s) => s.deleteMusicHistory)
  const updateImageHistory = useBankStore((s) => s.updateImageHistory)
  const updateVideoHistory = useBankStore((s) => s.updateVideoHistory)
  const addBRoll = useBankStore((s) => s.addBRoll)
  const updateBRoll = useBankStore((s) => s.updateBRoll)
  const getBRollById = useBankStore((s) => s.getBRollById)
  const addToast = useAppStore((s) => s.addToast)

  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)

  // Dismissible 14-day-retention banner — choice persists across reloads.
  const [headsUpDismissed, setHeadsUpDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(HEADS_UP_DISMISSED_KEY) === '1' } catch { return false }
  })
  const dismissHeadsUp = () => {
    setHeadsUpDismissed(true)
    try { localStorage.setItem(HEADS_UP_DISMISSED_KEY, '1') } catch { /* ignore */ }
  }

  const entries = useMemo<HistoryEntry[]>(() => {
    const out: HistoryEntry[] = []
    for (const i of imageHistory) out.push({ kind: 'image', createdAt: i.createdAt, data: i })
    for (const v of videoHistory) out.push({ kind: 'video', createdAt: v.createdAt, data: v })
    for (const m of musicHistory) out.push({ kind: 'music', createdAt: m.createdAt, data: m })
    out.sort((a, b) => b.createdAt - a.createdAt)
    if (filterMode) return out.filter((e) => e.kind === filterMode)
    return out
  }, [imageHistory, videoHistory, musicHistory, filterMode])

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

  // Save an image-history entry to the B-Rolls bank. Tracks in-flight ids so
  // the user can't double-tap into duplicate BRolls.
  async function handleSaveImage(item: ImageHistoryItem) {
    if (item.linkedBRollId || savingIds.has(item.id)) return
    setSavingIds((prev) => new Set(prev).add(item.id))
    try {
      const id = await addBRoll({ imageUrl: item.imageUrl, prompt: item.prompt })
      await updateImageHistory(item.id, { linkedBRollId: id })
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSavingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  // Save a video-history entry to the B-Rolls bank. Mirrors VideoStudio's
  // save logic — if the generation tracked a sourceBRollId, append the
  // video to that record; otherwise create a fresh video-only BRoll.
  async function handleSaveVideo(item: VideoHistoryItem) {
    if (item.linkedBRollId || savingIds.has(item.id)) return
    setSavingIds((prev) => new Set(prev).add(item.id))
    try {
      const newVideo = { url: item.videoUrl, aspectRatio: item.aspectRatio, createdAt: item.createdAt }
      if (item.sourceBRollId) {
        const existing = getBRollById(item.sourceBRollId)
        if (existing) {
          await updateBRoll(item.sourceBRollId, { videos: [...(existing.videos ?? []), newVideo] })
          await updateVideoHistory(item.id, { linkedBRollId: item.sourceBRollId })
          return
        }
      }
      const newId = await addBRoll({ imageUrl: '', prompt: item.prompt, videos: [newVideo] })
      await updateVideoHistory(item.id, { linkedBRollId: newId })
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSavingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  if (entries.length === 0 && visibleInFlight.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {!headsUpDismissed && <HeadsUpBanner onDismiss={dismissHeadsUp} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Sparkles className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-500">No generations yet</p>
          <p className="max-w-[300px] text-xs leading-relaxed text-zinc-600">
            Pick a preset or type a prompt below and hit Generate.
            Everything you make lands here, sorted by day.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {!headsUpDismissed && <HeadsUpBanner onDismiss={dismissHeadsUp} />}

      <div className="flex-1 overflow-y-auto px-4 py-3">
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
                    <ImageTile
                      item={entry.data}
                      isSaving={savingIds.has(entry.data.id)}
                      onClick={() => setPreviewItem(entry)}
                      onSave={() => handleSaveImage(entry.data)}
                      onDelete={() => deleteImageHistory(entry.data.id)}
                    />
                  )}
                  {entry.kind === 'video' && (
                    <VideoTile
                      item={entry.data}
                      isSaving={savingIds.has(entry.data.id)}
                      onClick={() => setPreviewItem(entry)}
                      onSave={() => handleSaveVideo(entry.data)}
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

      {previewItem && (
        <PreviewModal entry={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  )
}

// ── Heads-up banner ─────────────────────────────────────────────

function HeadsUpBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
      <p className="flex-1 text-[11px] leading-relaxed text-amber-300/80">
        <span className="font-semibold">Heads up</span> — kie.ai retains generated media for 14
        days. Save anything you want to keep to the B-Rolls Bank or download it, or it may be
        deleted.
      </p>
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-amber-300/60 transition-colors hover:bg-amber-500/15 hover:text-amber-200"
      >
        <X className="h-3 w-3" />
      </button>
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

// ── Image tile ──────────────────────────────────────────────────

function ImageTile({
  item,
  isSaving,
  onClick,
  onSave,
  onDelete,
}: {
  item: ImageHistoryItem
  isSaving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const { url, status } = useAssetUrlState(item.imageUrl)
  const isSaved = !!item.linkedBRollId

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-black transition-colors hover:border-white/20"
    >
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
          title={isSaved ? 'Saved to B-Rolls' : isSaving ? 'Saving…' : 'Save to B-Rolls Bank'}
          tone={isSaved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!isSaved && !isSaving) onSave() }}
        >
          {isSaved ? <Check className="h-3 w-3" /> : isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        </TileButton>
        <TileButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(item.imageUrl)
            if (u) downloadFile(u, `playground-${item.id}.png`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton
          title="Delete"
          tone="danger"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>
    </div>
  )
}

// ── Video tile ──────────────────────────────────────────────────

function VideoTile({
  item,
  isSaving,
  onClick,
  onSave,
  onDelete,
}: {
  item: VideoHistoryItem
  isSaving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const { url, status } = useAssetUrlState(item.videoUrl)
  const [hovering, setHovering] = useState(false)
  const ratio = aspectStyle(item.aspectRatio)
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId
  const isSaved = !!item.linkedBRollId

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-black transition-colors hover:border-white/20"
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
          title={isSaved ? 'Saved to B-Rolls' : isSaving ? 'Saving…' : 'Save to B-Rolls Bank'}
          tone={isSaved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!isSaved && !isSaving) onSave() }}
        >
          {isSaved ? <Check className="h-3 w-3" /> : isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        </TileButton>
        <TileButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(item.videoUrl)
            if (u) downloadFile(u, `playground-${item.id}.mp4`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton title="Delete" tone="danger" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>
    </div>
  )
}

// ── In-flight tile ──────────────────────────────────────────────

function InFlightTile({ gen }: { gen: InFlightGen }) {
  const modelLabel = getModel(gen.modelId)?.displayName ?? gen.modelId

  const Icon =
    gen.mode === 'image' ? ImageIcon
    : gen.mode === 'video' ? Film
    : MusicIcon

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-green-500/30 bg-gradient-to-br from-green-500/[0.08] to-zinc-950">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-green-500/10 via-transparent to-green-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-green-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-green-100 backdrop-blur">
        {gen.mode}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Icon className="h-5 w-5 text-green-300" />
        <p className="text-[10px] font-medium text-green-100">{modelLabel}</p>
        <GenerationProgress
          isActive
          color="bg-green-500"
          showHelper={false}
          messages={
            gen.mode === 'image'
              ? [
                  'Sending request...',
                  'Composing the scene...',
                  'Rendering details...',
                  'Finalizing the frame...',
                ]
              : gen.mode === 'video'
              ? [
                  'Sending request...',
                  'Storyboarding frames...',
                  'Rendering motion...',
                  'Finalizing the clip...',
                ]
              : [
                  'Sending request...',
                  'Composing the melody...',
                  'Mixing the track...',
                  'Mastering the audio...',
                ]
          }
          className="max-w-[180px]"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{gen.prompt}</p>
      </div>
    </div>
  )
}

// ── Preview modal ───────────────────────────────────────────────

// Centered lightbox for the clicked tile. Esc + click-the-backdrop closes.
function PreviewModal({ entry, onClose }: { entry: HistoryEntry; onClose: () => void }) {
  const imageUrl = useAssetUrl(entry.kind === 'image' ? entry.data.imageUrl : null)
  const videoUrl = useAssetUrl(entry.kind === 'video' ? entry.data.videoUrl : null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The bar is glassmorphic + lives in the playground tree, but the modal
  // needs to overlay EVERYTHING — including the prompt bar. We use `fixed`
  // at the top of the stack with z-[60]. A scrim above the prompt bar
  // (z-50) is enough since the bar isn't capturing pointer events outside
  // its `pointer-events-auto` inner div.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        title="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:bg-black/60"
      >
        <X className="h-4 w-4" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
      >
        {entry.kind === 'image' && imageUrl && (
          <img src={imageUrl} alt="" className="max-h-[80vh] max-w-[90vw] rounded-xl border border-white/10 object-contain" />
        )}
        {entry.kind === 'video' && videoUrl && (
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="max-h-[80vh] max-w-[90vw] rounded-xl border border-white/10"
          />
        )}
        <p className="max-w-2xl text-center text-[12px] leading-relaxed text-zinc-400">
          {entry.kind === 'image' ? entry.data.prompt : entry.kind === 'video' ? entry.data.prompt : ''}
        </p>
      </div>
    </div>
  )
}

// ── Shared bits ─────────────────────────────────────────────────

function TileButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'saved' | 'danger'
}) {
  const toneClass = tone === 'saved'
    ? 'bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/40'
    : tone === 'danger'
    ? 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
    : 'bg-black/60 text-zinc-200 hover:bg-black/80'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
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
