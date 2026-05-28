import { X } from 'lucide-react'
import type { BrollResult, PromptVariation, CardState, ReferenceImage } from '../types'
import type { Product, Model, BrollHistoryItem } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { usePersistedState, useProjectScopedKey } from '../../../hooks/usePersistedState'
import { type ImageResolution } from '../../../utils/models'
import ScenesView from './ScenesView'
import BrollHistoryView from './BrollHistoryView'

interface RightPanelProps {
  result: BrollResult | null
  isGenerating?: boolean
  error?: string | null
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  productContext?: string
  modelContext?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  cardStates: Record<string, CardState>
  setCardStates: React.Dispatch<React.SetStateAction<Record<string, CardState>>>
  activeHistoryId: string | null
  onSelectHistory: (item: BrollHistoryItem) => void
  onClearOutput: () => void
}

type Tab = 'scenes' | 'history'

// Right side of the B-Roll workspace. Owns the tab strip (Scenes / History)
// and the persisted per-card state. Image / video settings now live INSIDE
// each card's state — the page no longer has a global settings popover.
export default function RightPanel(props: RightPanelProps) {
  const {
    result,
    isGenerating,
    error,
    onAddVariation,
    onDeleteVariation,
    characterRef,
    productRef,
    selectedProduct,
    selectedModel,
    selectedProductId,
    selectedModelId,
    selectedScriptId,
    productContext,
    modelContext,
    onOpenCharacterPicker,
    onOpenProductPicker,
    cardStates,
    setCardStates,
    activeHistoryId,
    onSelectHistory,
    onClearOutput,
  } = props

  const baseKey = useProjectScopedKey('broll-studio')
  const [tab, setTab] = usePersistedState<Tab>(`${baseKey}:rightTab`, 'scenes')

  const brollHistory = useBankStore((s) => s.brollHistory)
  const deleteBrollHistory = useBankStore((s) => s.deleteBrollHistory)

  const sceneCount = result?.scenes.length ?? 0
  const historyCount = brollHistory.length

  return (
    <div className="flex h-full flex-col">
      {/* Tab strip — no global Settings popover anymore: each card owns its
          own settings inside its detail modal. */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5">
        <div className="flex items-center gap-1">
          <TabButton active={tab === 'scenes'} onClick={() => setTab('scenes')}>
            Scenes
            {sceneCount > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {sceneCount}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            History
            {historyCount > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {historyCount}
              </span>
            )}
          </TabButton>
        </div>
        {tab === 'scenes' && result && (
          <button
            onClick={onClearOutput}
            title="Clear inputs and scenes. This session stays in the History tab."
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'scenes' ? (
          <ScenesView
            result={result}
            isGenerating={isGenerating}
            error={error}
            onAddVariation={onAddVariation}
            onDeleteVariation={onDeleteVariation}
            characterRef={characterRef}
            productRef={productRef}
            selectedProduct={selectedProduct}
            selectedModel={selectedModel}
            selectedProductId={selectedProductId}
            selectedModelId={selectedModelId}
            selectedScriptId={selectedScriptId}
            productContext={productContext}
            modelContext={modelContext}
            onOpenCharacterPicker={onOpenCharacterPicker}
            onOpenProductPicker={onOpenProductPicker}
            cardStates={cardStates}
            setCardStates={setCardStates}
          />
        ) : (
          <BrollHistoryView
            items={brollHistory}
            activeId={activeHistoryId}
            onSelect={(item) => {
              onSelectHistory(item)
              setTab('scenes')
            }}
            onDelete={(id) => { deleteBrollHistory(id) }}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? 'bg-zinc-100' : 'bg-transparent'
        }`}
      />
    </button>
  )
}

// Backfill new fields on legacy persisted card entries so older B-Roll runs
// keep working after this rev. Defaults match what createDefaultCardState
// produces for a fresh variation. Exported so BrollStudio's sanitize hook
// shares the same logic when hoisting cardStates up.
export function backfillCardState(card: Partial<CardState> & Record<string, unknown>): CardState {
  const editablePrompt = (card.editablePrompt as string) ?? ''
  const promptHistory = Array.isArray(card.promptHistory) && (card.promptHistory as string[]).length > 0
    ? (card.promptHistory as string[])
    : [editablePrompt]
  const promptHistoryIndex = typeof card.promptHistoryIndex === 'number'
    ? Math.max(0, Math.min(card.promptHistoryIndex as number, promptHistory.length - 1))
    : promptHistory.length - 1

  // Migrate legacy single `videoUrl` → first entry in `videos[]`. Earlier
  // sessions persisted exactly one video per card; on hydrate we lift it
  // into the new array shape so the user doesn't lose anything.
  const persistedVideos = Array.isArray(card.videos) ? (card.videos as CardState['videos']) : []
  const legacyVideoUrl = card.videoUrl as string | null | undefined
  const videos: CardState['videos'] = persistedVideos.length > 0
    ? persistedVideos
    : legacyVideoUrl
      ? [{
          url: legacyVideoUrl,
          modelId: (card.videoModelId as string | null) ?? '',
          prompt: (card.videoPrompt as string | null) ?? editablePrompt,
          aspectRatio: (card.videoAspectRatio as string | null) ?? '9:16',
          durationSeconds: (card.videoDurationSeconds as number | null) ?? 5,
          resolution: (card.videoResolution as string | null) ?? '720p',
          audio: (card.videoAudio as boolean | null) ?? true,
          mode: (card.videoMode as CardState['videoMode']) ?? 'text-to-video',
          sourceBRollId: card.videoSourceBRollId as string | undefined,
          createdAt: (card.videoStartedAt as number | null) ?? Date.now(),
        }]
      : []
  const currentVideoIndex = typeof card.currentVideoIndex === 'number'
    ? Math.max(0, Math.min(card.currentVideoIndex as number, Math.max(0, videos.length - 1)))
    : Math.max(0, videos.length - 1)
  const selected = (card.selected as CardState['selected']) ?? null

  return {
    editablePrompt,
    promptHistory,
    promptHistoryIndex,
    images: ((card.images as CardState['images']) ?? []).map((img) => ({
      ...img,
      // Legacy images persisted before iteration 3 didn't carry createdAt.
      // Backfill with "now" so they all land in the modal's "Today" bucket.
      createdAt: img.createdAt ?? Date.now(),
    })),
    currentImageIndex: (card.currentImageIndex as number) ?? 0,
    // Migrate legacy single-slot pending image into the new in-flight
    // array. Same with the in-flight video slot. After this hop the
    // resume effect drives both as parallel queues.
    inFlightImages: legacyInFlightImages(card),
    inFlightVideos: legacyInFlightVideos(card),
    videos,
    currentVideoIndex,
    selected,
    isGeneratingImage: !!card.isGeneratingImage,
    imageError: (card.imageError as string | null) ?? null,
    pendingTaskId: (card.pendingTaskId as string | null) ?? null,
    pendingModelId: (card.pendingModelId as string | null) ?? null,
    pendingStartedAt: (card.pendingStartedAt as number | null) ?? null,
    refsCharacter: card.refsCharacter !== false,
    refsProduct: card.refsProduct !== false,
    cardImageAspectRatio: (card.cardImageAspectRatio as string) ?? '9:16',
    cardImageResolution: (card.cardImageResolution as ImageResolution) ?? '1K',
    cardVideoAspectRatio: (card.cardVideoAspectRatio as string) ?? '9:16',
    cardVideoDurationSeconds: (card.cardVideoDurationSeconds as number) ?? 5,
    cardVideoResolution: (card.cardVideoResolution as string) ?? '720p',
    cardVideoAudio: card.cardVideoAudio !== false,
    isPromptWorking: false,
    promptError: null,
    videoStatus: (card.videoStatus as CardState['videoStatus']) ?? 'idle',
    videoUrl: (card.videoUrl as string | null) ?? null,
    videoError: (card.videoError as string | null) ?? null,
    videoTaskId: (card.videoTaskId as string | null) ?? null,
    videoModelId: (card.videoModelId as string | null) ?? null,
    videoEndpoint: card.videoEndpoint as CardState['videoEndpoint'],
    videoStartedAt: (card.videoStartedAt as number | null) ?? null,
    videoSourceBRollId: card.videoSourceBRollId as string | undefined,
    videoAspectRatio: (card.videoAspectRatio as string | null) ?? null,
    videoDurationSeconds: (card.videoDurationSeconds as number | null) ?? null,
    videoResolution: (card.videoResolution as string | null) ?? null,
    videoAudio: (card.videoAudio as boolean | null) ?? null,
    videoMode: (card.videoMode as CardState['videoMode']) ?? null,
    videoPrompt: (card.videoPrompt as string | null) ?? null,
  }
}

// Migrate the legacy single-slot pending-image fields onto the new
// inFlightImages array, preserving any persisted entries already in the
// new shape. Drops stale entries (>30 min) so refreshing doesn't try to
// resume a long-dead kie task.
function legacyInFlightImages(card: Partial<CardState> & Record<string, unknown>): CardState['inFlightImages'] {
  const STALE_MS = 30 * 60_000
  const persisted = Array.isArray(card.inFlightImages) ? (card.inFlightImages as CardState['inFlightImages']) : []
  const filtered = persisted.filter((e) => Date.now() - (e.startedAt ?? 0) < STALE_MS)
  if (filtered.length > 0) return filtered
  // Promote legacy single-slot pending into the array if it's fresh.
  const taskId = card.pendingTaskId as string | null | undefined
  const modelId = card.pendingModelId as string | null | undefined
  const startedAt = card.pendingStartedAt as number | null | undefined
  if (taskId && modelId && startedAt && Date.now() - startedAt < STALE_MS) {
    return [{
      id: 'legacy-image',
      taskId,
      modelId,
      startedAt,
      prompt: (card.editablePrompt as string) ?? '',
      aspectRatio: (card.cardImageAspectRatio as string) ?? '9:16',
      resolution: (card.cardImageResolution as string) ?? '1K',
    }]
  }
  return []
}

function legacyInFlightVideos(card: Partial<CardState> & Record<string, unknown>): CardState['inFlightVideos'] {
  const STALE_MS = 30 * 60_000
  const persisted = Array.isArray(card.inFlightVideos) ? (card.inFlightVideos as CardState['inFlightVideos']) : []
  const filtered = persisted.filter((e) => Date.now() - (e.startedAt ?? 0) < STALE_MS)
  if (filtered.length > 0) return filtered
  const taskId = card.videoTaskId as string | null | undefined
  const modelId = card.videoModelId as string | null | undefined
  const startedAt = card.videoStartedAt as number | null | undefined
  if (taskId && modelId && startedAt && Date.now() - startedAt < STALE_MS) {
    return [{
      id: 'legacy-video',
      taskId,
      modelId,
      endpoint: card.videoEndpoint as 'veo' | undefined,
      startedAt,
      prompt: (card.videoPrompt as string) ?? (card.editablePrompt as string) ?? '',
      mode: (card.videoMode as CardState['videoMode']) ?? 'text-to-video',
      aspectRatio: (card.videoAspectRatio as string) ?? '9:16',
      durationSeconds: (card.videoDurationSeconds as number) ?? 5,
      resolution: (card.videoResolution as string) ?? '720p',
      audio: (card.videoAudio as boolean) ?? true,
      sourceBRollId: card.videoSourceBRollId as string | undefined,
    }]
  }
  return []
}
