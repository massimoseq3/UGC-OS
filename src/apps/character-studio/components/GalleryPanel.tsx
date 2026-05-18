import { useMemo, useState } from 'react'
import { Loader2, Trash2, Image as ImageIcon, UserRound, Bookmark, X, RectangleVertical, RectangleHorizontal } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrlState } from '../../../hooks/useAssetUrl'
import type { CharacterHistoryItem } from '../../../stores/types'
import type { CharacterProfile } from '../types'
import ModelPicker from '../../../components/ModelPicker'
import ResolutionToggle from '../../../components/ResolutionToggle'
import GenerationProgress from '../../../components/GenerationProgress'
import { estimateCredits, formatCredits, getDefaultModel, getModel, type ImageResolution } from '../../../utils/models'
import HistoryPreviewModal from './HistoryPreviewModal'
import LoadPresetDropdown from './LoadPresetDropdown'

// One running generation. Lives only in memory — there's no createTask/poll
// split (generateCharacter is a single awaited promise), so a refresh ends
// the in-flight state and we lose the gen. That mirrors how the Characters
// flow worked before this change; persistence happens via characterHistory
// once the gen lands.
export interface InFlightCharacterGen {
  id: string
  modelId: string
  aspectRatio: string
  startedAt: number
}

interface GalleryPanelProps {
  inFlight: InFlightCharacterGen[]
  onCancelGen: (id: string) => void
  error: string | null
  onGenerate: () => void
  canGenerate: boolean
  aspectRatio: string
  onAspectRatioChange: (value: string) => void
  resolution: ImageResolution
  onResolutionChange: (value: ImageResolution) => void
  onLoadProfile: (profile: CharacterProfile) => void
}

const PORTRAIT_VALUE = 'Portrait (9:16)'
const LANDSCAPE_VALUE = 'Landscape (16:9)'

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

export default function GalleryPanel({
  inFlight,
  onCancelGen,
  error,
  onGenerate,
  canGenerate,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  onLoadProfile,
}: GalleryPanelProps) {
  const [previewItem, setPreviewItem] = useState<CharacterHistoryItem | null>(null)

  const characterHistory = useBankStore((s) => s.characterHistory)
  const deleteCharacterHistory = useBankStore((s) => s.deleteCharacterHistory)

  const persistedModel = useSettingsStore((s) => s.getAppModel('character-studio:image:text-to-image'))
  const selectedModelId = persistedModel ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  const creditsLabel = formatCredits(estimateCredits(selectedModelId ?? '', { imageCount: 1, resolution }))

  const dayGroups = useMemo(() => {
    const map = new Map<number, CharacterHistoryItem[]>()
    for (const e of characterHistory) {
      const day = startOfDay(e.createdAt)
      const arr = map.get(day) ?? []
      arr.push(e)
      map.set(day, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a)
  }, [characterHistory])

  const isEmpty = characterHistory.length === 0 && inFlight.length === 0

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Scrollable gallery */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <ImageIcon className="h-9 w-9 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-500">No generations yet</p>
            <p className="max-w-[300px] text-xs leading-relaxed text-zinc-600">
              Configure parameters on the left and hit Generate.
              Every character you make lands here, sorted by day.
            </p>
          </div>
        ) : (
          <div className="px-4 py-3">
            {inFlight.length > 0 && (
              <>
                <DayPill label={inFlight.length === 1 ? 'In progress' : `In progress · ${inFlight.length}`} />
                <div className="columns-2 gap-2 lg:columns-3 [column-fill:_balance]">
                  {inFlight.map((gen) => (
                    <div key={gen.id} className="mb-2 break-inside-avoid">
                      <InFlightTile gen={gen} onCancel={() => onCancelGen(gen.id)} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {dayGroups.map(([dayTs, items]) => (
              <div key={dayTs}>
                <DayPill label={dayLabel(dayTs)} />
                <div className="columns-2 gap-2 lg:columns-3 [column-fill:_balance]">
                  {items.map((item) => (
                    <div key={item.id} className="mb-2 break-inside-avoid">
                      <HistoryTile
                        item={item}
                        onClick={() => setPreviewItem(item)}
                        onDelete={() => deleteCharacterHistory(item.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky bottom generate-bar */}
      <div className="sticky bottom-0 z-10 min-w-0 space-y-2 border-t border-white/5 bg-[#050505]/95 p-3 backdrop-blur-xl md:static md:bg-transparent md:backdrop-blur-none">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}
        <LoadPresetDropdown onLoadProfile={onLoadProfile} />
        <ModelPicker
          appId="character-studio"
          task="image"
          mode="text-to-image"
          costParams={{ imageCount: 1, resolution }}
        />
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <AspectRatioToggle value={aspectRatio} onChange={onAspectRatioChange} />
          </div>
          <div className="flex-1">
            <ResolutionToggle modelId={selectedModelId} value={resolution} onChange={onResolutionChange} />
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-sky-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserRound className="h-4 w-4" />
          <span>
            Generate Character{creditsLabel ? ` (${creditsLabel})` : ''}
            {inFlight.length > 0 && ` · ${inFlight.length} running`}
          </span>
        </button>
      </div>

      {previewItem && (
        <HistoryPreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
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

function aspectStyle(ar: string): React.CSSProperties {
  if (ar.includes('16:9')) return { aspectRatio: '16 / 9' }
  return { aspectRatio: '9 / 16' }
}

function HistoryTile({
  item,
  onClick,
  onDelete,
}: {
  item: CharacterHistoryItem
  onClick: () => void
  onDelete: () => void
}) {
  const { url, status } = useAssetUrlState(item.imageRef)
  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-black transition-colors hover:border-white/20"
    >
      {status === 'ready' && url ? (
        <img src={url} alt="" className="block h-auto w-full" />
      ) : (
        <div className="flex w-full items-center justify-center" style={aspectStyle(item.aspectRatio)}>
          {status === 'loading'
            ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            : <ImageIcon className="h-6 w-6 text-zinc-700" />}
        </div>
      )}

      {item.linkedModelId && (
        <div
          title="Saved to Characters bank"
          className="absolute left-1.5 top-1.5 flex h-5 items-center gap-1 rounded-md bg-emerald-500/30 px-1.5 text-[9px] font-medium text-emerald-100 backdrop-blur"
        >
          <Bookmark className="h-3 w-3" strokeWidth={2} />
          Saved
        </div>
      )}

      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-300 backdrop-blur transition-colors hover:bg-red-500/30 hover:text-red-200"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function InFlightTile({ gen, onCancel }: { gen: InFlightCharacterGen; onCancel: () => void }) {
  const modelLabel = getModel(gen.modelId)?.displayName ?? gen.modelId
  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-sky-500/30 bg-gradient-to-br from-sky-500/[0.08] to-zinc-950"
      style={aspectStyle(gen.aspectRatio)}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-sky-500/10 via-transparent to-sky-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-sky-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-sky-100 backdrop-blur">
        generating
      </div>
      <button
        type="button"
        title="Cancel"
        onClick={onCancel}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-300 opacity-0 backdrop-blur transition-opacity hover:bg-red-500/30 hover:text-red-200 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <UserRound className="h-5 w-5 text-sky-300" />
        <p className="text-[10px] font-medium text-sky-100">{modelLabel}</p>
        <GenerationProgress
          isActive
          color="bg-sky-500"
          showHelper={false}
          messages={[
            'Sending request...',
            'Composing the character...',
            'Rendering details...',
            'Finalizing the frame...',
          ]}
          className="max-w-[180px]"
        />
      </div>
    </div>
  )
}

function AspectRatioToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPortrait = value.includes('9:16')
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
      <button
        onClick={() => onChange(PORTRAIT_VALUE)}
        className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${isPortrait
          ? 'bg-white/[0.08] text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Portrait 9:16"
      >
        <RectangleVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>Portrait</span>
        <span className={`tabular-nums ${isPortrait ? 'text-zinc-400' : 'text-zinc-600'}`}>9:16</span>
      </button>
      <button
        onClick={() => onChange(LANDSCAPE_VALUE)}
        className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${!isPortrait
          ? 'bg-white/[0.08] text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Landscape 16:9"
      >
        <RectangleHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>Landscape</span>
        <span className={`tabular-nums ${!isPortrait ? 'text-zinc-400' : 'text-zinc-600'}`}>16:9</span>
      </button>
    </div>
  )
}
