import { useMemo, useState } from 'react'
import { Search, Film, Trash2 } from 'lucide-react'
import type { BrollHistoryItem } from '../../../stores/types'
import type { BrollResult, CardState } from '../types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { formatRelative, sectionLabel, groupByDay } from '../../../utils/history'

interface BrollHistoryViewProps {
  items: BrollHistoryItem[]
  activeId: string | null
  onSelect: (item: BrollHistoryItem) => void
  onDelete: (id: string) => void
}

// Pull the first image url found in any card's image list. Used for the
// history-row thumbnail so a session that already produced media has a
// visual anchor.
function firstImageRef(cardStates: Record<string, CardState>): string | null {
  for (const k in cardStates) {
    const card = cardStates[k]
    const url = card.images?.[0]?.imageUrl
    if (url) return url
  }
  return null
}

function sceneCount(result: BrollResult | null): number {
  return result?.scenes?.length ?? 0
}

export default function BrollHistoryView({ items, activeId, onSelect, onDelete }: BrollHistoryViewProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items
      .filter((it) => {
        if (!q) return true
        return it.inputSummary.toLowerCase().includes(q)
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)

    return groupByDay(filtered, (it) => it.createdAt)
  }, [items, query])

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <Film className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-300">No sessions yet</p>
        <p className="text-center text-xs text-zinc-500">Generated B-Roll sessions will land here.</p>
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
            className="w-full rounded-full border border-white/10 bg-transparent py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-orange-500/40"
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

                {dayItems.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    isActive={activeId === item.id}
                    onSelect={() => onSelect(item)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
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
  item: BrollHistoryItem
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const cardStates = item.cardStates as Record<string, CardState>
  const result = item.result as BrollResult | null
  const thumbRef = firstImageRef(cardStates)
  const thumbUrl = useAssetUrl(thumbRef ?? '')
  const count = sceneCount(result)
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-xl px-3 py-3 transition-colors ${
        isActive ? 'bg-orange-500/15 ring-1 ring-orange-500/20' : 'hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-orange-300/70">
            <Film className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug text-zinc-100">
            {item.inputSummary || '(no preview)'}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="text-orange-300">{count} scene{count === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{formatRelative(item.createdAt)}</span>
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
          className={`flex h-7 shrink-0 items-center justify-center gap-1 rounded-full px-2 transition-all ${
            confirming
              ? 'bg-red-500/30 text-red-100 opacity-100 ring-1 ring-red-400/60'
              : `text-zinc-500 hover:bg-red-500/10 hover:text-red-400 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
          }`}
          title={confirming ? 'Click again to delete' : 'Delete'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirming && <span className="text-[10px] font-medium">Confirm</span>}
        </button>
      </div>
    </div>
  )
}
