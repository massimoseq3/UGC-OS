import { useState, useEffect } from 'react'
import { Package, Loader2, PenLine, ChevronDown, FileText } from 'lucide-react'
import type { Product, Script } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import BankPicker from '../../../components/BankPicker'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'

interface EditableProductContext {
  productDescription: string
  targetMarket: string
  painPoints: string
  usps: string
  benefits: string
  offer: string
  cta: string
}

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
  winningTranscript: string
  onTranscriptChange: (value: string) => void
  selectedProduct: Product | null
  onProductSelect: (product: Product) => void
  additionalContext: string
  onAdditionalContextChange: (value: string) => void
  onGenerate: (context: EditableProductContext | null) => void
  isGenerating: boolean
  highlightField?: string | null
}

export default function InputPanel({
  winningTranscript,
  onTranscriptChange,
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

  // When a product is selected, initialize editable context and collapse details
  useEffect(() => {
    if (selectedProduct) {
      setEditableContext(createEditableContext(selectedProduct))
      setDetailsOpen(false)
    }
  }, [selectedProduct])

  const canGenerate = winningTranscript.trim().length > 0 && selectedProduct !== null

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

  return (
    <div className="flex flex-col lg:h-full">
      {/* Scrollable inputs */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Step 01 — Winning Script */}
        <div className="mb-6">
          <StepLabel step={1} label="Winning Script Transcript" />

          {/* Pull from Script bank — card affordance */}
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

          {/* OR divider */}
          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">or</span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          <textarea
            value={winningTranscript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={8}
            placeholder="Paste a winning ad transcript here, or send one from Ad Analyzer..."
            className={`w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/30 resize-none ${highlightField === 'transcript' ? 'animate-field-flash' : ''}`}
          />
        </div>

        {/* Step 02 — Product Context */}
        <div className="mb-6">
          <StepLabel step={2} label="Product Context" />

          {selectedProduct ? (
            <div className="mt-2">
              {/* Selected product header card */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
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
                  <button
                    onClick={() => setProductPickerOpen(true)}
                    className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-500/10"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Editable product fields — collapsible */}
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
                      <p className="text-[10px] text-zinc-500">Edits here won't change your saved product</p>
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
            placeholder="Additional context for this script (e.g. 'Focus on the self-cleaning feature', 'Summer campaign tone')..."
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/30 resize-none"
          />
        </div>
      </div>

      {/* Generate button — pinned to viewport bottom on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-30 shrink-0 border-t border-white/5 bg-[#050505]/95 px-5 py-4 backdrop-blur-xl lg:static lg:left-auto lg:right-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none">
        <button
          onClick={() => onGenerate(editableContext)}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-blue-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating Script...</span>
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4" />
              <span>Generate Script</span>
            </>
          )}
        </button>

        {!canGenerate && !isGenerating && (
          <p className="mt-2 text-center text-[11px] text-zinc-700">
            {!winningTranscript.trim() && !selectedProduct
              ? 'Paste a winning script and select a product to generate'
              : !winningTranscript.trim()
                ? 'Paste a winning script transcript above'
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

function StepLabel({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold tabular-nums text-blue-400">
        {step}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">{label}</span>
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
