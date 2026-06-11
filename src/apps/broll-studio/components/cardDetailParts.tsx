// Presentational parts of CardDetailModal — the per-card masonry gallery, the
// image/video/in-flight tiles, the small tab/chip/reference-slot controls, and
// pure helpers. Split out of CardDetailModal.tsx so that file holds only the
// modal's orchestration (state + handlers). These all communicate via props.
import { useState, useEffect, useRef } from 'react'
import {
  ImageIcon, Video as VideoIcon, Film, Loader2, Check, Download, Trash2, Bookmark, Volume2, VolumeX, Play, Pause, Copy, Circle, AlertCircle, RefreshCw, X,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import type { CardState } from '../types'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import { startOfDay, sectionLabel } from '../../../utils/history'

// ─── Modal gallery — per-card masonry ────────────────────────────────────

export interface ModalGalleryProps {
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  setTab: (t: 'image' | 'video' | 'animate') => void
  savedImageIdxs: Set<number>
  savingImageIdxs: Set<number>
  savedVideoIdxs: Set<number>
  savingVideoIdxs: Set<number>
  onSaveImage: (index: number) => void
  onSaveVideo: (index: number) => void
  onDeleteImage: (index: number) => void
  onDeleteVideo: (index: number) => void
  onCopyPrompt: (text: string) => void
  // Open the Animate tab with this image set as the start frame.
  onAnimateImage: (index: number) => void
  // Re-fire / drop a failed in-flight entry (one whose `error` is set).
  onRetryInFlight: (id: string, isVideo: boolean) => void
  onDismissInFlight: (id: string, isVideo: boolean) => void
}

type ModalEntry =
  | { kind: 'image'; idx: number; createdAt: number; imageUrl: string; prompt: string; modelId?: string }
  | { kind: 'video'; idx: number; createdAt: number; videoUrl: string; aspectRatio: string; prompt: string; modelId: string }
  | { kind: 'in-flight-image'; id: string; createdAt: number; prompt: string; aspectRatio: string; error?: string | null }
  | { kind: 'in-flight-video'; id: string; createdAt: number; prompt: string; mode: 'animating' | 'rendering'; aspectRatio: string; error?: string | null }

// An in-flight entry carries an `error` once its generation failed; that's the
// signal to render it as a Failed tile (retry/dismiss) instead of a spinner.
function inFlightError(e: ModalEntry): string | null | undefined {
  return e.kind === 'in-flight-image' || e.kind === 'in-flight-video' ? e.error : undefined
}

export function ModalGallery({
  cardState,
  onUpdateState,
  setTab,
  savedImageIdxs,
  savingImageIdxs,
  savedVideoIdxs,
  savingVideoIdxs,
  onSaveImage,
  onSaveVideo,
  onDeleteImage,
  onDeleteVideo,
  onCopyPrompt,
  onAnimateImage,
  onRetryInFlight,
  onDismissInFlight,
}: ModalGalleryProps) {
  const noSelectionYet = !cardState.selected
  useEffect(() => {
    if (!noSelectionYet) return
    if (cardState.images.length > 0) {
      onUpdateState({ selected: { kind: 'image', index: cardState.images.length - 1 } })
    } else if (cardState.videos.length > 0) {
      onUpdateState({ selected: { kind: 'video', index: cardState.videos.length - 1 } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSelectionYet, cardState.images.length, cardState.videos.length])

  // Unified per-card output stream, newest-first.
  const entries: ModalEntry[] = []
  for (const entry of cardState.inFlightImages) {
    entries.push({ kind: 'in-flight-image', id: entry.id, createdAt: entry.startedAt, prompt: entry.prompt, aspectRatio: entry.aspectRatio, error: entry.error })
  }
  for (const entry of cardState.inFlightVideos) {
    entries.push({
      kind: 'in-flight-video',
      id: entry.id,
      createdAt: entry.startedAt,
      prompt: entry.prompt,
      mode: entry.mode === 'image-to-video' ? 'animating' : 'rendering',
      aspectRatio: entry.aspectRatio,
      error: entry.error,
    })
  }
  cardState.images.forEach((img, idx) => {
    entries.push({ kind: 'image', idx, createdAt: img.createdAt ?? 0, imageUrl: img.imageUrl, prompt: img.prompt, modelId: img.modelId })
  })
  cardState.videos.forEach((v, idx) => {
    entries.push({ kind: 'video', idx, createdAt: v.createdAt ?? 0, videoUrl: v.url, aspectRatio: v.aspectRatio, prompt: v.prompt, modelId: v.modelId })
  })
  entries.sort((a, b) => b.createdAt - a.createdAt)

  const inFlight = entries.filter((e) => e.kind === 'in-flight-image' || e.kind === 'in-flight-video')
  const inFlightActive = inFlight.filter((e) => !inFlightError(e))
  const inFlightFailed = inFlight.filter((e) => inFlightError(e))
  const finished = entries.filter((e) => e.kind === 'image' || e.kind === 'video')

  const dayGroups = new Map<number, ModalEntry[]>()
  for (const e of finished) {
    const day = startOfDay(e.createdAt)
    const arr = dayGroups.get(day) ?? []
    arr.push(e)
    dayGroups.set(day, arr)
  }
  const dayGroupList = Array.from(dayGroups.entries()).sort(([a], [b]) => b - a)

  const isImageSelected = (idx: number) =>
    cardState.selected?.kind === 'image' && cardState.selected.index === idx
  const isVideoSelected = (idx: number) =>
    cardState.selected?.kind === 'video' && cardState.selected.index === idx

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <ImageIcon className="h-8 w-8 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">No generations yet</p>
        <p className="max-w-[220px] text-xs leading-relaxed text-zinc-600">
          Pick a model and hit Generate. Outputs land here — click any to set
          it as the cover.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {inFlightActive.length > 0 && (
        <>
          <DayPill label="In progress" />
          <div className="columns-2 gap-2 [column-fill:_balance]">
            {inFlightActive.map((entry) => (
              <div key={entry.kind === 'in-flight-image' || entry.kind === 'in-flight-video' ? entry.id : ''} className="mb-2 break-inside-avoid">
                <InFlightTile entry={entry} />
              </div>
            ))}
          </div>
        </>
      )}

      {inFlightFailed.length > 0 && (
        <>
          <DayPill label="Failed" />
          <div className="columns-2 gap-2 [column-fill:_balance]">
            {inFlightFailed.map((entry) => {
              const id = entry.kind === 'in-flight-image' || entry.kind === 'in-flight-video' ? entry.id : ''
              const isVideo = entry.kind === 'in-flight-video'
              return (
                <div key={id} className="mb-2 break-inside-avoid">
                  <FailedTile
                    entry={entry}
                    onRetry={() => onRetryInFlight(id, isVideo)}
                    onDismiss={() => onDismissInFlight(id, isVideo)}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}

      {dayGroupList.map(([dayTs, items]) => (
        <div key={dayTs}>
          <DayPill label={sectionLabel(dayTs)} />
          <div className="columns-2 gap-2 [column-fill:_balance]">
            {items.map((entry) => {
              if (entry.kind === 'image') {
                return (
                  <div key={`img-${entry.idx}`} className="mb-2 break-inside-avoid">
                    <ImageTile
                      imageRef={entry.imageUrl}
                      modelId={entry.modelId}
                      selected={isImageSelected(entry.idx)}
                      saved={savedImageIdxs.has(entry.idx)}
                      saving={savingImageIdxs.has(entry.idx)}
                      onClick={() => {
                        onUpdateState({ selected: { kind: 'image', index: entry.idx }, currentImageIndex: entry.idx })
                        setTab('image')
                      }}
                      onSave={() => onSaveImage(entry.idx)}
                      onDelete={() => onDeleteImage(entry.idx)}
                      onCopyPrompt={() => onCopyPrompt(entry.prompt)}
                      onAnimate={() => onAnimateImage(entry.idx)}
                    />
                  </div>
                )
              }
              if (entry.kind === 'video') {
                return (
                  <div key={`vid-${entry.idx}`} className="mb-2 break-inside-avoid">
                    <VideoTile
                      videoRef={entry.videoUrl}
                      aspectRatio={entry.aspectRatio}
                      modelId={entry.modelId}
                      selected={isVideoSelected(entry.idx)}
                      saved={savedVideoIdxs.has(entry.idx)}
                      saving={savingVideoIdxs.has(entry.idx)}
                      onClick={() => {
                        onUpdateState({ selected: { kind: 'video', index: entry.idx }, currentVideoIndex: entry.idx })
                        setTab('video')
                      }}
                      onSave={() => onSaveVideo(entry.idx)}
                      onDelete={() => onDeleteVideo(entry.idx)}
                      onCopyPrompt={() => onCopyPrompt(entry.prompt)}
                    />
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tiles ──────────────────────────────────────────────────────────────

// Common hover-reveal layout: trash top-right, action row bottom-right with
// Download / Bookmark+text / Copy prompt. Icons sized at h-4 w-4 (bigger
// than the previous h-3 w-3) so they're easier to hit.
function ImageTile({
  imageRef,
  modelId,
  selected,
  saved,
  saving,
  onClick,
  onSave,
  onDelete,
  onCopyPrompt,
  onAnimate,
}: {
  imageRef: string
  modelId?: string
  selected: boolean
  saved: boolean
  saving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
  onCopyPrompt: () => void
  onAnimate?: () => void
}) {
  const { url, status } = useAssetUrlState(imageRef)
  const modelLabel = modelId ? getModel(modelId)?.displayName ?? modelId : null
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-colors ${
        selected
          ? 'border-orange-500/70 ring-2 ring-orange-500/40'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      {status === 'ready' && url ? (
        <img src={url} alt="" className="block h-auto w-full" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center">
          {status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" /> : <ImageIcon className="h-6 w-6 text-zinc-700" />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      {modelLabel && (
        <p className="pointer-events-none absolute left-2 bottom-1 max-w-[70%] truncate text-[10px] text-zinc-300/90 transition-opacity group-hover:opacity-0">{modelLabel}</p>
      )}
      {selected && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
          Cover
        </span>
      )}
      {/* Animate — opens the Animate tab with this still as the start frame. */}
      {onAnimate && (
        <button
          type="button"
          title="Animate this image into a video"
          onClick={(e) => { e.stopPropagation(); onAnimate() }}
          className="absolute left-1.5 bottom-1.5 flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-orange-400/50 bg-orange-500/85 px-3 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity hover:bg-orange-500 group-hover:opacity-100"
        >
          <Film className="h-3 w-3" />
          Animate B-Roll
        </button>
      )}
      {/* Top-right trash — appears on hover */}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TileDeleteButton onDelete={onDelete} />
      </div>
      {/* Bottom-right: Copy prompt · Save · Download — all square */}
      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Copy prompt" onClick={(e) => { e.stopPropagation(); onCopyPrompt() }}>
          <Copy className="h-4 w-4" />
        </TileIconButton>
        <TileIconButton
          title={saved ? 'Saved to bank' : saving ? 'Saving…' : 'Save to bank'}
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saved ? <Check className="h-4 w-4" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
        </TileIconButton>
        <TileIconButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(imageRef)
            if (u) downloadFile(u, `broll-${Date.now()}.png`)
          }}
        >
          <Download className="h-4 w-4" />
        </TileIconButton>
      </div>
    </div>
  )
}

function VideoTile({
  videoRef,
  aspectRatio,
  modelId,
  selected,
  saved,
  saving,
  onClick,
  onSave,
  onDelete,
  onCopyPrompt,
}: {
  videoRef: string
  aspectRatio: string
  modelId: string
  selected: boolean
  saved: boolean
  saving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
  onCopyPrompt: () => void
}) {
  const url = useAssetUrl(videoRef)
  const videoElRef = useRef<HTMLVideoElement>(null)
  const [hovering, setHovering] = useState(false)
  const [playing, setPlaying] = useState(false)
  // Hover-autoplay must stay muted (browsers block unmuted autoplay), but an
  // explicit Play click is a user gesture and should play with sound.
  const [unmuted, setUnmuted] = useState(false)
  const ratio = aspectStyle(aspectRatio)
  const modelLabel = getModel(modelId)?.displayName ?? modelId

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoElRef.current
    if (!v) return
    if (v.paused) {
      // Explicit play → unmute so the generated clip is audible.
      setUnmuted(true)
      v.muted = false
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoElRef.current
    setUnmuted((prev) => {
      const next = !prev
      if (v) v.muted = !next
      return next
    })
  }

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-colors ${
        selected
          ? 'border-orange-500/70 ring-2 ring-orange-500/40'
          : 'border-white/10 hover:border-white/30'
      }`}
      style={ratio}
    >
      {url ? (
        <video
          ref={videoElRef}
          src={url}
          muted={!unmuted}
          loop
          playsInline
          autoPlay={hovering}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}
      {/* Clickable play / pause overlay. Hidden while playing — autoplay on
          hover means most of the time the user never has to click it. The
          stopPropagation lets the user toggle playback without selecting the
          tile as the cover. */}
      {url && !playing && (
        <button
          type="button"
          title="Play"
          onClick={togglePlay}
          className="pointer-events-auto absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/85"
        >
          <Play className="h-3 w-3 fill-white text-white" />
        </button>
      )}
      {url && playing && hovering && (
        <button
          type="button"
          title="Pause"
          onClick={togglePlay}
          className="pointer-events-auto absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/85"
        >
          <Pause className="h-3 w-3 fill-white text-white" />
        </button>
      )}
      {url && (hovering || unmuted) && (
        <button
          type="button"
          title={unmuted ? 'Mute' : 'Unmute'}
          onClick={toggleMute}
          className="pointer-events-auto absolute left-10 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/85"
        >
          {unmuted ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      <p className="pointer-events-none absolute inset-x-2 bottom-1 line-clamp-1 text-[10px] text-zinc-300/90">{modelLabel}</p>
      {selected && (
        <span className="pointer-events-none absolute left-1.5 bottom-1.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
          Cover
        </span>
      )}
      {/* Top-right trash */}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TileDeleteButton onDelete={onDelete} />
      </div>
      {/* Bottom-right hover actions */}
      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Copy prompt" onClick={(e) => { e.stopPropagation(); onCopyPrompt() }}>
          <Copy className="h-4 w-4" />
        </TileIconButton>
        <TileIconButton
          title={saved ? 'Saved to bank' : saving ? 'Saving…' : 'Save to bank'}
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saved ? <Check className="h-4 w-4" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
        </TileIconButton>
        <TileIconButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(videoRef)
            if (u) downloadFile(u, `broll-${Date.now()}.mp4`)
          }}
        >
          <Download className="h-4 w-4" />
        </TileIconButton>
      </div>
    </div>
  )
}

function InFlightTile({ entry }: { entry: ModalEntry }) {
  if (entry.kind !== 'in-flight-image' && entry.kind !== 'in-flight-video') return null
  const isVideo = entry.kind === 'in-flight-video'
  const Icon = isVideo ? VideoIcon : ImageIcon
  const label = isVideo
    ? (entry.kind === 'in-flight-video' && entry.mode === 'animating' ? 'animating' : 'rendering')
    : 'image'
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] to-zinc-950"
      style={aspectStyle(entry.aspectRatio)}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-orange-500/10 via-transparent to-orange-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-orange-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-orange-100 backdrop-blur">
        {label}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Icon className="h-5 w-5 text-orange-300" />
        <GenerationProgress
          isActive
          color="bg-orange-500"
          showHelper={false}
          messages={
            isVideo
              ? ['Sending request...', 'Storyboarding frames...', 'Rendering motion...', 'Finalizing the clip...']
              : ['Sending request...', 'Composing the scene...', 'Rendering details...', 'Finalizing the frame...']
          }
          className="max-w-[140px]"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{entry.prompt}</p>
      </div>
    </div>
  )
}

// A failed generation tile — replaces the perpetual spinner once an in-flight
// entry carries an `error`. Retry re-fires the same gen; Dismiss drops it.
function FailedTile({
  entry,
  onRetry,
  onDismiss,
}: {
  entry: ModalEntry
  onRetry: () => void
  onDismiss: () => void
}) {
  if (entry.kind !== 'in-flight-image' && entry.kind !== 'in-flight-video') return null
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-500/[0.1] to-zinc-950"
      style={aspectStyle(entry.aspectRatio)}
    >
      <div className="absolute left-1.5 top-1.5 rounded-full bg-red-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-100 backdrop-blur">
        Failed
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
        <AlertCircle className="h-5 w-5 text-red-300" />
        <p className="line-clamp-3 text-[10px] leading-relaxed text-red-200">{entry.error}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-orange-500 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-orange-400"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08]"
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-1 text-[10px] text-zinc-400">{entry.prompt}</p>
      </div>
    </div>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function DayPill({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-zinc-300">{label}</span>
    </div>
  )
}

function TileIconButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'danger' | 'saved'
}) {
  const toneClass = tone === 'danger'
    ? 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
    : tone === 'saved'
    ? 'bg-emerald-500/40 text-emerald-100 hover:bg-emerald-500/50'
    : 'bg-black/60 text-zinc-200 hover:bg-black/80'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}

// Two-click delete inside the modal's tile gallery. First click flips to a
// red "Confirm?" state for 3 s; second click within the window deletes.
function TileDeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <button
      type="button"
      title={confirming ? 'Click again to delete' : 'Delete'}
      onClick={(e) => {
        e.stopPropagation()
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        onDelete()
      }}
      className={`flex h-8 items-center justify-center gap-1 rounded-full px-2 backdrop-blur transition-colors ${
        confirming
          ? 'bg-red-500/45 text-red-50 ring-1 ring-red-400/70'
          : 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
      }`}
    >
      <Trash2 className="h-4 w-4" />
      {confirming && <span className="text-[10px] font-medium uppercase tracking-wider">Confirm</span>}
    </button>
  )
}

export function ModalTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 pb-2 pt-3 text-[13px] font-medium tracking-tight transition-colors ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? 'bg-zinc-100' : 'bg-transparent'
        }`}
      />
    </button>
  )
}

export function IconChipButton({
  children,
  onClick,
  title,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  tone?: 'default' | 'emerald'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  )
}

// Reference Images slot card — Bank-picker-style. Same outer shell as
// the ModelPicker rows: rounded-xl border + bg-white/[0.02] + p-3 with an
// icon avatar on the left. Click opens the script-level BankPicker.
export function ReferenceSlotCard({
  icon,
  accentClass,
  kind,
  name,
  imageRef,
  onClick,
  active,
  onToggleActive,
  dimmed,
  dimmedReason,
}: {
  icon: React.ReactNode
  accentClass: string
  kind: 'Character' | 'Product'
  name?: string | null
  imageRef?: string | null
  onClick: () => void
  active: boolean
  onToggleActive: () => void
  // True when the current video model doesn't support reference-to-video.
  // The card stays clickable so the user can pre-arm the toggle for a model
  // swap, but the visual state explains why nothing is highlighted.
  dimmed?: boolean
  dimmedReason?: string
}) {
  const url = useAssetUrl(imageRef)
  const hasRef = !!name
  // Only the active+populated state earns the orange highlight — and not
  // when the chosen model can't use refs.
  const highlight = active && hasRef && !dimmed
  return (
    <div
      title={dimmed ? dimmedReason : undefined}
      className={`relative flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        highlight
          ? 'border-orange-500/40 bg-orange-500/10'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      } ${dimmed ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {url ? (
          <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accentClass}`}>
            {icon}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col pr-6">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{kind}</span>
          <span className={`truncate text-[13px] font-medium ${name ? 'text-zinc-100' : 'text-zinc-600'}`}>
            {name || `Select ${kind.toLowerCase()}`}
          </span>
        </div>
      </button>
      {hasRef && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleActive() }}
          title={active ? 'Active — click to disable' : 'Inactive — click to enable'}
          className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            active
              ? 'border-orange-500/60 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
              : 'border-white/15 bg-white/[0.04] text-zinc-500 hover:border-white/30 hover:text-zinc-300'
          }`}
        >
          {active ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Circle className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
// (startOfDay + day labelling now live in utils/history — imported above.)

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
