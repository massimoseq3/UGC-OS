import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Download,
  Trash2,
  Bookmark,
  Check,
  Film,
  Image as ImageIcon,
  Play,
  X,
  Sparkles,
} from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { useAppStore } from '../../../stores/appStore'
import { getUrl } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import type { BRoll, VideoHistoryItem } from '../../../stores/types'
import type { CardState } from '../types'
import GenerationProgress from '../../../components/GenerationProgress'

// One day in ms, used to bucket entries into Today / Yesterday / dated groups.
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

// A single entry in the unified history view. Each tile renders one of these.
type Entry =
  | { kind: 'broll-image'; id: string; createdAt: number; data: BRoll }
  | { kind: 'video'; id: string; createdAt: number; data: VideoHistoryItem }
  | { kind: 'in-flight-image'; id: string; createdAt: number; cardKey: string; prompt: string }
  | { kind: 'in-flight-video'; id: string; createdAt: number; cardKey: string; prompt: string; mode?: string }

interface GalleryViewProps {
  cardStates: Record<string, CardState>
}

export default function GalleryView({ cardStates }: GalleryViewProps) {
  const brolls = useBankStore((s) => s.brolls)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const deleteVideoHistory = useBankStore((s) => s.deleteVideoHistory)
  const updateVideoHistory = useBankStore((s) => s.updateVideoHistory)
  const deleteBRoll = useBankStore((s) => s.deleteBRoll)
  const addBRoll = useBankStore((s) => s.addBRoll)
  const updateBRoll = useBankStore((s) => s.updateBRoll)
  const getBRollById = useBankStore((s) => s.getBRollById)
  const addToast = useAppStore((s) => s.addToast)
  const activeProjectId = useSettingsStore((s) => s.activeProjectId)

  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [previewEntry, setPreviewEntry] = useState<Entry | null>(null)

  // Build the per-project filtered + sorted entry list. Saved brolls supply
  // the persistent image stream; videoHistory supplies the video stream.
  // Skipping videoHistory items linked to a broll dedupes when we later
  // surface broll videos[] (currently we don't show them as separate tiles).
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []

    // In-flight tiles first — these are ephemeral per session.
    for (const [cardKey, card] of Object.entries(cardStates)) {
      if (card.isGeneratingImage) {
        out.push({
          kind: 'in-flight-image',
          id: `inflight-img-${cardKey}`,
          createdAt: card.pendingStartedAt ?? Date.now(),
          cardKey,
          prompt: card.editablePrompt,
        })
      }
      if (card.videoStatus === 'generating') {
        out.push({
          kind: 'in-flight-video',
          id: `inflight-vid-${cardKey}`,
          createdAt: card.videoStartedAt ?? Date.now(),
          cardKey,
          prompt: card.videoPrompt ?? card.editablePrompt,
          mode: card.videoMode ?? undefined,
        })
      }
    }

    // Saved brolls — project-filtered + B-Roll-tab origin only. Legacy
    // entries without `sourceApp` are treated as Playground-origin so they
    // don't pollute this view; new B-Roll saves stamp 'broll-studio'.
    for (const b of brolls) {
      if (activeProjectId && !b.projectIds?.includes(activeProjectId)) continue
      if (b.sourceApp !== 'broll-studio') continue
      if (!b.imageUrl) continue
      out.push({ kind: 'broll-image', id: `broll-${b.id}`, createdAt: b.createdAt, data: b })
    }

    // Video history — project-filtered + B-Roll-tab origin only. Playground
    // video gens are excluded.
    for (const v of videoHistory) {
      if (activeProjectId && !v.projectIds?.includes(activeProjectId)) continue
      if (v.sourceApp !== 'broll-studio') continue
      out.push({ kind: 'video', id: `video-${v.id}`, createdAt: v.createdAt, data: v })
    }

    return out.sort((a, b) => b.createdAt - a.createdAt)
  }, [brolls, videoHistory, cardStates, activeProjectId])

  const inFlight = useMemo(() => entries.filter((e) => e.kind === 'in-flight-image' || e.kind === 'in-flight-video'), [entries])
  const finished = useMemo(() => entries.filter((e) => e.kind !== 'in-flight-image' && e.kind !== 'in-flight-video'), [entries])

  const dayGroups = useMemo(() => {
    const map = new Map<number, Entry[]>()
    for (const e of finished) {
      const day = startOfDay(e.createdAt)
      const arr = map.get(day) ?? []
      arr.push(e)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [finished])

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
      setSavingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Sparkles className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">No generations yet</p>
        <p className="max-w-[320px] text-xs leading-relaxed text-zinc-600">
          Every image and video you make in this project lands here, sorted by day.
          Switch to the Scenes tab to generate.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {inFlight.length > 0 && (
        <>
          <DayPill label="In progress" />
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [column-fill:_balance]">
            {inFlight.map((entry) => (
              <div key={entry.id} className="mb-2 break-inside-avoid">
                <InFlightTile entry={entry} />
              </div>
            ))}
          </div>
        </>
      )}

      {dayGroups.map(([dayTs, items]) => (
        <div key={dayTs}>
          <DayPill label={dayLabel(dayTs)} />
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [column-fill:_balance]">
            {items.map((entry) => (
              <div key={entry.id} className="mb-2 break-inside-avoid">
                {entry.kind === 'broll-image' && (
                  <BRollImageTile
                    item={entry.data}
                    onClick={() => setPreviewEntry(entry)}
                    onDelete={() => deleteBRoll(entry.data.id)}
                  />
                )}
                {entry.kind === 'video' && (
                  <VideoTile
                    item={entry.data}
                    isSaving={savingIds.has(entry.data.id)}
                    onClick={() => setPreviewEntry(entry)}
                    onSave={() => handleSaveVideo(entry.data)}
                    onDelete={() => deleteVideoHistory(entry.data.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {previewEntry && (
        <PreviewModal entry={previewEntry} onClose={() => setPreviewEntry(null)} />
      )}
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

function BRollImageTile({
  item,
  onClick,
  onDelete,
}: {
  item: BRoll
  onClick: () => void
  onDelete: () => void
}) {
  const { url, status } = useAssetUrlState(item.imageUrl)
  const hasVideos = (item.videos?.length ?? 0) > 0

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
      {hasVideos && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-purple-100 backdrop-blur">
          <Play className="h-2.5 w-2.5 fill-current" />
          {item.videos!.length}
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{item.prompt}</p>
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileButton title="Saved to B-Rolls" tone="saved" onClick={(e) => { e.stopPropagation() }}>
          <Check className="h-3 w-3" />
        </TileButton>
        <TileButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(item.imageUrl)
            if (u) downloadFile(u, `broll-${item.id}.png`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton title="Delete from bank" tone="danger" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>
    </div>
  )
}

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
          {isSaved ? <Check className="h-3 w-3" /> : isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
        </TileButton>
        <TileButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(item.videoUrl)
            if (u) downloadFile(u, `broll-video-${item.id}.mp4`)
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

function InFlightTile({ entry }: { entry: Entry }) {
  if (entry.kind !== 'in-flight-image' && entry.kind !== 'in-flight-video') return null
  const isVideo = entry.kind === 'in-flight-video'
  const Icon = isVideo ? Film : ImageIcon
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-green-500/30 bg-gradient-to-br from-green-500/[0.08] to-zinc-950">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-green-500/10 via-transparent to-green-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-green-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-green-100 backdrop-blur">
        {isVideo ? 'video' : 'image'}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Icon className="h-5 w-5 text-green-300" />
        <GenerationProgress
          isActive
          color="bg-green-500"
          showHelper={false}
          messages={
            isVideo
              ? ['Sending request...', 'Storyboarding frames...', 'Rendering motion...', 'Finalizing the clip...']
              : ['Sending request...', 'Composing the scene...', 'Rendering details...', 'Finalizing the frame...']
          }
          className="max-w-[180px]"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{entry.prompt}</p>
      </div>
    </div>
  )
}

function PreviewModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const imageRef = entry.kind === 'broll-image' ? entry.data.imageUrl : null
  const videoRef = entry.kind === 'video' ? entry.data.videoUrl : null
  const imageUrl = useAssetUrl(imageRef)
  const videoUrl = useAssetUrl(videoRef)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        {entry.kind === 'broll-image' && imageUrl && (
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
          {entry.kind === 'broll-image' ? entry.data.prompt : entry.kind === 'video' ? entry.data.prompt : ''}
        </p>
      </div>
    </div>
  )
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
