import { useMemo, useState, useEffect } from 'react'
import {
  Sparkles, Loader2, Download, Trash2, Bookmark, Check, Film, Image as ImageIcon,
  Music as MusicIcon, Play, X, Copy,
} from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { useAppStore } from '../../../stores/appStore'
import { getUrl } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import { sectionLabel, groupByDay } from '../../../utils/history'
import { downloadImage } from '../../../utils/downloadImage'
import type { ImageHistoryItem, VideoHistoryItem, MusicHistoryItem } from '../../../stores/types'
import AudioTile from './AudioTile'
import GenerationProgress from '../../../components/GenerationProgress'
import type { PlaygroundMode, InFlightGen } from '../types'
import { humanizeError } from '../../../utils/friendlyError'
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
      const newId = await addBRoll({ imageUrl: '', prompt: item.prompt, videos: [newVideo], sourceApp: 'playground' })
      await updateVideoHistory(item.id, { linkedBRollId: newId })
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
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {visibleInFlight.length > 0 && (
          <>
            <DayPill label="In progress" />
            <div className="columns-2 gap-2.5 lg:columns-3 xl:columns-4 [column-fill:_balance]">
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
            <DayPill label={sectionLabel(dayTs)} />
            <div className="columns-2 gap-2.5 lg:columns-3 xl:columns-4 [column-fill:_balance]">
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
                        if (url) downloadImage(url, `playground-${entry.data.id}`, 'mp3')
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
        <PreviewModal
          entry={previewItem}
          onClose={() => setPreviewItem(null)}
          isSaving={savingIds.has(previewItem.data.id)}
          onSave={() => {
            if (previewItem.kind === 'image') handleSaveImage(previewItem.data)
            else if (previewItem.kind === 'video') handleSaveVideo(previewItem.data)
          }}
          onCopyPrompt={async (text) => {
            const ok = await copyToClipboard(text)
            addToast(ok ? 'Prompt copied to clipboard' : 'Copy failed', ok ? undefined : 'error')
          }}
        />
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
            const u = await getUrl(item.imageUrl)
            if (u) downloadImage(u, `playground-${item.id}`)
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <DeleteConfirmButton onDelete={onDelete} />
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
            if (u) downloadImage(u, `playground-${item.id}`, 'mp4')
          }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <DeleteConfirmButton onDelete={onDelete} />
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

  // Shape the placeholder to match the image/video that's coming so the grid
  // doesn't jump when the result lands. Music has no aspect — keep it square.
  const ar = gen.imageParams?.aspectRatio ?? gen.videoParams?.aspectRatio

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-playground-500/30 bg-gradient-to-br from-playground-500/[0.08] to-zinc-950"
      style={ar ? aspectStyle(ar) : { aspectRatio: '1 / 1' }}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-playground-500/10 via-transparent to-playground-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-playground-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-playground-100 backdrop-blur">
        {gen.mode}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Icon className="h-5 w-5 text-playground-300" />
        <p className="text-[10px] font-medium text-playground-100">{modelLabel}</p>
        <GenerationProgress
          isActive
          color="bg-playground-500"
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
// Action cluster (Save / Download / Trash / Close) sits top-right. Prompt
// area is scrollable so a long prompt never pushes the media off-screen.
function PreviewModal({
  entry,
  onClose,
  onSave,
  isSaving,
  onCopyPrompt,
}: {
  entry: HistoryEntry
  onClose: () => void
  onSave: () => void
  isSaving: boolean
  onCopyPrompt: (text: string) => void
}) {
  const imageUrl = useAssetUrl(entry.kind === 'image' ? entry.data.imageUrl : null)
  const videoUrl = useAssetUrl(entry.kind === 'video' ? entry.data.videoUrl : null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const prompt = entry.kind === 'image' || entry.kind === 'video' ? entry.data.prompt : ''
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

  async function handleCopy() {
    onCopyPrompt(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
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
      {/* Top-right action cluster — Save, Download, Close. Delete lives on
          the grid tile only; one wrong click in here would nuke the item. */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalActionButton title={linked ? 'Saved to B-Roll bank' : 'Save to B-Roll bank'} onClick={onSave} disabled={linked || isSaving} tone={linked ? 'saved' : 'default'}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : linked ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </ModalActionButton>
        <ModalActionButton title="Download" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </ModalActionButton>
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
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16">
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
              className="max-h-full max-w-full rounded-xl border border-white/10 object-contain"
            />
          </div>
        )}

        {prompt && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-2xl shrink-0 flex-col items-center gap-2"
          >
            <div className="max-h-[18vh] w-full overflow-y-auto rounded-lg bg-white/[0.02] px-4 py-3 text-center text-[12px] leading-relaxed text-zinc-400">
              {prompt}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy prompt'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
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
      className={`flex h-6 items-center justify-center gap-1 rounded-md px-1.5 backdrop-blur transition-colors ${
        confirming
          ? 'bg-red-500/40 text-red-100 ring-1 ring-red-400/60'
          : 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
      }`}
    >
      <Trash2 className="h-3 w-3" />
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

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
