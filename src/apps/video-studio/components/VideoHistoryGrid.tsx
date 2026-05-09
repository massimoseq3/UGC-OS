import { useEffect, useRef, useState } from 'react'
import { Download, Save, Trash2, Check, Film, Play, FolderOpen, Plus } from 'lucide-react'
import type { VideoHistoryItem } from '../../../stores/types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { useBankStore } from '../../../stores/bankStore'
import { getModel } from '../../../utils/models'

interface VideoHistoryGridProps {
  items: VideoHistoryItem[]
  activeId: string | null
  onSelect: (item: VideoHistoryItem) => void
  onSaveToBank: (item: VideoHistoryItem) => void
  onDownload: (item: VideoHistoryItem) => void
  onDelete: (id: string) => void
}

// Google Flow-style grid of past video generations. Hover reveals an action
// row (save / download / delete). Clicking the tile elevates it to the main
// preview area.
export default function VideoHistoryGrid({
  items,
  activeId,
  onSelect,
  onSaveToBank,
  onDownload,
  onDelete,
}: VideoHistoryGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Film className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">No generations yet</p>
        <p className="max-w-[260px] text-xs leading-relaxed text-zinc-600">
          Every video you generate appears here. Save the ones you want to keep — kie.ai purges
          unsaved media after 14 days.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
        <p className="text-[11px] leading-relaxed text-amber-300/80">
          <span className="font-semibold">Heads up</span> — kie.ai retains generated media for 14
          days. Save anything you want to keep to the B-Rolls Bank.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3">
        {items.map((item) => (
          <HistoryTile
            key={item.id}
            item={item}
            isActive={item.id === activeId}
            onSelect={() => onSelect(item)}
            onSaveToBank={() => onSaveToBank(item)}
            onDownload={() => onDownload(item)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </div>
  )
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

      {tagOpen && <TagToProjectPopover item={item} onClose={() => setTagOpen(false)} />}
    </div>
  )
}

// Anchored to the tile's top-right; click outside or Escape closes it.
function TagToProjectPopover({ item, onClose }: { item: VideoHistoryItem; onClose: () => void }) {
  const projects = useBankStore((s) => s.projects)
  const addProject = useBankStore((s) => s.addProject)
  const addItemToProject = useBankStore((s) => s.addItemToProject)
  const removeItemFromProject = useBankStore((s) => s.removeItemFromProject)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const memberOf = new Set(item.projectIds ?? [])

  const handleCreate = () => {
    const name = draftName.trim()
    if (!name) return
    const id = addProject({ name })
    addItemToProject('videoHistory', item.id, id)
    setDraftName('')
    setCreating(false)
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-1.5 top-9 z-30 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="border-b border-white/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Add to project
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {projects.map((p) => {
          const isMember = memberOf.has(p.id)
          return (
            <button
              key={p.id}
              onClick={() => {
                if (isMember) removeItemFromProject('videoHistory', item.id, p.id)
                else addItemToProject('videoHistory', item.id, p.id)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                isMember ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {isMember && <Check className="h-3 w-3 shrink-0" />}
            </button>
          )
        })}
        {projects.length === 0 && !creating && (
          <p className="px-2 py-2 text-center text-[10px] text-zinc-500">No projects yet</p>
        )}
      </div>
      <div className="border-t border-white/5 p-1.5">
        {creating ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setDraftName('') }
              }}
              placeholder="New project…"
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500/40"
            />
            <button
              onClick={handleCreate}
              disabled={!draftName.trim()}
              className="rounded-md bg-emerald-500/30 px-2 py-1 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <Plus className="h-3 w-3" />
            New project
          </button>
        )}
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
