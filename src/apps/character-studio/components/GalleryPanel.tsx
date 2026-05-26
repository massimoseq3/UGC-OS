import { useMemo, useRef, useState, useEffect } from 'react'
import { Loader2, Trash2, Image as ImageIcon, UserRound, Bookmark, X, RectangleVertical, RectangleHorizontal, Download, Check } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrlState } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useAppStore } from '../../../stores/appStore'
import type { CharacterHistoryItem } from '../../../stores/types'
import ModelPicker from '../../../components/ModelPicker'
import ResolutionToggle from '../../../components/ResolutionToggle'
import GenerationProgress from '../../../components/GenerationProgress'
import AiContentDisclosure from '../../../components/AiContentDisclosure'
import { estimateCredits, formatCredits, getDefaultModel, getModel, type ImageResolution } from '../../../utils/models'
import HistoryPreviewModal from './HistoryPreviewModal'
import { buildJsonPrompt } from '../services/generateCharacter'

// One running generation. Persisted to localStorage so a mid-flight refresh
// resumes polling instead of losing the job. `taskId` is the kie.ai task ref
// returned by startCharacterTask; missing while the createTask request is
// in flight, populated as soon as kie returns it. `profile` / `resolution`
// are the snapshot needed to write the history row on success.
export interface InFlightCharacterGen {
  id: string
  modelId: string
  aspectRatio: string
  startedAt: number
  taskId?: string
  resolution?: ImageResolution
  // The CharacterProfile snapshot to write into characterHistory on success.
  // Typed as Record<string, string> to avoid an import cycle through types.
  profile?: Record<string, string>
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
            <AiContentDisclosure />
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
  onDelete: () => void | Promise<unknown>
}) {
  const { url, status } = useAssetUrlState(item.imageRef)
  const addModel = useBankStore((s) => s.addModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const models = useBankStore((s) => s.models)
  const addToast = useAppStore((s) => s.addToast)
  const [savingToBank, setSavingToBank] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  const linkedModel = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId) : undefined
  const savedAsModel = !!linkedModel

  useEffect(() => {
    if (nameDraft !== null) {
      const id = window.setTimeout(() => nameInputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [nameDraft])

  function openNameInput(e: React.MouseEvent) {
    e.stopPropagation()
    if (savedAsModel || savingToBank) return
    setNameDraft(autoName(item))
  }

  async function commitSave() {
    const name = (nameDraft ?? '').trim()
    if (!name || savingToBank) return
    setSavingToBank(true)
    try {
      await addModel({
        name,
        characterImage: item.imageRef,
        notes: '',
        source: 'character-studio',
        jsonProfile: buildJsonPrompt(item.profile) as Record<string, unknown>,
      })
      const justAdded = useBankStore.getState().models.find(
        (m) => m.characterImage === item.imageRef && m.name === name,
      )
      if (justAdded) await updateCharacterHistory(item.id, { linkedModelId: justAdded.id })
      setNameDraft(null)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSavingToBank(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (deleting) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    const resolved = await getUrl(item.imageRef)
    if (!resolved) return
    const a = document.createElement('a')
    a.href = resolved
    a.download = `character-${item.id}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

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

      {savedAsModel && (
        <div
          title="Saved to Characters bank"
          className="absolute left-1.5 top-1.5 flex h-5 items-center gap-1 rounded-md bg-emerald-500/30 px-1.5 text-[9px] font-medium text-emerald-100 backdrop-blur"
        >
          <Bookmark className="h-3 w-3" strokeWidth={2} />
          Saved
        </div>
      )}

      <div className={`absolute right-1.5 top-1.5 flex gap-1 transition-opacity ${deleting || confirmingDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          type="button"
          title={deleting ? 'Deleting…' : confirmingDelete ? 'Click again to delete' : 'Delete'}
          onClick={handleDelete}
          disabled={deleting}
          className={`flex h-6 items-center justify-center gap-1 rounded-md px-1.5 backdrop-blur transition-colors disabled:cursor-wait ${
            confirmingDelete
              ? 'bg-red-500/45 text-red-50 ring-1 ring-red-400/70'
              : 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200 disabled:hover:bg-black/60 disabled:hover:text-zinc-300'
          }`}
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          {confirmingDelete && !deleting && <span className="text-[9px] font-medium uppercase tracking-wider">Confirm</span>}
        </button>
      </div>

      {/* Bottom hover actions — stacked pills with gradient backdrop */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-2 pb-2 pt-8 transition-opacity ${nameDraft !== null ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {nameDraft !== null ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-black/70 pl-2.5 pr-1 py-1 backdrop-blur"
          >
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitSave() }
                if (e.key === 'Escape') { e.preventDefault(); setNameDraft(null) }
              }}
              placeholder="Name this character"
              disabled={savingToBank}
              className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              title="Cancel"
              onClick={() => setNameDraft(null)}
              disabled={savingToBank}
              className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="Save"
              onClick={commitSave}
              disabled={savingToBank || !nameDraft.trim()}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/80 text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingToBank ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openNameInput}
            disabled={savedAsModel}
            className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition-colors ${savedAsModel
              ? 'cursor-default border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
              : 'border-white/15 bg-black/60 text-zinc-100 hover:bg-black/80'
            }`}
          >
            {savedAsModel ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            <span>{savedAsModel ? 'Saved to Bank' : 'Save to Bank'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-black/80"
        >
          <Download className="h-3 w-3" />
          <span>Download image</span>
        </button>
      </div>
    </div>
  )
}

// Auto-generate a real first name when the user opens the inline save
// input. Pool is keyed off the profile's gender field and chosen at
// random so two consecutive saves rarely collide; the user can still
// edit the draft before committing. Falls back to a unisex pool when
// gender is empty or unrecognised.
const FEMALE_NAMES = [
  'Ava', 'Olivia', 'Mia', 'Sophia', 'Isabella', 'Emma', 'Amelia', 'Harper',
  'Evelyn', 'Charlotte', 'Lily', 'Chloe', 'Zoe', 'Ella', 'Maya', 'Aria',
  'Nora', 'Luna', 'Hazel', 'Ivy', 'Stella', 'Aurora', 'Violet', 'Penelope',
  'Ruby', 'Sadie', 'Camila', 'Layla', 'Naomi', 'Sienna', 'Willow', 'Riley',
  'Quinn', 'Eloise', 'Iris', 'Juniper', 'Maeve', 'Nova', 'Sage', 'Wren',
]
const MALE_NAMES = [
  'Liam', 'Noah', 'Oliver', 'Elijah', 'Lucas', 'Mason', 'Logan', 'Ethan',
  'James', 'Aiden', 'Jack', 'Levi', 'Benjamin', 'Henry', 'Sebastian', 'Owen',
  'Daniel', 'Caleb', 'Wyatt', 'Julian', 'Leo', 'Hudson', 'Theo', 'Nathan',
  'Isaac', 'Asher', 'Eli', 'Carter', 'Miles', 'Felix', 'Silas', 'Atlas',
  'Kai', 'Jude', 'Ezra', 'August', 'Beckett', 'Rowan', 'Finn', 'Arlo',
]
const UNISEX_NAMES = [
  'Riley', 'Quinn', 'Avery', 'Rowan', 'Sage', 'River', 'Sky', 'Reese',
  'Phoenix', 'Wren', 'Blake', 'Cameron', 'Drew', 'Ellis', 'Finley', 'Hayden',
  'Jordan', 'Kai', 'Lennon', 'Morgan', 'Nico', 'Parker', 'Remy', 'Sasha',
  'Tatum', 'Wesley', 'Charlie', 'Emerson', 'Frankie', 'Indigo',
]

function autoName(item: CharacterHistoryItem): string {
  const g = (item.profile.gender || '').toLowerCase()
  const pool =
    g.startsWith('f') || g.includes('woman') ? FEMALE_NAMES :
    g.startsWith('m') && !g.startsWith('mx') ? MALE_NAMES :
    UNISEX_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
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
