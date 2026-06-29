import { useMemo, useState } from 'react'
import { Search, Eye, Trash2, Plus, AlertCircle } from 'lucide-react'
import type { AdAnatomyHistoryItem } from '../../../stores/types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'

interface HistoryRailProps {
  items: AdAnatomyHistoryItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onNew: () => void
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function sectionLabel(dayTs: number): string {
  const today = startOfDay(Date.now())
  const yesterday = today - 86_400_000
  if (dayTs === today) return 'Today'
  if (dayTs === yesterday) return 'Yesterday'
  return new Date(dayTs).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function HistoryRail({ items, selectedId, onSelect, onDelete, onNew }: HistoryRailProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items
      .filter((it) => {
        if (!q) return true
        return (
          it.adTitle.toLowerCase().includes(q) ||
          it.fileName.toLowerCase().includes(q)
        )
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)

    const map = new Map<number, AdAnatomyHistoryItem[]>()
    for (const it of filtered) {
      const day = startOfDay(it.createdAt)
      const arr = map.get(day) ?? []
      arr.push(it)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [items, query])

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-ink/5">
      {/* Search sits in the top header band; h-[57px] pushes the border-box
          bottom border down to y=56 so it lines up with the sidebar header
          divider, matching the toggle bands in the other tabs. */}
      <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search analyses..."
            className="w-full rounded-full border border-ink/10 bg-transparent py-1.5 pl-9 pr-3 text-[12px] text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-[#FF5257]/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Eye className="h-8 w-8 text-ink-800" strokeWidth={1.5} />
            <p className="text-xs text-ink-500">No analyses yet</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <span className="text-xs text-ink-500">No matches.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {groups.map(([dayTs, dayItems]) => (
              <div key={dayTs} className="flex flex-col gap-0.5">
                <div className="my-1.5 flex items-center justify-center">
                  <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-[10px] font-medium tracking-tight text-ink-300">
                    {sectionLabel(dayTs)}
                  </span>
                </div>

                {dayItems.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    isActive={selectedId === item.id}
                    onSelect={() => onSelect(item.id)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New analysis — action footer, mirroring the bottom Generate button in
          the other tabs. */}
      <div className="shrink-0 border-t border-ink/5 p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-[#FF5257] px-4 py-3 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] btn-soft-shadow transition-colors hover:bg-[#FF5257]/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New analysis
        </button>
      </div>
    </div>
  )
}

function HistoryRow({
  item,
  isActive,
  onSelect,
  onDelete,
}: {
  item: AdAnatomyHistoryItem
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const thumbUrl = useAssetUrl(item.thumbnailRef ?? '')
  const [confirming, setConfirming] = useState(false)
  const titleText = item.adTitle?.trim() || item.fileName || 'Untitled analysis'

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-full px-3 py-2 transition-colors ${
        isActive
          ? 'bg-[#FF5257]/15 ring-1 ring-[#FF5257]/20'
          : 'hover:bg-ink/[0.04]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {thumbUrl ? (
          <div className="relative h-11 w-11 shrink-0">
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full rounded-full border border-ink/10 object-cover"
            />
            {item.status === 'analyzing' && <PulseOverlay />}
          </div>
        ) : (
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.04] text-[#FF5257]/70">
            <Eye className="h-4 w-4" />
            {item.status === 'analyzing' && <PulseOverlay />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[12.5px] font-medium leading-snug text-ink-100">
            {titleText}
          </p>
          <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-500">
            <StatusChip item={item} />
            {item.status === 'complete' && <span>{formatRelative(item.createdAt)}</span>}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!confirming) {
              setConfirming(true)
              setTimeout(() => setConfirming(false), 3000)
              return
            }
            onDelete()
          }}
          className={`flex h-6 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 transition-all ${
            confirming
              ? 'bg-red-500/30 text-red-100 light:text-red-900 opacity-100 ring-1 ring-red-400/60'
              : `text-ink-500 hover:bg-red-500/10 hover:text-red-400 light:hover:text-red-600 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
          }`}
          title={confirming ? 'Click again to delete' : 'Delete'}
        >
          <Trash2 className="h-3 w-3" />
          {confirming && <span className="text-[9px] font-medium">Confirm</span>}
        </button>
      </div>
    </div>
  )
}

function StatusChip({ item }: { item: AdAnatomyHistoryItem }) {
  if (item.status === 'analyzing') {
    return (
      <span className="flex items-center gap-1 text-[#FF5257]/90">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF5257] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF5257]" />
        </span>
        Analysing…
      </span>
    )
  }
  if (item.status === 'error') {
    return (
      <span className="flex min-w-0 items-center gap-1 text-red-400 light:text-red-600">
        <AlertCircle className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{item.errorMessage || 'Failed'}</span>
      </span>
    )
  }
  return null
}

function PulseOverlay() {
  return (
    <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[#FF5257]/40">
      <span className="absolute inset-0 animate-pulse rounded-full bg-[#FF5257]/10" />
    </span>
  )
}
