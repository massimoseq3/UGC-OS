import type { BrollResult, PromptVariation, CardState, ReferenceImage, BrollMode, OneShotResult, OneShotCardState, AnimatedResult, AnimatedSelection, AnimatedFrameCardState, AnimatedClipCardState } from '../types'
import type { Product, Model, BrollHistoryItem } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { usePersistedState, useProjectScopedKey } from '../../../hooks/usePersistedState'
import ScenesView from './ScenesView'
import OneShotView from './OneShotView'
import AnimatedView from './AnimatedView'
import BrollHistoryView from './BrollHistoryView'
import SegmentedToggle from '../../../components/SegmentedToggle'

interface RightPanelProps {
  mode: BrollMode
  result: BrollResult | null
  oneShotResult: OneShotResult | null
  oneShotModelId: string
  oneShotCardStates: Record<string, OneShotCardState>
  setOneShotCardStates: React.Dispatch<React.SetStateAction<Record<string, OneShotCardState>>>
  onAddOneShotVariation: () => void
  isAddingVariation?: boolean
  // Animated mode (keyframe chain) state — owned by BrollStudio, like One Shot.
  animatedResult: AnimatedResult | null
  animatedModelId: string
  animatedFrameStates: Record<string, AnimatedFrameCardState>
  setAnimatedFrameStates: React.Dispatch<React.SetStateAction<Record<string, AnimatedFrameCardState>>>
  animatedClipStates: Record<string, AnimatedClipCardState>
  setAnimatedClipStates: React.Dispatch<React.SetStateAction<Record<string, AnimatedClipCardState>>>
  animatedSelections: Record<string, AnimatedSelection>
  setAnimatedSelections: React.Dispatch<React.SetStateAction<Record<string, AnimatedSelection>>>
  onAddAnimatedConcept: (frameIndex: number) => void
  addingConceptFrame: number | null
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
}

type Tab = 'scenes' | 'history'

// Right side of the B-Roll workspace. Owns the tab strip (Scenes / History)
// and the persisted per-card state. Image / video settings now live INSIDE
// each card's state — the page no longer has a global settings popover.
export default function RightPanel(props: RightPanelProps) {
  const {
    mode,
    result,
    oneShotResult,
    oneShotModelId,
    oneShotCardStates,
    setOneShotCardStates,
    onAddOneShotVariation,
    isAddingVariation,
    animatedResult,
    animatedModelId,
    animatedFrameStates,
    setAnimatedFrameStates,
    animatedClipStates,
    setAnimatedClipStates,
    animatedSelections,
    setAnimatedSelections,
    onAddAnimatedConcept,
    addingConceptFrame,
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
  } = props

  const baseKey = useProjectScopedKey('broll-studio')
  const [tab, setTab] = usePersistedState<Tab>(`${baseKey}:rightTab`, 'scenes')

  const brollHistory = useBankStore((s) => s.brollHistory)
  const deleteBrollHistory = useBankStore((s) => s.deleteBrollHistory)

  const isOneShot = mode === 'oneshot'
  const isAnimated = mode === 'animated'
  const sceneCount = isOneShot
    ? (oneShotResult?.concepts.length ?? 0)
    : isAnimated
      ? (animatedResult?.scenes.length ?? 0)
      : (result?.scenes.length ?? 0)
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
            { value: 'scenes', label: isOneShot ? 'Variations' : isAnimated ? 'Storyboard' : 'Scenes', badge: sceneCount > 0 ? sceneCount : undefined },
            { value: 'history', label: 'History', badge: historyCount > 0 ? historyCount : undefined },
          ]}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'scenes' && isAnimated ? (
          <AnimatedView
            result={animatedResult}
            isGenerating={isGenerating}
            error={error}
            characterRef={characterRef}
            productRef={productRef}
            selectedModel={selectedModel}
            selectedProduct={selectedProduct}
            animatedModelId={animatedModelId}
            frameStates={animatedFrameStates}
            setFrameStates={setAnimatedFrameStates}
            clipStates={animatedClipStates}
            setClipStates={setAnimatedClipStates}
            selections={animatedSelections}
            setSelections={setAnimatedSelections}
            onAddConcept={onAddAnimatedConcept}
            addingConceptFrame={addingConceptFrame}
          />
        ) : tab === 'scenes' && isOneShot ? (
          <OneShotView
            result={oneShotResult}
            isGenerating={isGenerating}
            error={error}
            characterRef={characterRef}
            productRef={productRef}
            selectedModel={selectedModel}
            selectedProduct={selectedProduct}
            productName={selectedProduct?.productName}
            productContext={productContext}
            modelContext={modelContext}
            oneShotModelId={oneShotModelId}
            cardStates={oneShotCardStates}
            setCardStates={setOneShotCardStates}
            onAddVariation={onAddOneShotVariation}
            isAddingVariation={isAddingVariation}
          />
        ) : tab === 'scenes' ? (
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
