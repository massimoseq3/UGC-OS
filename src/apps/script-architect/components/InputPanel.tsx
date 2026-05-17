import { useState, useEffect } from 'react'
import { Package, Loader2, PenLine, ChevronDown, FileText, Wand2 } from 'lucide-react'
import type { Product, Script } from '../../../stores/types'
import type { EditableProductContext, ScriptMode } from '../types'
import { useBankStore } from '../../../stores/bankStore'
import BankPicker from '../../../components/BankPicker'
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
  selectedProduct: Product | null
  onProductSelect: (product: Product) => void
  additionalContext: string
  onAdditionalContextChange: (value: string) => void
  onGenerate: (context: EditableProductContext | null) => void
  isGenerating: boolean
  highlightField?: string | null
}

export default function InputPanel({
  mode,
  onModeChange,
  winningTranscript,
  onTranscriptChange,
  reversePrompt,
  onReversePromptChange,
  selectedProduct,
  onProductSelect,
  additionalContext,
  onAdditionalContextChange,
  onGenerate,
  isGenerating,
  highlightField,
}: InputPanelProps) {
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false)
  const [editableContext, setEditableContext] = useState<EditableProductContext | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const products = useBankStore((s) => s.products)
  const openApp = useAppStore((s) => s.openApp)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const resolvedProductImage = useAssetUrl(selectedProduct?.productImage)

  useEffect(() => {
    if (selectedProduct) {
      setEditableContext(createEditableContext(selectedProduct))
      setDetailsOpen(false)
    }
  }, [selectedProduct])

  const sourceFilled = mode === 'remix' ? winningTranscript.trim().length > 0 : reversePrompt.trim().length > 0
  const canGenerate = sourceFilled && selectedProduct !== null

  const handleOpenFinder = () => {
    sendToApp({ targetApp: 'finder', targetField: 'activeBank', data: 'products' })
    openApp('finder')
  }

  const updateField = (field: keyof EditableProductContext, value: string) => {
    if (!editableContext) return
    setEditableContext({ ...editableContext, [field]: value })
  }

  const handleScriptSelect = (item: Script) => {
    onTranscriptChange(item.scriptText)
  }

  const generateLabel = mode === 'remix' ? 'Generate 3 Script Variations' : 'Generate Prompts'

  return (
    <div className="flex flex-col md:h-full">
      {/* Mode tabs — aligned with the Output/History tab pattern used in the
          right panel so the left/right strips read as one continuous bar.
          Subtext under the tabs is intentionally absent so both strips share
          the same baseline. */}
      <div className="shrink-0 border-b border-white/5">
        <div className="flex items-center gap-1 px-5">
          <ModeTabButton active={mode === 'remix'} onClick={() => onModeChange('remix')}>
            <PenLine className="h-3.5 w-3.5" />
            Remix Script
          </ModeTabButton>
          <ModeTabButton active={mode === 'reverse-engineer'} onClick={() => onModeChange('reverse-engineer')}>
            <Wand2 className="h-3.5 w-3.5" />
            Reverse Engineer Ad
          </ModeTabButton>
        </div>
      </div>

      {/* Scrollable inputs */}
      <div className="flex-1 overflow-y-auto p-5">
        {mode === 'remix' ? (
          <div className="mb-6">
            <StepLabel step={1} label="Proven Script Transcript" />

            <button
              type="button"
              onClick={() => setScriptPickerOpen(true)}
              className="group mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.03]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300/80 transition-colors group-hover:bg-blue-500/15 group-hover:text-blue-300">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-200">Script</div>
                <div className="text-xs text-zinc-400">Click to select from bank</div>
              </div>
            </button>

            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.07]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">or</span>
              <div className="h-px flex-1 bg-white/[0.07]" />
            </div>

            <textarea
              value={winningTranscript}
              onChange={(e) => onTranscriptChange(e.target.value)}
              rows={8}
              placeholder="Paste a proven ad transcript here, or send one from Ad Analyzer..."
              className={`w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/30 resize-none ${highlightField === 'transcript' ? 'animate-field-flash' : ''}`}
            />
          </div>
        ) : (
          <div className="mb-6">
            <StepLabel step={1} label="Reverse-Engineered Prompt" />
            <p className="mt-2 text-[11px] text-zinc-600">
              Paste the prompt from Ad Analyzer&apos;s &quot;Send to Scripts&quot;, or write your own scene blueprint.
            </p>
            <textarea
              value={reversePrompt}
              onChange={(e) => onReversePromptChange(e.target.value)}
              rows={14}
              placeholder={'Paste the reverse-engineered prompt from Ad Analyzer here.\n\nExample (multi-scene):\n--- Scene 1: Mirror reaction hook (00:00-00:08) ---\nA woman in her late 20s with shoulder-length auburn hair, wearing a cream cable-knit sweater, stands in a softly-lit bathroom holding a clear glass dropper bottle... She says: "I had dark spots for years and nothing worked."\n\n--- Scene 2: Product reveal (00:08-00:15) ---\n...'}
              className={`mt-3 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-xs leading-relaxed text-zinc-200 placeholder-zinc-700 outline-none transition-colors focus:border-blue-500/30 resize-none ${highlightField === 'reverse-prompt' ? 'animate-field-flash' : ''}`}
            />
          </div>
        )}

        {/* Step 02 — Product Context */}
        <div className="mb-6">
          <StepLabel step={2} label="Product Context" />

          {selectedProduct ? (
            <div className="mt-2">
              {/* Whole-card-clickable — hitting any part of the populated
                  product card opens the picker. The Change label is a hover
                  affordance only. */}
              <button
                type="button"
                onClick={() => setProductPickerOpen(true)}
                className="group w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                    {resolvedProductImage ? (
                      <img src={resolvedProductImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-zinc-600" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
                      {selectedProduct.productName}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {selectedProduct.targetMarket || 'No target market'}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                    Change
                  </span>
                </div>
              </button>

              {editableContext && (
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                  <button
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                    aria-expanded={detailsOpen}
                  >
                    <div className="flex items-center gap-2">
                      <PenLine className="h-3.5 w-3.5 text-blue-400" strokeWidth={1.75} />
                      <span className="text-[12px] font-medium text-zinc-200">Edit product details for this script</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${detailsOpen ? '' : '-rotate-90'}`}
                      strokeWidth={2}
                    />
                  </button>
                  {detailsOpen && (
                    <div className="flex flex-col gap-3 border-t border-white/5 px-3 py-3">
                      <p className="text-[10px] text-zinc-500">Edits here won&apos;t change your saved product</p>
                      <EditableField label="Description" value={editableContext.productDescription} onChange={(v) => updateField('productDescription', v)} />
                      <EditableField label="Target Market" value={editableContext.targetMarket} onChange={(v) => updateField('targetMarket', v)} />
                      <EditableField label="Pain Points" value={editableContext.painPoints} onChange={(v) => updateField('painPoints', v)} />
                      <EditableField label="USPs" value={editableContext.usps} onChange={(v) => updateField('usps', v)} />
                      <EditableField label="Benefits" value={editableContext.benefits} onChange={(v) => updateField('benefits', v)} />
                      <EditableField label="Offer" value={editableContext.offer} onChange={(v) => updateField('offer', v)} />
                      <EditableField label="CTA" value={editableContext.cta} onChange={(v) => updateField('cta', v)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2">
              {products.length > 0 ? (
                <button
                  onClick={() => setProductPickerOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Package className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-300">Select Product</span>
                    <span className="text-xs text-zinc-600">Choose from your Product Bank</span>
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                    <Package className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-zinc-500">No products yet</span>
                    <button
                      onClick={handleOpenFinder}
                      className="text-left text-xs text-blue-400 transition-colors hover:text-blue-300"
                    >
                      Add one in Bank
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 03 — Additional Context */}
        <div className="mb-6">
          <StepLabel step={3} label="Additional Context (Optional)" />
          <textarea
            value={additionalContext}
            onChange={(e) => onAdditionalContextChange(e.target.value)}
            rows={3}
            placeholder={mode === 'remix'
              ? "Additional context for this script (e.g. 'Focus on the self-cleaning feature', 'Summer campaign tone')..."
              : "Additional context for the rewrite (e.g. 'Keep tone playful', 'Make the CTA softer')..."}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/30 resize-none"
          />
        </div>
      </div>

      {/* Generate button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 shrink-0 border-t border-white/5 bg-[#050505]/95 px-5 py-4 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:bg-transparent md:backdrop-blur-none">
        <button
          onClick={() => onGenerate(editableContext)}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-blue-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{mode === 'remix' ? 'Generating 3 Script Variations...' : 'Generating Prompts...'}</span>
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4" />
              <span>{generateLabel}</span>
            </>
          )}
        </button>

        {!canGenerate && !isGenerating && (
          <p className="mt-2 text-center text-[11px] text-zinc-700">
            {!sourceFilled && !selectedProduct
              ? (mode === 'remix'
                  ? 'Paste a proven script and select a product to generate'
                  : 'Paste a reverse-engineered prompt and select a product to generate prompts')
              : !sourceFilled
                ? (mode === 'remix' ? 'Paste a proven script transcript above' : 'Paste a reverse-engineered prompt above')
                : 'Select a product from your bank'}
          </p>
        )}
      </div>

      {/* Bank Pickers */}
      <BankPicker
        bankType="products"
        isOpen={productPickerOpen}
        onSelect={(item) => onProductSelect(item as Product)}
        onClose={() => setProductPickerOpen(false)}
      />
      <BankPicker
        bankType="scripts"
        isOpen={scriptPickerOpen}
        onSelect={(item) => handleScriptSelect(item as Script)}
        onClose={() => setScriptPickerOpen(false)}
      />
    </div>
  )
}

// Mode tab matching the Output/History TabButton in RightPanel.tsx so both
// strips share the same underline aesthetic.
function ModeTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${
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

// Step labels for the 1/2/3 sections — Playground-style subheadings now,
// dropping the tiny-uppercase look. The small numbered chip stays so the
// progression still reads.
function StepLabel({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold tabular-nums text-blue-400">
        {step}
      </span>
      <span className="text-sm font-medium text-zinc-200">{label}</span>
    </div>
  )
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-zinc-400 placeholder-zinc-700 outline-none transition-colors focus:border-blue-500/30 focus:text-zinc-200 resize-none"
      />
    </label>
  )
}
