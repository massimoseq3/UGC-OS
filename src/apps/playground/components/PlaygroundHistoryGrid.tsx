import { useMemo, useState, useEffect } from 'react'
import {
  Loader2, Download, Trash2, Bookmark, Check, Film, Image as ImageIcon,
  Music as MusicIcon, Play, X, CornerDownLeft, ImagePlay, Copy,
} from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { useAppStore } from '../../../stores/appStore'
import { getUrl, saveAsset } from '../../../utils/assetStore'
import { extractVideoFrame } from '../../../utils/videoFrames'
import { getModel } from '../../../utils/models'
import { sectionLabel, groupByDay } from '../../../utils/history'
import { downloadImage } from '../../../utils/downloadImage'
import type { ImageHistoryItem, VideoHistoryItem, MusicHistoryItem } from '../../../stores/types'
import AudioTile from './AudioTile'
import GenerationProgress from '../../../components/GenerationProgress'
import GeneratingBackdrop from '../../../components/GeneratingBackdrop'
import type { PlaygroundMode, InFlightGen } from '../types'
import { humanizeError } from '../../../utils/friendlyError'
export type { InFlightGen }

// A single unified history entry. Image/Video/Music streams flow into this
// shape so day-bucketing + masonry can stay one code path.
type HistoryEntry =
  | { kind: 'image'; createdAt: number; data: ImageHistoryItem }
  | { kind: 'video'; createdAt: number; data: VideoHistoryItem }
  | { kind: 'music'; createdAt: number; data: MusicHistoryItem }

// The inputs a past generation can hand back to the prompt panel (the
// "reinsert into inputs" action). Reference images aren't persisted on history
// rows, so only the prompt + settings come back — the user re-attaches refs.
export interface PlaygroundReuse {
  mode: PlaygroundMode
  prompt: string
  modelId: string
  aspectRatio?: string
  resolution?: string
  durationSeconds?: number
  audio?: boolean
  instrumental?: boolean
}

function reuseFromEntry(entry: HistoryEntry): PlaygroundReuse {
  if (entry.kind === 'image') {
    const d = entry.data
    return { mode: 'image', prompt: d.prompt, modelId: d.modelId, aspectRatio: d.aspectRatio, resolution: d.resolution }
  }
  if (entry.kind === 'video') {
    const d = entry.data
    return { mode: 'video', prompt: d.prompt, modelId: d.modelId, aspectRatio: d.aspectRatio, resolution: d.resolution, durationSeconds: d.durationSeconds, audio: d.audio }
  }
  const d = entry.data
  return { mode: 'music', prompt: d.prompt, modelId: d.modelId, instrumental: d.instrumental }
}

interface PlaygroundHistoryGridProps {
  inFlight: InFlightGen[]
  // Active mode filter — null shows everything.
  filterMode: PlaygroundMode | null
  // Load a past generation's prompt + settings back into the prompt panel.
  onReuse: (input: PlaygroundReuse) => void
}

export default function PlaygroundHistoryGrid({ inFlight, filterMode, onReuse }: PlaygroundHistoryGridProps) {
  const imageHistory = useBankStore((s) => s.imageHistory)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const musicHistory = useBankStore((s) => s.musicHistory)
  const deleteImageHistory = useBankStore((s) => s.deleteImageHistory)
  const deleteVideoHistory = useBankStore((s) => s.deleteVideoHistory)
  const deleteMusicHistory = useBankStore((s) => s.deleteMusicHistory)
  const updateImageHistory = useBankStore((s) => s.updateImageHistory)
  const addBRoll = useBankStore((s) => s.addBRoll)
  const addToast = useAppStore((s) => s.addToast)

  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)

  const entries = useMemo<HistoryEntry[]>(() => {
    const out: HistoryEntry[] = []
    for (const i of imageHistory) out.push({ kind: 'image', createdAt: i.createdAt, data: i })
    // Playground's history grid only shows generations that originated in
    // Playground. B-Roll's per-card video gens write to the same
    // videoHistory bank (so refresh-resume keeps working) but they belong
    // in the B-Roll tab, not here. Legacy entries (no sourceApp field) are
    // kept visible — they pre-date the field and would otherwise vanish.
    for (const v of videoHistory) {
      if (v.sourceApp === 'broll-studio') continue
      out.push({ kind: 'video', createdAt: v.createdAt, data: v })
    }
    for (const m of musicHistory) out.push({ kind: 'music', createdAt: m.createdAt, data: m })
    out.sort((a, b) => b.createdAt - a.createdAt)
    if (filterMode) return out.filter((e) => e.kind === filterMode)
    return out
  }, [imageHistory, videoHistory, musicHistory, filterMode])

  const dayGroups = useMemo(() => groupByDay(entries, (e) => e.createdAt), [entries])

  const visibleInFlight = filterMode ? inFlight.filter((g) => g.mode === filterMode) : inFlight

  // Save an image-history entry to the B-Rolls bank. Tracks in-flight ids so
  // the user can't double-tap into duplicate BRolls.
  async function handleSaveImage(item: ImageHistoryItem) {
    if (item.linkedBRollId || savingIds.has(item.id)) return
    setSavingIds((prev) => new Set(prev).add(item.id))
    try {
      const id = await addBRoll({ imageUrl: item.imageUrl, prompt: item.prompt, sourceApp: 'playground' })
      await updateImageHistory(item.id, { linkedBRollId: id })
    } catch (err) {
      addToast(humanizeError(err, 'Save failed'), 'error')
    } finally {
      setSavingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  if (entries.length === 0 && visibleInFlight.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <ImagePlay className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
          <p className="text-sm text-ink-500">No generations yet</p>
          <p className="max-w-[300px] text-xs leading-relaxed text-ink-600">
            Pick a preset or type a prompt below and hit Generate.
            Everything you make lands here, sorted by day.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {visibleInFlight.length > 0 && (
          <>
            <DayPill label="In progress" />
            <div className="grid grid-cols-2 items-start gap-2.5 [grid-auto-flow:dense] lg:grid-cols-3 xl:grid-cols-4">
              {visibleInFlight.map((gen) => {
                const ar = gen.imageParams?.aspectRatio ?? gen.videoParams?.aspectRatio
                return (
                  <div key={gen.id} className={ar && isLandscape(ar) ? 'col-span-2' : ''}>
                    <InFlightTile gen={gen} />
                  </div>
                )
              })}
            </div>
          </>
        )}

        {dayGroups.map(([dayTs, dayItems]) => (
          <div key={dayTs}>
            <DayPill label={sectionLabel(dayTs)} />
            <div className="grid grid-cols-2 items-start gap-2.5 [grid-auto-flow:dense] lg:grid-cols-3 xl:grid-cols-4">
              {dayItems.map((entry) => {
                const ar = entry.kind === 'music' ? null : entry.data.aspectRatio
                return (
                <div key={`${entry.kind}-${entry.data.id}`} className={ar && isLandscape(ar) ? 'col-span-2' : ''}>
                  {entry.kind === 'image' && (
                    <ImageTile
                      item={entry.data}
                      isSaving={savingIds.has(entry.data.id)}
                      onClick={() => setPreviewItem(entry)}
                      onSave={() => handleSaveImage(entry.data)}
                      onDelete={() => deleteImageHistory(entry.data.id)}
                      onReuse={() => onReuse(reuseFromEntry(entry))}
                    />
                  )}
                  {entry.kind === 'video' && (
                    <VideoTile
                      item={entry.data}
                      onClick={() => setPreviewItem(entry)}
                      onDelete={() => deleteVideoHistory(entry.data.id)}
                      onReuse={() => onReuse(reuseFromEntry(entry))}
                    />
                  )}
                  {entry.kind === 'music' && (
                    <AudioTile
                      item={entry.data}
                      onDownload={async () => {
                        const url = await getUrl(entry.data.audioRef)
                        if (url) downloadImage(url, `playground-${entry.data.id}`, 'mp3')
                      }}
                      onDelete={() => deleteMusicHistory(entry.data.id)}
                      onReuse={() => onReuse(reuseFromEntry(entry))}
                    />
                  )}
                </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {previewItem && (
        <PreviewModal
          entry={previewItem}
          onClose={() => setPreviewItem(null)}
          isSaving={savingIds.has(previewItem.data.id)}
          onSave={() => {
            if (previewItem.kind === 'image') handleSaveImage(previewItem.data)
          }}
        />
      )}
    </div>
  )
}

function DayPill({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[11px] font-medium text-ink-300">{label}</span>
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
  onReuse,
}: {
  item: ImageHistoryItem
  isSaving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
  onReuse: () => void
}) {
  const { url, status } = useAssetUrlState(item.imageUrl)
  const isSaved = !!item.linkedBRollId
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId

  return (
    <div>
      <div
        onClick={onClick}
        className="group relative cursor-pointer overflow-hidden rounded-lg border border-ink/10 light:border-ink/5 bg-black light:bg-zinc-200 transition-all hover:border-ink/20 light:hover:border-ink/10 hover:-translate-y-px card-soft-shadow"
      >
        {status === 'ready' && url ? (
          <img src={url} alt="" className="block h-auto w-full" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center">
            {status === 'loading'
              ? <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
              : <ImageIcon className="h-6 w-6 text-ink-700" />}
          </div>
        )}
        {/* Hover actions: delete top-right, reinsert-to-inputs bottom-LEFT,
            save + download bottom-right — all round icon buttons. */}
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DeleteConfirmButton onDelete={onDelete} />
        </div>
        {item.prompt && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <TileButton title="Reuse — load prompt + settings into the inputs" onClick={(e) => { e.stopPropagation(); onReuse() }}>
              <CornerDownLeft className="h-4 w-4" />
            </TileButton>
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <TileButton
            title={isSaved ? 'Saved to B-Rolls' : isSaving ? 'Saving…' : 'Save to B-Rolls Bank'}
            tone={isSaved ? 'saved' : 'default'}
            onClick={(e) => { e.stopPropagation(); if (!isSaved && !isSaving) onSave() }}
          >
            {isSaved ? <Check className="h-4 w-4" /> : isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          </TileButton>
          <TileButton
            title="Download"
            onClick={async (e) => {
              e.stopPropagation()
              const u = await getUrl(item.imageUrl)
              if (u) downloadImage(u, `playground-${item.id}`)
            }}
          >
            <Download className="h-4 w-4" />
          </TileButton>
        </div>
      </div>
      {modelLabel && (
        <p className="mt-1 truncate text-center text-[10px] font-medium tracking-wider text-ink-500">
          {modelLabel}
        </p>
      )}
    </div>
  )
}

// ── Video tile ──────────────────────────────────────────────────

function VideoTile({
  item,
  onClick,
  onDelete,
  onReuse,
}: {
  item: VideoHistoryItem
  onClick: () => void
  onDelete: () => void
  onReuse: () => void
}) {
  const { url, status } = useAssetUrlState(item.videoUrl)
  const [hovering, setHovering] = useState(false)
  const ratio = aspectStyle(item.aspectRatio)
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId

  return (
    <div>
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={onClick}
        className="group relative cursor-pointer overflow-hidden rounded-lg border border-ink/10 light:border-ink/5 bg-black light:bg-zinc-200 transition-all hover:border-ink/20 light:hover:border-ink/10 hover:-translate-y-px card-soft-shadow"
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
              ? <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
              : <Film className="h-6 w-6 text-ink-700" />}
          </div>
        )}

        {/* Play badge stays put even while hovering (the clip auto-plays muted),
            so the card always reads as a video. */}
        {url && (
          <div className="pointer-events-none absolute left-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </div>
        )}

        {/* Hover actions: delete top-right, reinsert-to-inputs bottom-LEFT,
            download bottom-right, all round icon buttons. */}
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DeleteConfirmButton onDelete={onDelete} />
        </div>
        {item.prompt && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <TileButton title="Reuse — load prompt + settings into the inputs" onClick={(e) => { e.stopPropagation(); onReuse() }}>
              <CornerDownLeft className="h-4 w-4" />
            </TileButton>
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <TileButton
            title="Download"
            onClick={async (e) => {
              e.stopPropagation()
              const u = await getUrl(item.videoUrl)
              if (u) downloadImage(u, `playground-${item.id}`, 'mp4')
            }}
          >
            <Download className="h-4 w-4" />
          </TileButton>
        </div>
      </div>
      {modelLabel && (
        <p className="mt-1 truncate text-center text-[10px] font-medium tracking-wider text-ink-500">
          {modelLabel}
        </p>
      )}
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

  // Shape the placeholder to match the image/video that's coming so the grid
  // doesn't jump when the result lands. Music has no aspect — keep it square.
  const ar = gen.imageParams?.aspectRatio ?? gen.videoParams?.aspectRatio

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-playground-500/20"
      style={ar ? aspectStyle(ar) : { aspectRatio: '1 / 1' }}
    >
      <GeneratingBackdrop family="playground" />
      {/* Mode glyph, top-left — mirrors the reference framing. */}
      <div className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-playground-100 backdrop-blur-sm">
        <Icon className="h-4 w-4" />
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-[10px] font-medium text-playground-100">{modelLabel}</p>
        <GenerationProgress
          isActive
          color="bg-playground-500"
          showHelper={false}
          messageClassName="text-[10px]"
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{gen.prompt}</p>
      </div>
    </div>
  )
}

// ── Preview modal ───────────────────────────────────────────────

// Centered lightbox for the clicked tile. Esc + click-the-backdrop closes.
// Action cluster (Save / Download / Trash / Close) sits top-right. Prompt
// area is scrollable so a long prompt never pushes the media off-screen.
function PreviewModal({
  entry,
  onClose,
  onSave,
  isSaving,
}: {
  entry: HistoryEntry
  onClose: () => void
  onSave: () => void
  isSaving: boolean
}) {
  const imageUrl = useAssetUrl(entry.kind === 'image' ? entry.data.imageUrl : null)
  const videoUrl = useAssetUrl(entry.kind === 'video' ? entry.data.videoUrl : null)
  const addToast = useAppStore((s) => s.addToast)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const prompt = entry.kind === 'image' || entry.kind === 'video' ? entry.data.prompt : ''
  // Video previews lay out side-by-side (clip left, prompt + actions + frames
  // in a column to the right); images stay stacked.
  const isVideo = entry.kind === 'video' && !!videoUrl
  // Already-saved entries link a B-Roll id; show a tick instead of the bookmark.
  const linked =
    entry.kind === 'image'
      ? !!entry.data.linkedBRollId
      : entry.kind === 'video'
      ? !!entry.data.linkedBRollId
      : false

  async function handleDownload() {
    const url = entry.kind === 'image' ? imageUrl : videoUrl
    if (!url) return
    await downloadImage(url, `playground-${entry.data.id}`, entry.kind === 'image' ? 'png' : 'mp4')
  }

  async function handleCopyPrompt() {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      addToast('Could not copy the prompt', 'error')
    }
  }

  // The bar is glassmorphic + lives in the playground tree, but the modal
  // needs to overlay EVERYTHING — including the prompt bar. We use `fixed`
  // at the top of the stack with z-[60]. A scrim above the prompt bar
  // (z-50) is enough since the bar isn't capturing pointer events outside
  // its `pointer-events-auto` inner div.
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top-right holds only Close now — Save + Download moved down to
          labeled buttons beside Copy prompt. Delete lives on the grid tile. */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalActionButton title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </ModalActionButton>
      </div>

      {/* Centered content — media gets the upper space, prompt block sits
          underneath with its own scroll so long prompts never push the
          media off-screen. Only the media + prompt block swallow clicks;
          anywhere else inside the wrapper bubbles up to the backdrop and
          closes the modal. The media element shrinks to the image's real
          rendered size (max-h/max-w in a centered flex box), so the border
          hugs the picture — no letterbox bars. */}
      <div
        className={
          isVideo
            ? 'mx-auto flex h-full w-full max-w-6xl flex-row items-center justify-center gap-8 overflow-hidden px-6 py-16'
            : 'mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16'
        }
      >
        {entry.kind === 'image' && imageUrl && (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <img
              src={imageUrl}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-xl border border-white/10 object-contain"
            />
          </div>
        )}
        {entry.kind === 'video' && videoUrl && (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              onClick={(e) => e.stopPropagation()}
              className="max-h-[72vh] max-w-full rounded-xl border border-white/10 object-contain"
            />
          </div>
        )}

        <div
          onClick={(e) => e.stopPropagation()}
          className={
            isVideo
              ? 'flex h-full w-[380px] shrink-0 flex-col items-center justify-center gap-4 overflow-y-auto py-4'
              : 'flex w-full max-w-2xl shrink-0 flex-col items-center gap-3'
          }
        >
          {/* Frame grabs sit at the top of the side column — pull the first/last
              still out of the clip to reuse as a start frame / reference (save to
              bank) or keep (download). */}
          {entry.kind === 'video' && videoUrl && (
            <VideoFrameActions videoUrl={videoUrl} prompt={prompt} videoId={entry.data.id} aspectRatio={entry.data.aspectRatio} />
          )}
          {prompt && (
            <div className="max-h-[18vh] w-full overflow-y-auto rounded-lg bg-white/[0.02] px-4 py-3 text-center text-[12px] leading-relaxed text-zinc-400">
              {prompt}
            </div>
          )}
          {/* Primary actions — labeled pills. "Copy prompt" copies the prompt
              text to the clipboard. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {prompt && (
              <ModalBarButton onClick={handleCopyPrompt} tone={copied ? 'saved' : 'accent'}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? 'Copied' : 'Copy prompt'}</span>
              </ModalBarButton>
            )}
            {/* Save-to-bank is stills-only — videos are download-only. */}
            {entry.kind === 'image' && (
              <ModalBarButton
                onClick={onSave}
                disabled={linked || isSaving}
                tone={linked ? 'saved' : 'default'}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : linked ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                <span>{linked ? 'Saved to Bank' : 'Save to Bank'}</span>
              </ModalBarButton>
            )}
            <ModalBarButton onClick={handleDownload}>
              <Download className="h-4 w-4" />
              <span>{entry.kind === 'video' ? 'Download Video' : 'Download Image'}</span>
            </ModalBarButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Video frame grabs ───────────────────────────────────────────

function VideoFrameActions({ videoUrl, prompt, videoId, aspectRatio }: { videoUrl: string; prompt: string; videoId: string; aspectRatio?: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Frames</span>
      <div className="grid w-full grid-cols-2 items-start gap-2.5">
        <FrameCard label="First frame" position="first" videoUrl={videoUrl} prompt={prompt} videoId={videoId} aspectRatio={aspectRatio} />
        <FrameCard label="Last frame" position="last" videoUrl={videoUrl} prompt={prompt} videoId={videoId} aspectRatio={aspectRatio} />
      </div>
    </div>
  )
}

function FrameCard({
  label,
  position,
  videoUrl,
  prompt,
  videoId,
  aspectRatio,
}: {
  label: string
  position: 'first' | 'last'
  videoUrl: string
  prompt: string
  videoId: string
  aspectRatio?: string
}) {
  const addBRoll = useBankStore((s) => s.addBRoll)
  const addToast = useAppStore((s) => s.addToast)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // The thumbnail box matches the frame's real aspect ratio. Seed it from the
  // video's declared ratio (so there's no layout shift while the frame loads),
  // then refine from the decoded image's actual dimensions on load.
  const [ratio, setRatio] = useState<React.CSSProperties>(
    aspectRatio ? aspectStyle(aspectRatio) : { aspectRatio: '9 / 16' },
  )

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setStatus('loading')
    extractVideoFrame(videoUrl, position)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setBlob(b)
        setThumbUrl(objectUrl)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoUrl, position])

  async function handleSave() {
    if (!blob || saving || saved) return
    setSaving(true)
    try {
      const id = await saveAsset(blob, 'image/png')
      await addBRoll({ imageUrl: id, prompt, sourceApp: 'playground' })
      setSaved(true)
    } catch {
      addToast('Could not save the frame', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleDownload() {
    if (!thumbUrl) return
    void downloadImage(thumbUrl, `playground-${videoId}-${position}-frame`, 'png')
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div
        style={ratio}
        className="flex w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40"
      >
        {status === 'ready' && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`${label} preview`}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w && h) setRatio({ aspectRatio: `${w} / ${h}` })
            }}
            className="h-full w-full object-cover"
          />
        ) : status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        ) : (
          <Film className="h-5 w-5 text-zinc-600" />
        )}
      </div>
      <span className="text-[11px] font-medium text-zinc-300">{label}</span>
      <div className="flex w-full flex-col gap-1.5">
        <FrameButton
          className="w-full justify-center"
          title={saved ? 'Saved to B-Rolls' : 'Save to Bank'}
          disabled={status !== 'ready' || saving || saved}
          tone={saved ? 'saved' : 'default'}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span>{saved ? 'Saved' : 'Save'}</span>
        </FrameButton>
        <FrameButton className="w-full justify-center" title="Download frame" disabled={status !== 'ready'} onClick={handleDownload}>
          <Download className="h-4 w-4" />
          <span>Download</span>
        </FrameButton>
      </div>
    </div>
  )
}

function FrameButton({
  children,
  onClick,
  title,
  disabled,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  tone?: 'default' | 'saved'
  className?: string
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
    : 'border-white/15 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.12]'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    >
      {children}
    </button>
  )
}

function ModalActionButton({
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
  tone?: 'default' | 'saved' | 'danger'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
    : tone === 'danger'
    ? 'border-white/15 bg-black/40 text-zinc-200 hover:bg-red-500/30 hover:text-red-200 hover:border-red-500/40'
    : 'border-white/15 bg-black/40 text-white hover:bg-black/60'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {children}
    </button>
  )
}

// Labeled action pill for the preview modal's bottom bar — thicker/bigger
// than the corner icon buttons so Save / Download / Copy read clearly.
function ModalBarButton({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'saved' | 'accent'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
    : tone === 'accent'
    ? 'border-playground-500/40 bg-playground-500/20 text-playground-100 hover:bg-playground-500/30'
    : 'border-white/15 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.12]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-full border px-5 py-3 text-[13px] font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {children}
    </button>
  )
}

// ── Shared bits ─────────────────────────────────────────────────

// Two-click delete confirm. First click flips to a red "Confirm?" state for
// 3 s; second click within the window fires onDelete. Mirrors VariationCard's
// inline pattern so the house style stays consistent — no modal dialog.
export function DeleteConfirmButton({ onDelete }: { onDelete: () => void }) {
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
      className={`flex h-8 items-center justify-center gap-1 rounded-full border px-2 backdrop-blur transition-colors ${
        confirming
          ? 'border-red-400/60 bg-red-500/45 text-red-50'
          : 'border-white/20 bg-black/35 text-white hover:bg-red-500/30 hover:text-red-100 hover:border-red-400/40'
      }`}
    >
      <Trash2 className="h-4 w-4" />
      {confirming && <span className="text-[9px] font-medium uppercase tracking-wider">Confirm</span>}
    </button>
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
    ? 'border-emerald-400/50 bg-emerald-500/30 text-emerald-100'
    : tone === 'danger'
    ? 'border-white/20 bg-black/35 text-white hover:bg-red-500/30 hover:text-red-100 hover:border-red-400/40'
    : 'border-white/20 bg-black/35 text-white hover:bg-black/50'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition-colors ${toneClass}`}
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

// Landscape (wider-than-tall) outputs claim two grid columns so the wide frame
// is readable instead of squeezed into a single square-width column.
function isLandscape(ar: string): boolean {
  const [w, h] = ar.split(':').map(Number)
  return !!w && !!h && w > h
}
