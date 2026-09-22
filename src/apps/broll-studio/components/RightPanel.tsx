import { useMemo } from 'react'
import { Film } from 'lucide-react'
import type { BrollResult, PromptVariation, CardState, ReferenceImage, BrollMode, ContinuousResult, ContinuousSelection, ContinuousFrameCardState, ContinuousClipCardState } from '../types'
import type { Product, Model, BrollHistoryItem } from '../../../stores/types'
import type { ContinuousStoryboardOp } from '../continuousEdits'
import { useBankStore } from '../../../stores/bankStore'
import { useHistoryRailOpen } from '../../../hooks/useHistoryRailOpen'
import ScenesView from './ScenesView'
import ContinuousView from './ContinuousView'
import HistoryRail from './HistoryRail'
import RailOverlay from '../../../components/RailOverlay'
import HistoryRailToggle from '../../../components/HistoryRailToggle'
import { brollHistoryMode, isRetiredOneShotRow } from './brollHistoryRows'
import GridCanvas, { AwaitingBody } from '../../../components/GridCanvas'
import { useVisibleRows } from '../../../stores/recordingStore'
import type { CardFilter } from '../cardLens'

interface RightPanelProps {
  mode: BrollMode
  // False when Continuous is switched off in Settings → Experimental. It hides
  // Continuous sessions from History (there's no mode left to open one in — the
  // rule the retired One-Shot rows already follow) and drops the "Line by Line"
  // qualifier from the Storyboard tab, which only existed to tell the two
  // storyboards apart. Nothing is deleted; the rows come back with the switch.
  continuousEnabled: boolean
  result: BrollResult | null
  // Continuous mode (keyframe chain) state — owned by BrollStudio.
  continuousResult: ContinuousResult | null
  continuousModelId: string
  continuousFrameStates: Record<string, ContinuousFrameCardState>
  setContinuousFrameStates: React.Dispatch<React.SetStateAction<Record<string, ContinuousFrameCardState>>>
  continuousClipStates: Record<string, ContinuousClipCardState>
  setContinuousClipStates: React.Dispatch<React.SetStateAction<Record<string, ContinuousClipCardState>>>
  continuousSelections: Record<string, ContinuousSelection>
  setContinuousSelections: React.Dispatch<React.SetStateAction<Record<string, ContinuousSelection>>>
  onAddContinuousConcept: (frameIndex: number) => void
  onEditContinuousStoryboard: (op: ContinuousStoryboardOp) => void
  isGenerating?: boolean
  error?: string | null
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  onEditSceneLine?: (sceneNumber: number, line: string) => void
  onUpdateVoiceProfile?: (text: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  productPhotos?: string[]
  onChangeStyle?: () => void
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
  // Canvas-clear state, owned by BrollStudio so the left panel's "New" can
  // trigger it too. Never touches generated data — the session stays a History
  // row — but the app's handler DOES reset the setup column alongside the
  // canvas, which is why the rail's New button arms first.
  canvasCleared: boolean
  onClearCanvas: () => void
  cardFilter?: CardFilter
  onCardFilterChange?: (filter: CardFilter) => void
}

// Right side of the B-Roll workspace. Owns the History rail beside the
// storyboard and the persisted per-card state. Image / video settings live
// INSIDE each card's state — the page has no global settings popover.
export default function RightPanel(props: RightPanelProps) {
  const {
    mode,
    continuousEnabled,
    result,
    continuousResult,
    continuousModelId,
    continuousFrameStates,
    setContinuousFrameStates,
    continuousClipStates,
    setContinuousClipStates,
    continuousSelections,
    setContinuousSelections,
    onAddContinuousConcept,
    onEditContinuousStoryboard,
    isGenerating,
    error,
    onAddVariation,
    onDeleteVariation,
    onEditSceneLine,
    onUpdateVoiceProfile,
    characterRef,
    productRef,
    productPhotos,
    onChangeStyle,
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
    canvasCleared,
    onClearCanvas,
    cardFilter,
    onCardFilterChange,
  } = props

  // Whether the rail is showing. Always shut on arrival, and never stored —
  // clicking into this app should land on the clips, not on a panel sitting
  // over them. See `hooks/useHistoryRailOpen`.
  const [historyOpen, setHistoryOpen] = useHistoryRailOpen()

  // Recording Mode hides the sessions that existed when it was armed; a
  // replayed Generate brings the open one back.
  const allHistory = useVisibleRows(useBankStore((s) => s.brollHistory), 'broll')
  const deleteBrollHistory = useBankStore((s) => s.deleteBrollHistory)
  // Sessions there's no mode left to open stay on disk but aren't listed: the
  // retired One-Shot rows always, and the Continuous ones while that mode is
  // switched off. Filtered here so the tab's count and the list below agree.
  const brollHistory = useMemo(
    () => allHistory.filter((it) => (
      !isRetiredOneShotRow(it) && (continuousEnabled || brollHistoryMode(it) !== 'continuous')
    )),
    [allHistory, continuousEnabled],
  )

  const isContinuous = mode === 'continuous'
  const sceneCount = isContinuous
    ? (continuousResult?.scenes.length ?? 0)
    : (result?.scenes.length ?? 0)

  // "Clear the canvas" — the header's + and the left panel's New both empty the
  // storyboard so the last session isn't on camera while a new one is filmed.
  // Nothing is deleted (the session is a History row); the state lives in
  // BrollStudio because New fires from the other column.
  const cleared = !isGenerating && sceneCount > 0 && canvasCleared

  // The grid canvas marks a stage with nothing on it yet. Once the storyboard
  // renders, it goes — behind a wall of cards it's just noise.
  const showCanvas = cleared || !!isGenerating || sceneCount === 0

  // The toggle rides INSIDE the storyboard's own bar rather than in a column of
  // its own (September 2026, Massimo's call): a column narrowed the storyboard
  // by ~135px and left the button standing on bare panel beside a frosted bar.
  // In the bar, that glass runs under it and the storyboard keeps its width.
  //
  // It stays put while the rail is open, behind the catcher: pressing it there
  // dismisses the rail, so the one control reads as a toggle either way. (It
  // used to be swapped for a 24px spacer holding the lip's width — the lip went
  // with the column shape; see `components/RailOverlay`.)
  //
  // It rides the bar at EVERY width, a phone included. It used to stand in a
  // band of its own under `md` (`hidden md:block` here against `md:hidden` on
  // the band below), from when neither strip could take one more pill there —
  // the Continuous strip wrapped and the Line-by-Line one scrolled. Both have
  // moved on: Continuous is one scrolling line, and Line-by-Line WRAPS, so a
  // 38px circle leads its first row like any other pill. Kept apart, a phone
  // spent a whole 57px band on one icon over a two-row bar, and Continuous drew
  // its own band there EMPTY (it carries nothing but this toggle).
  const railToggle = (
    <HistoryRailToggle
      open={historyOpen}
      onToggle={() => setHistoryOpen(!historyOpen)}
      showLabel
      count={brollHistory.length}
    />
  )

  return (
    // NO header band on this pane. It held a Storyboard / History
    // `SegmentedToggle` and the canvas reset; History is a rail beside the
    // storyboard now and the reset leads that rail, which left 57px saying
    // nothing over the one thing this column is for.
    // `relative` is what `RailOverlay` positions against — without it the rail
    // escapes this pane and lands over the dock.
    <div className="relative flex h-full min-h-0">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* The fallback for when there is no storyboard bar to carry the
            toggle — empty, cleared or still being written. It is the same
            `h-[57px]` band that bar is, hairline and all, so the pane reads
            identically whichever of the two is carrying the button; it stood in
            a stub column on the right before (which narrowed the storyboard by
            ~135px to hold one button and put the way into the list at the far
            end of the pane) and floated over the canvas for an hour after that.
            With a storyboard up the bar has it, at every width — see the note
            on `railToggle`. */}
        {showCanvas && (
          <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5">
            <HistoryRailToggle
              open={historyOpen}
              onToggle={() => setHistoryOpen(!historyOpen)}
              showLabel
              count={brollHistory.length}
            />
          </div>
        )}
        {/* The storyboard works on the same graph-paper canvas as the other
            apps' output panels. History keeps the plain surface — it's the
            reel, not the stage. */}
        <CanvasFrame active={showCanvas}>
        {cleared ? (
          <AwaitingBody
            icon={Film}
            title="Awaiting Storyboard"
            hint="Your next storyboard lands here. Nothing was deleted. This session is saved in History."
          />
        ) : isContinuous ? (
          <ContinuousView
            result={continuousResult}
            isGenerating={isGenerating}
            error={error}
            characterRef={characterRef}
            productRef={productRef}
            productPhotos={productPhotos}
            onChangeStyle={onChangeStyle}
            onOpenCharacterPicker={onOpenCharacterPicker}
            selectedModel={selectedModel}
            selectedProduct={selectedProduct}
            productContext={productContext}
            modelContext={modelContext}
            continuousModelId={continuousModelId}
            frameStates={continuousFrameStates}
            setFrameStates={setContinuousFrameStates}
            clipStates={continuousClipStates}
            setClipStates={setContinuousClipStates}
            selections={continuousSelections}
            setSelections={setContinuousSelections}
            onAddConcept={onAddContinuousConcept}
            onEditStoryboard={onEditContinuousStoryboard}
            railToggle={railToggle}
          />
        ) : (
          <ScenesView
            result={result}
            isGenerating={isGenerating}
            error={error}
            onAddVariation={onAddVariation}
            onDeleteVariation={onDeleteVariation}
            onEditSceneLine={onEditSceneLine}
            onUpdateVoiceProfile={onUpdateVoiceProfile}
            characterRef={characterRef}
            productRef={productRef}
            productPhotos={productPhotos}
            onChangeStyle={onChangeStyle}
            selectedProduct={selectedProduct}
            selectedModel={selectedModel}
            selectedProductId={selectedProductId}
            selectedModelId={selectedModelId}
            selectedScriptId={selectedScriptId}
            productContext={productContext}
            modelContext={modelContext}
            onOpenCharacterPicker={onOpenCharacterPicker}
            onOpenProductPicker={onOpenProductPicker}
            cardFilter={cardFilter}
            onCardFilterChange={onCardFilterChange}
            cardStates={cardStates}
            setCardStates={setCardStates}
            railToggle={railToggle}
          />
        )}
        </CanvasFrame>
      </div>

      <RailOverlay open={historyOpen} onClose={() => setHistoryOpen(false)}>
        <HistoryRail
          items={brollHistory}
          activeId={activeHistoryId}
          onSelect={(item) => {
            onSelectHistory(item)
            // The rail covers the storyboard, so picking a session is a request
            // to see it.
            setHistoryOpen(false)
          }}
          onDelete={(id) => { deleteBrollHistory(id) }}
          onNew={() => {
            onClearCanvas()
            // The rail covers the storyboard it just cleared, so New hands the
            // pane back the same way picking a session does.
            setHistoryOpen(false)
          }}
        />
      </RailOverlay>
    </div>
  )
}

// The storyboard column, with or without the grid behind it. Both branches keep
// the same flex shape so toggling the canvas never reflows the view.
function CanvasFrame({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (active) return <GridCanvas>{children}</GridCanvas>
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>
}
