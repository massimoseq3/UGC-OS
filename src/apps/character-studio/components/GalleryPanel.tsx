import { useMemo, useRef, useState, useEffect } from 'react'
import { Loader2, Trash2, Image as ImageIcon, UserRound, Bookmark, X, Download, Check, LayoutGrid } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrlState } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import type { CharacterHistoryItem } from '../../../stores/types'
import GenerationProgress from '../../../components/GenerationProgress'
import GeneratingBackdrop from '../../../components/GeneratingBackdrop'
import { getModel, type ImageResolution } from '../../../utils/models'
import HistoryPreviewModal from './HistoryPreviewModal'
import { buildJsonPrompt } from '../services/generateCharacter'
import { downloadImage } from '../../../utils/downloadImage'

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
  // Portrait vs character-sheet generation (undefined → portrait, pre-sheet entries).
  kind?: 'portrait' | 'sheet'
  // The CharacterProfile snapshot to write into characterHistory on success.
  // Typed as Record<string, string> to avoid an import cycle through types.
  profile?: Record<string, string>
}

interface GalleryPanelProps {
  inFlight: InFlightCharacterGen[]
  onCancelGen: (id: string) => void
}

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
}: GalleryPanelProps) {
  const [previewItem, setPreviewItem] = useState<CharacterHistoryItem | null>(null)

  const characterHistory = useBankStore((s) => s.characterHistory)
  const deleteCharacterHistory = useBankStore((s) => s.deleteCharacterHistory)

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
            <ImageIcon className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
            <p className="text-sm text-ink-500">No generations yet</p>
            <p className="max-w-[300px] text-xs leading-relaxed text-ink-600">
              Configure parameters on the left and hit Generate.
              Every influencer you make lands here, sorted by day.
            </p>
          </div>
        ) : (
          <div className="px-4 py-3">
            {inFlight.length > 0 && (
              <>
                <DayPill label={inFlight.length === 1 ? 'In progress' : `In progress · ${inFlight.length}`} />
                <div className="grid grid-cols-2 gap-2 [grid-auto-flow:dense] lg:grid-cols-3">
                  {inFlight.map((gen) => (
                    <div key={gen.id} className={isWide(gen.aspectRatio) ? 'col-span-2 lg:col-span-3' : ''}>
                      <InFlightTile gen={gen} onCancel={() => onCancelGen(gen.id)} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {dayGroups.map(([dayTs, items]) => (
              <div key={dayTs}>
                <DayPill label={dayLabel(dayTs)} />
                <div className="grid grid-cols-2 gap-2 [grid-auto-flow:dense] lg:grid-cols-3">
                  {items.map((item) => (
                    <div key={item.id} className={isWide(item.aspectRatio) ? 'col-span-2 lg:col-span-3' : ''}>
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
  // Matches the date pills in the Scripts / Voiceovers history lists.
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[11px] font-medium text-ink-300">
        {label}
      </span>
    </div>
  )
}

// Horizontal (16:9) outputs — character sheets or landscape portraits — claim
// a full grid row instead of a single column so the wide frame stays readable.
function isWide(ar: string): boolean {
  return ar.includes('16:9')
}

function aspectStyle(ar: string): React.CSSProperties {
  if (ar.includes('16:9')) return { aspectRatio: '16 / 9' }
  if (ar.includes('1:1')) return { aspectRatio: '1 / 1' }
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
  const deleteModel = useBankStore((s) => s.deleteModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const models = useBankStore((s) => s.models)
  const addToast = useAppStore((s) => s.addToast)
  const [savingToBank, setSavingToBank] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  const isSheet = item.kind === 'sheet'
  const linkedModel = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId) : undefined
  // Portraits and sheets alike save as their own Bank entry, tracked by
  // linkedModelId — once saved the tile shows the Saved/attached state.
  const savedAsModel = !!linkedModel
  // The AI model that produced this image, shown as a small caption beneath the
  // tile (mirrors the B-Roll A-Roll/B-Roll label). Older entries may predate the
  // stamped modelId — fall back to the raw id, or render nothing if absent.
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId

  useEffect(() => {
    if (nameDraft !== null) {
      const id = window.setTimeout(() => nameInputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [nameDraft])

  function openNameInput(e: React.MouseEvent) {
    e.stopPropagation()
    if (savingToBank) return
    setNameDraft(autoName(item))
  }

  // Toggle: clicking the Save button when already saved removes the linked Bank
  // entry (keeping this gallery image) so it can be re-saved afterwards.
  async function toggleSave(e: React.MouseEvent) {
    e.stopPropagation()
    if (savingToBank) return
    if (!savedAsModel) { openNameInput(e); return }
    setSavingToBank(true)
    try {
      if (linkedModel) await deleteModel(linkedModel.id)
      await updateCharacterHistory(item.id, { linkedModelId: undefined })
    } catch (err) {
      addToast(humanizeError(err, 'Failed to remove from Bank'), 'error')
    } finally {
      setSavingToBank(false)
    }
  }

  async function commitSave() {
    const name = (nameDraft ?? '').trim()
    if (!name || savingToBank) return
    setSavingToBank(true)
    try {
      await addModel({
        name,
        characterImage: item.imageRef,
        // A saved sheet doubles as its own reference, so stamp it as the
        // entry's sheetImage too — downstream apps prefer it for consistency.
        ...(isSheet ? { sheetImage: item.imageRef } : {}),
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
      addToast(humanizeError(err, 'Save failed'), 'error')
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
    await downloadImage(resolved, `${isSheet ? 'character-sheet' : 'influencer'}-${item.id}`)
  }

  return (
    <div>
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-ink/10 bg-black light:bg-zinc-200 transition-all hover:border-ink/20 hover:-translate-y-0.5 card-soft-shadow"
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

      {isSheet ? (
        <div
          title={savedAsModel ? 'Sheet saved to Influencers bank' : 'Character sheet'}
          className={`absolute left-1.5 top-1.5 flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-medium backdrop-blur ${
            savedAsModel ? 'bg-emerald-500/30 text-emerald-100' : 'bg-black/60 text-zinc-200'
          }`}
        >
          <LayoutGrid className="h-3 w-3" strokeWidth={2} />
          Sheet
          {savedAsModel && <Check className="h-3 w-3" strokeWidth={2.5} />}
        </div>
      ) : savedAsModel && (
        <div
          title="Saved to Influencers bank"
          className="absolute left-1.5 top-1.5 flex h-6 items-center gap-1 rounded-full bg-emerald-500/30 px-2 text-[9px] font-medium text-emerald-100 backdrop-blur"
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
          className={`flex h-8 items-center justify-center gap-1 rounded-full border px-2 backdrop-blur transition-colors disabled:cursor-wait ${
            confirmingDelete
              ? 'border-red-400/60 bg-red-500/45 text-red-50'
              : 'border-white/20 bg-black/35 text-white hover:bg-red-500/30 hover:text-red-100 hover:border-red-400/40 disabled:hover:bg-black/35 disabled:hover:text-white'
          }`}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {confirmingDelete && !deleting && <span className="text-[9px] font-medium uppercase tracking-wider">Confirm</span>}
        </button>
      </div>

      {/* Bottom hover actions — round icon buttons bottom-right, matching the
          B-Roll tile cluster. The inline name input takes over the bottom edge
          while a save is being named (portraits and sheets alike). */}
      {nameDraft !== null ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/70 py-1 pl-2.5 pr-1 backdrop-blur"
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
            placeholder="Name this influencer"
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
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <TileIconButton
            title={savedAsModel ? 'Saved — click to remove from Bank' : savingToBank ? 'Saving…' : 'Save to Bank'}
            tone={savedAsModel ? 'saved' : 'default'}
            onClick={toggleSave}
          >
            {savingToBank ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAsModel ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </TileIconButton>
          <TileIconButton title="Download image" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </TileIconButton>
        </div>
      )}
    </div>
    {modelLabel && (
      <p className="mt-1 truncate text-center text-[10px] font-medium tracking-wider text-ink-500">
        {modelLabel}
      </p>
    )}
    </div>
  )
}

// Round 32px hover icon button — mirrors the B-Roll tile cluster so gallery
// tiles read the same across apps.
function TileIconButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-400/50 bg-emerald-500/30 text-emerald-100'
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
  const isSheet = gen.kind === 'sheet'
  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-influencers-500/20"
      style={aspectStyle(gen.aspectRatio)}
    >
      <GeneratingBackdrop family="influencers" />
      <div className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-influencers-100 backdrop-blur-sm">
        {isSheet ? <LayoutGrid className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </div>
      <button
        type="button"
        title="Cancel"
        onClick={onCancel}
        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white opacity-0 backdrop-blur transition-opacity hover:bg-red-500/30 hover:text-red-100 hover:border-red-400/40 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-[10px] font-medium text-influencers-100">{modelLabel}</p>
        <GenerationProgress
          isActive
          color="bg-influencers-500"
          showHelper={false}
          messages={isSheet ? [
            'Sending request...',
            'Laying out the panels...',
            'Matching the face across views...',
            'Finalizing the sheet...',
          ] : [
            'Sending request...',
            'Composing the influencer...',
            'Rendering details...',
            'Finalizing the frame...',
          ]}
          className="max-w-[180px]"
        />
      </div>
    </div>
  )
}

