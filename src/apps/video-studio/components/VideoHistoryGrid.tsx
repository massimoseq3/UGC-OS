import { useEffect, useMemo, useState } from 'react'
import { Download, Save, Trash2, Check, Film, Play, FolderOpen, Loader2, X } from 'lucide-react'
import type { VideoHistoryItem } from '../../../stores/types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { useBankStore } from '../../../stores/bankStore'
import { getModel } from '../../../utils/models'
import ProjectTagPopover from './ProjectTagPopover'
import AssetSyncBadge from '../../../components/AssetSyncBadge'

const HEADS_UP_DISMISSED_KEY = 'video-studio:heads-up-dismissed'

// Day-bucket helper. Voice studio uses the same trio of helpers; we duplicate
// rather than share so we can iterate independently if the layouts diverge.
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
  return new Date(dayTs).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// Transient in-flight generation, kept in component memory while the kie task
// runs. Surfaced as a skeleton tile at the top of the grid so the user can
// always see what's queued — even if they switched slots since launching it.
export interface InFlightGen {
  id: string
  slotIndex: number
  modelId: string
  prompt: string
  aspectRatio: string
  startedAt: number
}

interface VideoHistoryGridProps {
  items: VideoHistoryItem[]
  inFlight?: InFlightGen[]
  activeId: string | null
  onSelect: (item: VideoHistoryItem) => void
  onSaveToBank: (item: VideoHistoryItem) => void
  onDownload: (item: VideoHistoryItem) => void
  onDelete: (id: string) => void
}

// Google Flow-style grid of past video generations. Hover reveals an action
// row (save / download / delete). Clicking the tile elevates it to the main
// preview area. In-flight generations render at the top as skeleton tiles.
export default function VideoHistoryGrid({
  items,
  inFlight = [],
  activeId,
  onSelect,
  onSaveToBank,
  onDownload,
  onDelete,
}: VideoHistoryGridProps) {
  // Heads-up banner is dismissible and the choice persists across reloads.
  // Initialize from localStorage so dismissed users don't see it flash on
  // every page load.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(HEADS_UP_DISMISSED_KEY) === '1' } catch { return false }
  })
  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(HEADS_UP_DISMISSED_KEY, '1') } catch { /* ignore */ }
  }

  // Sort newest first, then bucket by calendar day. In-flight jobs always
  // pin to the very top under their own "In progress" label so users can see
  // queued work no matter how many slots are running.
  const dayGroups = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt)
    const map = new Map<number, VideoHistoryItem[]>()
    for (const it of sorted) {
      const day = startOfDay(it.createdAt)
      const arr = map.get(day) ?? []
      arr.push(it)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [items])

  if (items.length === 0 && inFlight.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {!dismissed && <HeadsUpBanner onDismiss={dismiss} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Film className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-500">No generations yet</p>
          <p className="max-w-[280px] text-xs leading-relaxed text-zinc-600">
            Every video you generate appears here. Save the ones you want to keep — kie.ai purges
            unsaved media after 14 days, so download or save them or they'll be deleted.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {!dismissed && <HeadsUpBanner onDismiss={dismiss} />}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {inFlight.length > 0 && (
          <>
            <DayPill label="In progress" />
            {/* CSS columns produce a true masonry layout: each column flows
                independently so portrait + landscape tiles don't leave the
                vertical gaps that grid-template-rows: auto creates. */}
            <div className="columns-2 gap-2 [column-fill:_balance]">
              {inFlight.map((gen) => (
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
            <div className="columns-2 gap-2 [column-fill:_balance]">
              {dayItems.map((item) => (
                <div key={item.id} className="mb-2 break-inside-avoid">
                  <HistoryTile
                    item={item}
                    isActive={item.id === activeId}
                    onSelect={() => onSelect(item)}
                    onSaveToBank={() => onSaveToBank(item)}
                    onDownload={() => onDownload(item)}
                    onDelete={() => onDelete(item.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Top-of-grid retention notice. Dismissable; choice persists in localStorage.
function HeadsUpBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
      <p className="flex-1 text-[11px] leading-relaxed text-amber-300/80">
        <span className="font-semibold">Heads up</span> — kie.ai retains generated media for 14
        days. Save anything you want to keep to the B-Rolls Bank or download it, or else it may
        be deleted.
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
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-zinc-300">
        {label}
      </span>
    </div>
  )
}

// Skeleton tile rendered at the top of the grid for jobs still running on kie.
// Pulses + spinner conveys "still cooking"; slot label tells the user which
// tab kicked it off so they can navigate back.
function InFlightTile({ gen }: { gen: InFlightGen }) {
  const ratio = aspectStyle(gen.aspectRatio)
  const modelLabel = getModel(gen.modelId)?.displayName ?? gen.modelId
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - gen.startedAt) / 1000))
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - gen.startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [gen.startedAt])

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/[0.08] to-zinc-950"
      style={ratio}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-purple-500/10 via-transparent to-purple-500/5" />

      <div className="absolute left-1.5 top-1.5 rounded-full bg-purple-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-purple-100 backdrop-blur">
        Slot {gen.slotIndex + 1}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-purple-300" />
        <p className="text-[10px] font-medium text-purple-100">{modelLabel}</p>
        <p className="text-[10px] tabular-nums text-purple-300/80">{formatElapsed(elapsed)}</p>
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

interface HistoryTileProps {
  item: VideoHistoryItem
  isActive: boolean
  onSelect: () => void
  onSaveToBank: () => void
  onDownload: () => void
  onDelete: () => void
}

function HistoryTile({ item, isActive, onSelect, onSaveToBank, onDownload, onDelete }: HistoryTileProps) {
  const url = useAssetUrl(item.videoUrl)
  const [hovering, setHovering] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const isSaved = !!item.linkedBRollId
  const ratio = aspectStyle(item.aspectRatio)
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId
  const taggedCount = item.projectIds?.length ?? 0

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onSelect}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-all ${
        isActive ? 'border-purple-500/60 ring-1 ring-purple-500/40' : 'border-white/10 hover:border-white/20'
      }`}
      style={ratio}
    >
      {url ? (
        <video
          src={url}
          muted
          loop
          playsInline
          autoPlay={hovering}
          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950">
          <Film className="h-6 w-6 text-zinc-700" />
        </div>
      )}

      {/* Top-left play hint */}
      {!hovering && url && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
          <Play className="h-3 w-3 fill-white text-white" />
        </div>
      )}

      <AssetSyncBadge refs={[item.videoUrl, item.thumbnailUrl]} size="sm" className="absolute left-1.5 bottom-9" />

      {/* Bottom metadata strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-1 text-[10px] font-medium text-zinc-200">{modelLabel}</p>
        <p className="line-clamp-1 text-[10px] text-zinc-400">{item.prompt}</p>
      </div>

      {/* Hover actions */}
      <div
        className={`absolute right-1.5 top-1.5 flex gap-1 transition-opacity ${
          hovering || tagOpen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <TileButton
          title={isSaved ? 'Saved to Bank' : 'Save to B-Rolls Bank'}
          onClick={(e) => { e.stopPropagation(); if (!isSaved) onSaveToBank() }}
          tone={isSaved ? 'saved' : 'default'}
        >
          {isSaved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
        </TileButton>
        <TileButton
          title="Download"
          onClick={(e) => { e.stopPropagation(); onDownload() }}
        >
          <Download className="h-3 w-3" />
        </TileButton>
        <TileButton
          title={taggedCount > 0 ? `In ${taggedCount} project${taggedCount === 1 ? '' : 's'}` : 'Tag to project'}
          onClick={(e) => { e.stopPropagation(); setTagOpen((v) => !v) }}
          tone={taggedCount > 0 ? 'saved' : 'default'}
        >
          <FolderOpen className="h-3 w-3" />
        </TileButton>
        <TileButton
          title="Delete from history"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          tone="danger"
        >
          <Trash2 className="h-3 w-3" />
        </TileButton>
      </div>

      {tagOpen && (
        <TilePopoverWrapper
          itemId={item.id}
          projectIds={item.projectIds}
          onClose={() => setTagOpen(false)}
        />
      )}
    </div>
  )
}

// Per-tile project popover wrapper — wires the shared ProjectTagPopover to
// the videoHistory bank slice. Anchored under the tile's action row (top-9
// keeps it just below the buttons).
function TilePopoverWrapper({
  itemId,
  projectIds,
  onClose,
}: {
  itemId: string
  projectIds: string[] | undefined
  onClose: () => void
}) {
  const addItemToProject = useBankStore((s) => s.addItemToProject)
  const removeItemFromProject = useBankStore((s) => s.removeItemFromProject)
  return (
    <ProjectTagPopover
      projectIds={projectIds}
      onAdd={(pid) => addItemToProject('videoHistory', itemId, pid)}
      onRemove={(pid) => removeItemFromProject('videoHistory', itemId, pid)}
      onClose={onClose}
      anchorClassName="absolute right-1.5 top-9 z-30"
    />
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
  const toneClass =
    tone === 'saved'
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

// Aspect-ratio strings → CSS aspect-ratio for tile sizing. Falls back to 9:16
// since most ad UGC ships portrait.
function aspectStyle(ar: string): React.CSSProperties {
  const [w, h] = ar.split(':').map(Number)
  if (!w || !h) return { aspectRatio: '9 / 16' }
  return { aspectRatio: `${w} / ${h}` }
}
