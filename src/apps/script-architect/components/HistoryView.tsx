import { useMemo, useState } from 'react'
import { Search, FileText, Trash2, Wand2, PenLine } from 'lucide-react'
import type { ScriptHistoryItem } from '../../../stores/types'

interface HistoryViewProps {
  items: ScriptHistoryItem[]
  activeId: string | null
  onSelect: (item: ScriptHistoryItem) => void
  onDelete: (id: string) => void
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

export default function HistoryView({ items, activeId, onSelect, onDelete }: HistoryViewProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items
      .filter((it) => {
        if (!q) return true
        if (it.inputSummary.toLowerCase().includes(q)) return true
        if (it.productName?.toLowerCase().includes(q)) return true
        return it.variations.some((v) => v.toLowerCase().includes(q))
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)

    const map = new Map<number, ScriptHistoryItem[]>()
    for (const it of filtered) {
      const day = startOfDay(it.createdAt)
      const arr = map.get(day) ?? []
      arr.push(it)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [items, query])

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <FileText className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-300">No scripts yet</p>
        <p className="text-center text-xs text-zinc-500">Your generated scripts will land here.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history..."
            className="w-full rounded-full border border-white/10 bg-transparent py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-blue-500/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <span className="text-sm text-zinc-500">No matches.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {groups.map(([dayTs, dayItems]) => (
              <div key={dayTs} className="flex flex-col gap-0.5">
                <div className="my-2 flex items-center justify-center">
                  <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-zinc-300">
                    {sectionLabel(dayTs)}
                  </span>
                </div>

                {dayItems.map((item) => {
                  const isActive = activeId === item.id
                  const ModeIcon = item.mode === 'remix' ? PenLine : Wand2
                  const modeColor = item.mode === 'remix' ? 'text-blue-300' : 'text-fuchsia-300'
                  const modeLabel = item.mode === 'remix'
                    ? `Remix · ${item.variations.length} variation${item.variations.length === 1 ? '' : 's'}`
                    : 'Reverse engineer'
                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className={`group cursor-pointer rounded-xl px-3 py-3 transition-colors ${
                        isActive ? 'bg-blue-500/15 ring-1 ring-blue-500/20' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ${modeColor}`}>
                          <ModeIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm leading-snug text-zinc-100">
                            {item.inputSummary || '(no preview)'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <span className={modeColor}>{modeLabel}</span>
                            {item.productName && (
                              <>
                                <span>·</span>
                                <span>{item.productName}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{formatRelative(item.createdAt)}</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-red-500/10 hover:text-red-400 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
