import type { BrollResult, PromptVariation, CardState, ReferenceImage } from '../types'
import type { Product, Model, BrollHistoryItem } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { usePersistedState, useProjectScopedKey } from '../../../hooks/usePersistedState'
import ScenesView from './ScenesView'
import BrollHistoryView from './BrollHistoryView'
import SegmentedToggle from '../../../components/SegmentedToggle'

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
  // Session-wide dialogue-voice directive (null when unset) — appended to
  // DIALOGUE cards' video prompts at generation time.
  voiceDirective?: string | null
  // Visual style id (services/style.ts) — swaps the deterministic suffix and
  // grounds the per-card prompt-rewrite LLM calls.
  videoStyleId?: string
  customVideoStyle?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  cardStates: Record<string, CardState>
  setCardStates: React.Dispatch<React.SetStateAction<Record<string, CardState>>>
  activeHistoryId: string | null
  onSelectHistory: (item: BrollHistoryItem) => void
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
    voiceDirective,
    videoStyleId,
    customVideoStyle,
    onOpenCharacterPicker,
    onOpenProductPicker,
    cardStates,
    setCardStates,
    activeHistoryId,
    onSelectHistory,
  } = props

  const baseKey = useProjectScopedKey('broll-studio')
  const [tab, setTab] = usePersistedState<Tab>(`${baseKey}:rightTab`, 'scenes')

  const brollHistory = useBankStore((s) => s.brollHistory)
  const deleteBrollHistory = useBankStore((s) => s.deleteBrollHistory)

  const sceneCount = result?.scenes.length ?? 0
  const historyCount = brollHistory.length

  return (
    <div className="flex h-full flex-col">
      {/* Toggle strip — no global Settings popover anymore: each card owns its
          own settings inside its detail modal. */}
      <div className="flex h-[57px] items-center border-b border-ink/5 px-5">
        <SegmentedToggle<Tab>
          className="h-10 !p-1 min-w-0"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'scenes', label: 'Scenes', badge: sceneCount > 0 ? sceneCount : undefined },
            { value: 'history', label: 'History', badge: historyCount > 0 ? historyCount : undefined },
          ]}
        />
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
            voiceDirective={voiceDirective}
            videoStyleId={videoStyleId}
            customVideoStyle={customVideoStyle}
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
