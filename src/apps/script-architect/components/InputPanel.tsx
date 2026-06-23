import { useState, type ComponentType } from 'react'
import { Package, Loader2, PenLine, ChevronRight, FileText, Clapperboard, RefreshCw, X, Film, UserRound } from 'lucide-react'
import type { Model, Product, Script } from '../../../stores/types'
import { WRITE_LENGTHS, WRITE_STYLE_META, type EditableProductContext, type ScriptMode, type WriteStyle, type WriteFormat, type WriteLength } from '../types'

// The cinematic 'prompt' format is single-clip-capped, so it only offers the
// durations a video model can render in one generation.
const PROMPT_LENGTHS: WriteLength[] = [10, 15]
import { useBankStore } from '../../../stores/bankStore'
import BankPicker from '../../../components/BankPicker'
import SegmentedToggle from '../../../components/SegmentedToggle'
import SlideOver from '../../../components/SlideOver'
import ClearAllButton from '../../../components/ClearAllButton'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'

function createEditableContext(product: Product): EditableProductContext {
  return {
    productDescription: product.productDescription,
    targetMarket: product.targetMarket,
    painPoints: product.painPoints,
    usps: product.usps,
    benefits: product.benefits,
    offer: product.offer,
    cta: product.cta,
  }
}

interface InputPanelProps {
  mode: ScriptMode
  onModeChange: (mode: ScriptMode) => void
  winningTranscript: string
  onTranscriptChange: (value: string) => void
  reversePrompt: string
  onReversePromptChange: (value: string) => void
  brief: string
  onBriefChange: (value: string) => void
  writeStyle: WriteStyle
  onWriteStyleChange: (value: WriteStyle) => void
  writeFormat: WriteFormat
  onWriteFormatChange: (value: WriteFormat) => void
  writeLength: WriteLength
  onWriteLengthChange: (value: WriteLength) => void
  selectedProduct: Product | null
  onProductSelect: (product: Product | null) => void
  selectedInfluencer: Model | null
  onInfluencerSelect: (model: Model | null) => void
  additionalContext: string
  onAdditionalContextChange: (value: string) => void
  onGenerate: (context: EditableProductContext | null) => void
  isGenerating: boolean
  highlightField?: string | null
  onClear: () => void
}

export default function InputPanel({
  mode,
  onModeChange,
  winningTranscript,
  onTranscriptChange,
  reversePrompt,
  onReversePromptChange,
  brief,
  onBriefChange,
  writeStyle,
  onWriteStyleChange,
  writeFormat,
  onWriteFormatChange,
  writeLength,
  onWriteLengthChange,
  selectedProduct,
  onProductSelect,
  selectedInfluencer,
  onInfluencerSelect,
  additionalContext,
  onAdditionalContextChange,
  onGenerate,
  isGenerating,
  highlightField,
  onClear,
}: InputPanelProps) {
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [influencerPickerOpen, setInfluencerPickerOpen] = useState(false)
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false)
  // Which big text box is open in the full-screen editor (null = none).
  const [expandedField, setExpandedField] = useState<null | 'brief' | 'transcript' | 'reverse'>(null)
  // Seed the editable context from a product that's already selected on mount
  // (persisted selection / history reload) so the "Edit product details"
  // dropdown is available immediately — not only after picking a new product.
  const [editableContext, setEditableContext] = useState<EditableProductContext | null>(
    () => (selectedProduct ? createEditableContext(selectedProduct) : null),
  )
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [styleSlideOpen, setStyleSlideOpen] = useState(false)
  // The script/scene picked from the bank for the remix / scene-rewrite source.
  // Editing the textarea clears it (reverts to the dashed picker), mirroring
  // the B-Roll reference cards.
  const [remixScript, setRemixScript] = useState<Script | null>(null)
  const [sceneScript, setSceneScript] = useState<Script | null>(null)
  // True once the user has actively picked a Script Style — flips the trigger
  // from a dashed "click to choose" affordance to a solid, accented outline.
  const [styleChosen, setStyleChosen] = useState(false)
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const updateProduct = useBankStore((s) => s.updateProduct)
  const openApp = useAppStore((s) => s.openApp)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const resolvedProductImage = useAssetUrl(selectedProduct?.productImage)
  const resolvedInfluencerImage = useAssetUrl(selectedInfluencer?.characterImage)
  // Cinematic master-prompt format: swaps the Script Style picker for an
  // Influencer picker and caps the length toggle to single-clip durations.
  const isPromptFormat = writeFormat === 'prompt'

  // Switching into the cinematic format clamps the length to a value a single
  // video generation can actually render (10s / 15s).
  const handleFormatChange = (f: WriteFormat) => {
    if (f === 'prompt' && writeLength !== 10 && writeLength !== 15) onWriteLengthChange(15)
    onWriteFormatChange(f)
  }

  // Slide-over footer actions. The edits already live in `editableContext`
  // (used for this generation), so "save for this script" just dismisses;
  // "update in bank" persists them back onto the saved product.
  const handleSaveForScript = () => {
    setDetailsOpen(false)
    addToast('Saved for this script')
  }
  const handleUpdateBank = async () => {
    if (!selectedProduct || !editableContext) return
    await updateProduct(selectedProduct.id, editableContext)
    setDetailsOpen(false)
    addToast('Product updated in bank', 'success')
  }

  // Rebuild the editable context whenever a different product is selected.
  // Done during render (prop-change sync) so it never setState-from-effect.
  const [prevProduct, setPrevProduct] = useState(selectedProduct)
  if (selectedProduct !== prevProduct) {
    setPrevProduct(selectedProduct)
    if (selectedProduct) {
      setEditableContext(createEditableContext(selectedProduct))
      setDetailsOpen(false)
    }
  }

  // Write New's brief is optional (an empty brief lets the model invent the
  // angle), so that mode only needs a selected product to generate.
  const sourceFilled = mode === 'write'
    ? true
    : mode === 'remix' ? winningTranscript.trim().length > 0 : reversePrompt.trim().length > 0
  const canGenerate = sourceFilled && selectedProduct !== null

  const handleOpenFinder = () => {
    sendToApp({ targetApp: 'finder', targetField: 'activeBank', data: 'products' })
    openApp('finder')
  }

  const handleOpenInfluencerFinder = () => {
    sendToApp({ targetApp: 'finder', targetField: 'activeBank', data: 'models' })
    openApp('finder')
  }

  const updateField = (field: keyof EditableProductContext, value: string) => {
    if (!editableContext) return
    setEditableContext({ ...editableContext, [field]: value })
  }

  // Bank pick → fill the source text AND remember the chosen item so the
  // picker card shows the filled state (routes by the active mode).
  const handleBankScriptSelect = (item: Script) => {
    if (mode === 'reverse-engineer') {
      onReversePromptChange(item.scriptText)
      setSceneScript(item)
    } else {
      onTranscriptChange(item.scriptText)
      setRemixScript(item)
    }
  }

  const generateLabel = mode === 'write'
    ? (writeFormat === 'prompt' ? 'Generate 3 Cinematic Concepts' : writeFormat === 'scenes' ? 'Generate 3 Scene Drafts' : 'Generate 3 Scripts')
    : mode === 'remix' ? 'Generate 3 Script Variations' : 'Generate Prompts'

  // Product picker — step 2 in every mode, but rendered in a different spot
  // for Write New (before the brief) than for the remix modes (after the
  // source text).
  const productSection = (
    <div className="mb-6">
      <StepLabel label="Product Context" />

      {selectedProduct ? (
        <div className="mt-2">
          {/* Whole-card-clickable — hitting any part of the populated
              product card opens the picker. The Change label is a hover
              affordance only. Sized to match the B-Roll reference pills. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setProductPickerOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProductPickerOpen(true) } }}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-4 py-3.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.04]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink/5">
              {resolvedProductImage ? (
                <img src={resolvedProductImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <Package className="h-5 w-5 text-ink-600" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium tracking-tight text-ink-200">
                {selectedProduct.productName}
              </span>
              <span className="truncate text-[11px] text-ink-500">Product</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-ink-500 group-hover:flex">
                <RefreshCw className="h-2.5 w-2.5" />
                Change
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onProductSelect(null) }}
                title="Remove product"
                aria-label="Remove product"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400 light:hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {editableContext && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-full border border-ink/10 bg-ink/[0.02] px-4 py-2.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.04]"
            >
              <div className="flex items-center gap-2">
                <PenLine className="h-3.5 w-3.5 text-scripts-400" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-ink-200">Edit product details for this script</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-400" strokeWidth={2} />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2">
          {products.length > 0 ? (
            <button
              onClick={() => setProductPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.02] px-4 py-3.5 text-left transition-colors hover:border-scripts-500/30 hover:bg-scripts-500/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <Package className="h-5 w-5 text-amber-400 light:text-amber-600" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ink-300">Select Product</span>
                <span className="text-xs text-ink-600">Choose from your Product Bank</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.02] px-4 py-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <Package className="h-5 w-5 text-ink-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-ink-500">No products yet</span>
                <button
                  onClick={handleOpenFinder}
                  className="text-left text-xs text-scripts-400 transition-colors hover:text-scripts-300"
                >
                  Add one in Bank
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Influencer picker — cinematic format only. Optional: its portrait rides
  // the Playground handoff as the @INFLUENCER reference so the face stays
  // consistent across the commercial. Mirrors the product card styling.
  const influencerSection = (
    <div className="mb-6">
      <StepLabel
        label="Influencer"
        tooltip="Optional. The influencer whose face stays consistent across the commercial — their portrait is sent to Playground as the @INFLUENCER reference."
      />

      {selectedInfluencer ? (
        <div className="mt-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setInfluencerPickerOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInfluencerPickerOpen(true) } }}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-4 py-3.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.04]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink/5">
              {resolvedInfluencerImage ? (
                <img src={resolvedInfluencerImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-5 w-5 text-ink-600" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium tracking-tight text-ink-200">
                {selectedInfluencer.name}
              </span>
              <span className="truncate text-[11px] text-ink-500">Influencer</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-ink-500 group-hover:flex">
                <RefreshCw className="h-2.5 w-2.5" />
                Change
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInfluencerSelect(null) }}
                title="Remove influencer"
                aria-label="Remove influencer"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400 light:hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {models.length > 0 ? (
            <button
              onClick={() => setInfluencerPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.02] px-4 py-3.5 text-left transition-colors hover:border-scripts-500/30 hover:bg-scripts-500/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-scripts-500/10">
                <UserRound className="h-5 w-5 text-scripts-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ink-300">Select Influencer</span>
                <span className="text-xs text-ink-600">Optional · adds a consistent face</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.02] px-4 py-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
                <UserRound className="h-5 w-5 text-ink-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-ink-500">No influencers yet</span>
                <button
                  onClick={handleOpenInfluencerFinder}
                  className="text-left text-xs text-scripts-400 transition-colors hover:text-scripts-300"
                >
                  Add one in Bank
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col md:h-full">
      {/* Mode toggle — rounded segmented pill, mirrored by the Output/History
          toggle in the right panel so both strips share the same baseline. */}
      <div className="flex shrink-0 items-center px-5 pb-2 pt-4">
        <SegmentedToggle<ScriptMode>
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'write', label: 'Write New', icon: PenLine },
            { value: 'remix', label: 'Remix Script', icon: FileText },
            { value: 'reverse-engineer', label: 'Remix Scenes', icon: Clapperboard },
          ]}
        />
      </div>

      {/* Scrollable inputs — a flex column so step 1's textarea can absorb
          leftover height (same expand-don't-scroll pattern as Playground).
          Tight top padding so the first section sits close to the toggle. */}
      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 pt-2">
        {mode === 'write' ? (
          <>
            {/* Output — the sub-mode. It governs the form below (Style vs
                Influencer picker, the length options, the artifact), so it
                leads, right under the mode toggle. The page-level Clear All
                rides this row. */}
            <div className="mb-6">
              <div className="flex items-center justify-between gap-2">
                <StepLabel label="Output" />
                <ClearAllButton onClear={onClear} />
              </div>
              {/* House pill sized to match the Influencers Portrait/Character
                  Sheet toggle (h-12, p-1). */}
              <div className="mt-2">
                <SegmentedToggle<WriteFormat>
                  className="h-12 !p-1"
                  value={writeFormat}
                  onChange={handleFormatChange}
                  options={[
                    { value: 'script', label: 'Script', icon: FileText },
                    { value: 'scenes', label: 'Scenes', icon: Clapperboard },
                    { value: 'prompt', label: 'Cinematic', icon: Film },
                  ]}
                />
              </div>
            </div>

            {/* Product */}
            {productSection}

            {/* Cinematic format swaps the Script Style picker for an Influencer
                picker — an optional consistent face for the @INFLUENCER ref. */}
            {isPromptFormat && influencerSection}

            {/* Script Style — heading + the full-size pill button, above the
                brief. Tapping the button opens the style picker slide-over.
                Hidden in the cinematic format (no spoken-script structure). */}
            {!isPromptFormat && (
            <div className="mb-6">
              <StepLabel label="Script Style" />
              <div
                role="button"
                tabIndex={0}
                onClick={() => setStyleSlideOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStyleSlideOpen(true) } }}
                className={`group mt-2 flex w-full cursor-pointer items-center gap-3 rounded-full border px-4 py-3.5 text-left transition-colors ${
                  styleChosen
                    ? 'border-ink/10 bg-ink/[0.02] hover:border-ink/20 hover:bg-ink/[0.04]'
                    : 'border-dashed border-ink/10 bg-ink/[0.02] hover:border-scripts-500/30 hover:bg-scripts-500/5'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-scripts-500/10 text-scripts-400">
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  {styleChosen ? (
                    <>
                      <div className="truncate text-[13px] font-medium tracking-tight text-ink-200">{WRITE_STYLE_META[writeStyle].label}</div>
                      <div className="truncate text-[11px] leading-snug text-ink-500">{WRITE_STYLE_META[writeStyle].hint}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-ink-300">Select a style</div>
                      <div className="text-xs text-ink-600">Choose how the script is structured</div>
                    </>
                  )}
                </div>
                {styleChosen ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-ink-500 group-hover:flex">
                      <RefreshCw className="h-2.5 w-2.5" />
                      Change
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStyleChosen(false) }}
                      title="Clear style"
                      aria-label="Clear style"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400 light:hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" strokeWidth={2} />
                )}
              </div>
            </div>
            )}

            {/* The brief + length + output */}
            <div className="mb-6 flex flex-col">
              <StepLabel
                label="Describe Your Ad"
                optional
                tooltip="What should this ad say or focus on? Vibe, angle, key points — anything goes. Leave it blank and the model will come up with the angle for you."
              />
              {/* Fixed-height box (Playground prompt pattern): it never grows
                  with content — it scrolls internally so the page stays put. */}
              <div className="relative mt-3">
                <textarea
                  value={brief}
                  onChange={(e) => onBriefChange(e.target.value)}
                  rows={6}
                  placeholder={"Leave blank and I'll come up with the angle — or steer it: e.g. A girl in her 20s talking about this serum like she's telling her best friend, focus on how fast it cleared her skin. Casual, a little funny, end with the discount code."}
                  className="h-[150px] w-full resize-none overflow-y-auto rounded-3xl border border-ink/10 bg-ink/[0.02] px-4 py-3 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30"
                />
                <ExpandButton onClick={() => setExpandedField('brief')} className="absolute bottom-2 right-2" />
              </div>

              {/* Length — a segmented toggle (same sliding animation as the
                  mode toggle up top). */}
              <div className="mt-5">
                <StepLabel label="Length" />
                <div className="mt-2">
                  <SegmentedToggle<string>
                    className="h-12 !p-1"
                    value={String(writeLength)}
                    onChange={(v) => onWriteLengthChange(Number(v) as WriteLength)}
                    options={(isPromptFormat ? PROMPT_LENGTHS : WRITE_LENGTHS).map((len) => ({ value: String(len), label: `${len}s` }))}
                  />
                </div>
              </div>

            </div>
          </>
        ) : mode === 'remix' ? (
          <div className="mb-6 flex grow flex-col">
            <div className="flex items-center justify-between gap-2">
              <StepLabel label="Proven Script Transcript" />
              <ClearAllButton onClear={onClear} />
            </div>

            <div className="mt-2">
              <ScriptBankCard
                selected={remixScript}
                label="Script"
                icon={FileText}
                accentClass="bg-scripts-500/10 text-scripts-300/80"
                onSelect={() => setScriptPickerOpen(true)}
                onClear={() => setRemixScript(null)}
                className={highlightField === 'transcript' ? 'animate-field-flash' : ''}
              />
            </div>

            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-ink/[0.07]" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-600">or paste transcript manually</span>
              <div className="h-px flex-1 bg-ink/[0.07]" />
            </div>

            <div className="relative flex grow flex-col">
              <textarea
                value={winningTranscript}
                onChange={(e) => { onTranscriptChange(e.target.value); setRemixScript(null) }}
                rows={8}
                placeholder="Paste a proven ad transcript here, or send one from Ad Analyzer..."
                className={`min-h-[160px] w-full grow rounded-3xl border border-ink/10 bg-ink/[0.02] px-4 py-3 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30 resize-none ${highlightField === 'transcript' ? 'animate-field-flash' : ''}`}
              />
              <ExpandButton onClick={() => setExpandedField('transcript')} className="absolute bottom-2 right-2" />
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <StepLabel label="Reverse-Engineered Scene" />
              <ClearAllButton onClear={onClear} />
            </div>

            <div className="mt-2">
              <ScriptBankCard
                selected={sceneScript}
                label="Scene"
                icon={Clapperboard}
                accentClass="bg-fuchsia-500/10 text-fuchsia-300/80 light:text-fuchsia-700/80"
                onSelect={() => setScriptPickerOpen(true)}
                onClear={() => setSceneScript(null)}
                className={highlightField === 'reverse-prompt' ? 'animate-field-flash' : ''}
              />
            </div>

            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-ink/[0.07]" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-600">or paste scene transcript manually</span>
              <div className="h-px flex-1 bg-ink/[0.07]" />
            </div>

            <div className="relative">
              <textarea
                value={reversePrompt}
                onChange={(e) => { onReversePromptChange(e.target.value); setSceneScript(null) }}
                rows={10}
                placeholder={'Paste the reverse-engineered prompt from Ad Analyzer here.\n\nExample (multi-scene):\n--- Scene 1: Mirror reaction hook (00:00-00:08) ---\nA woman in her late 20s with shoulder-length auburn hair, wearing a cream cable-knit sweater, stands in a softly-lit bathroom holding a clear glass dropper bottle... She says: "I had dark spots for years and nothing worked."\n\n--- Scene 2: Product reveal (00:08-00:15) ---\n...'}
                className={`h-[200px] w-full resize-none overflow-y-auto rounded-3xl border border-ink/10 bg-ink/[0.02] px-4 py-3 font-mono text-xs leading-relaxed text-ink-200 placeholder-ink-700 outline-none transition-colors focus:border-scripts-500/30 ${highlightField === 'reverse-prompt' ? 'animate-field-flash' : ''}`}
              />
              <ExpandButton onClick={() => setExpandedField('reverse')} className="absolute bottom-2 right-2" />
            </div>
          </div>
        )}

        {/* Step 02 — Product Context (Write New renders it inside its own
            block above, between Output and the brief) */}
        {mode !== 'write' && productSection}

        {/* Final step — Additional Context. Write New folds this into the
            "Describe Your Ad" brief (step 3), so it's only shown for the
            remix / scene-rewrite modes. */}
        {mode !== 'write' && (
          <div className="mb-6">
            <StepLabel label="Additional Context (Optional)" />
            <textarea
              value={additionalContext}
              onChange={(e) => onAdditionalContextChange(e.target.value)}
              rows={3}
              placeholder={mode === 'remix'
                ? "Additional context for this script (e.g. 'Focus on the self-cleaning feature', 'Summer campaign tone')..."
                : "Additional context for the rewrite (e.g. 'Keep tone playful', 'Make the CTA softer')..."}
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-ink/[0.02] px-4 py-3 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30 resize-none"
            />
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 shrink-0 border-t border-ink/5 bg-surface-0/95 px-5 py-4 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:bg-transparent md:backdrop-blur-none">
        <button
          onClick={() => onGenerate(editableContext)}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-scripts-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] btn-soft-shadow transition-all hover:bg-scripts-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{mode === 'write' ? (writeFormat === 'prompt' ? 'Directing 3 Concepts...' : 'Writing 3 Takes...') : mode === 'remix' ? 'Generating 3 Script Variations...' : 'Generating Prompts...'}</span>
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4" strokeWidth={2.5} />
              <span>{generateLabel}</span>
            </>
          )}
        </button>
      </div>

      {/* Bank Pickers */}
      <BankPicker
        bankType="products"
        isOpen={productPickerOpen}
        onSelect={(item) => onProductSelect(item as Product)}
        onClose={() => setProductPickerOpen(false)}
      />
      <BankPicker
        bankType="models"
        isOpen={influencerPickerOpen}
        onSelect={(item) => onInfluencerSelect(item as Model)}
        onClose={() => setInfluencerPickerOpen(false)}
      />
      <BankPicker
        bankType="scripts"
        isOpen={scriptPickerOpen}
        onSelect={(item) => handleBankScriptSelect(item as Script)}
        onClose={() => setScriptPickerOpen(false)}
      />

      {/* Edit product details — opens in a right slide-over with full-size
          fields, so you never scroll the form or fight tiny inline boxes. */}
      <SlideOver
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Edit product details"
        subtitle="Edit for this script, or push the changes back to your bank"
        footer={
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSaveForScript}
              className="w-full rounded-full border border-white/15 bg-scripts-500 px-5 py-2.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors hover:bg-scripts-400"
            >
              Save for this script only
            </button>
            <button
              type="button"
              onClick={handleUpdateBank}
              className="w-full rounded-full border border-ink/10 bg-ink/[0.02] px-5 py-2.5 text-[13px] font-medium tracking-tight text-ink-300 transition-colors hover:border-ink/20 hover:bg-ink/[0.05] hover:text-ink-100"
            >
              Update product in bank
            </button>
          </div>
        }
      >
        {editableContext && (
          <div className="flex flex-col gap-4 p-5">
            <EditableField label="Description" value={editableContext.productDescription} onChange={(v) => updateField('productDescription', v)} />
            <EditableField label="Target Market" value={editableContext.targetMarket} onChange={(v) => updateField('targetMarket', v)} />
            <EditableField label="Pain Points" value={editableContext.painPoints} onChange={(v) => updateField('painPoints', v)} />
            <EditableField label="USPs" value={editableContext.usps} onChange={(v) => updateField('usps', v)} />
            <EditableField label="Benefits" value={editableContext.benefits} onChange={(v) => updateField('benefits', v)} />
            <EditableField label="Offer" value={editableContext.offer} onChange={(v) => updateField('offer', v)} />
            <EditableField label="CTA" value={editableContext.cta} onChange={(v) => updateField('cta', v)} />
          </div>
        )}
      </SlideOver>

      {/* Style picker — opens from the right; tap a style to select it. */}
      <SlideOver
        open={styleSlideOpen}
        onClose={() => setStyleSlideOpen(false)}
        title="Choose a style"
        subtitle="How the script is structured"
      >
        <div className="flex flex-col gap-2 p-4">
          {(Object.keys(WRITE_STYLE_META) as WriteStyle[]).map((style) => {
            const active = styleChosen && style === writeStyle
            return (
              <button
                key={style}
                type="button"
                onClick={() => { onWriteStyleChange(style); setStyleChosen(true); setStyleSlideOpen(false) }}
                className={`flex items-center gap-3 rounded-full border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-scripts-500/30 bg-scripts-500/10'
                    : 'border-ink/5 bg-ink/[0.02] hover:border-ink/10 hover:bg-ink/[0.04]'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? 'bg-scripts-500/10 text-scripts-400' : 'bg-ink/5 text-ink-500'}`}>
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] font-medium tracking-tight ${active ? 'text-scripts-300' : 'text-ink-200'}`}>
                    {WRITE_STYLE_META[style].label}
                  </div>
                  <div className="text-[11px] leading-snug text-ink-500">{WRITE_STYLE_META[style].hint}</div>
                </div>
              </button>
            )
          })}
        </div>
      </SlideOver>

      <ExpandTextModal
        open={expandedField === 'brief'}
        onClose={() => setExpandedField(null)}
        value={brief}
        onChange={onBriefChange}
        title="Describe Your Ad"
        accent="scripts"
        placeholder="What should this ad say or focus on? Vibe, angle, key points…"
      />
      <ExpandTextModal
        open={expandedField === 'transcript'}
        onClose={() => setExpandedField(null)}
        value={winningTranscript}
        onChange={(v) => { onTranscriptChange(v); setRemixScript(null) }}
        title="Proven Script Transcript"
        accent="scripts"
        placeholder="Paste a proven ad transcript here…"
      />
      <ExpandTextModal
        open={expandedField === 'reverse'}
        onClose={() => setExpandedField(null)}
        value={reversePrompt}
        onChange={(v) => { onReversePromptChange(v); setSceneScript(null) }}
        title="Reverse-Engineered Scene"
        accent="scripts"
        mono
        placeholder="Paste the reverse-engineered prompt from Ad Analyzer here…"
      />
    </div>
  )
}

// Section heading for every field in the form — plain text-sm, no leading
// number. An optional `tooltip` turns the label into a dotted-underline hint
// that reveals guidance on hover (same pattern as the Voiceovers sliders),
// keeping the form clean of always-on helper text.
function StepLabel({ label, tooltip, optional }: { label: string; tooltip?: string; optional?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <span
      className={`relative inline-block text-sm font-medium text-ink-200 ${tooltip ? 'cursor-help' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={tooltip ? 0 : -1}
    >
      <span className={tooltip ? 'underline decoration-dotted decoration-ink-600 underline-offset-4' : ''}>
        {label}
      </span>
      {optional && <span className="ml-1.5 font-normal text-ink-500">— optional</span>}
      {tooltip && hover && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-72 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] font-normal leading-snug text-ink-100 shadow-xl ring-1 ring-ink/10"
        >
          {tooltip}
        </span>
      )}
    </span>
  )
}

// A bank-pick card for the remix / scene source. Dashed "Click to select"
// when empty; a solid filled pill with a hover "Change" + an X-clear when a
// bank item is selected — mirrors the B-Roll reference cards.
function ScriptBankCard({
  selected,
  label,
  icon: Icon,
  accentClass,
  onSelect,
  onClear,
  className,
}: {
  selected: Script | null
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  accentClass: string
  onSelect: () => void
  onClear: () => void
  className?: string
}) {
  if (!selected) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`group flex w-full items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.015] px-4 py-3 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.03] ${className ?? ''}`}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-200">{label}</div>
          <div className="text-xs text-ink-400">Click to select from bank</div>
        </div>
      </button>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-4 py-3 transition-colors hover:border-ink/20 hover:bg-ink/[0.04] ${className ?? ''}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accentClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-200">{selected.title}</div>
        <div className="truncate text-[11px] text-ink-500">{label}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-ink-500 group-hover:flex">
          <RefreshCw className="h-2.5 w-2.5" />
          Change
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear() }}
          title={`Remove ${label.toLowerCase()}`}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400 light:hover:text-red-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-2xl border border-ink/10 bg-ink/[0.02] px-4 py-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30 resize-none"
      />
    </label>
  )
}
