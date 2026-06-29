import { useState } from 'react'
import { Package, UserRound, FileText, RefreshCw, Loader2, Film, X } from 'lucide-react'
import type { Product, Model, Script } from '../../../stores/types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'

interface InputPanelProps {
  selectedProduct: Product | null
  selectedModel: Model | null
  selectedScript: Script | null
  scriptText: string
  additionalContext: string
  onSelectProduct: () => void
  onSelectModel: () => void
  onSelectScript: () => void
  onClearProduct: () => void
  onClearModel: () => void
  onClearScript: () => void
  onScriptTextChange: (value: string) => void
  onAdditionalContextChange: (value: string) => void
  onGenerate: () => void
  isGenerating: boolean
  highlightField?: string | null
}

function BankCard({
  icon: Icon,
  label,
  accentClass,
  selectedClass,
  isEmpty,
  children,
  onSelect,
  onClear,
  className,
  flat,
}: {
  icon: React.ElementType
  label: string
  accentClass: string
  // Glassy accent fill applied once a reference is selected — keyed to the
  // bank's own colour (amber products, pink influencers, orange scripts) so the
  // populated card "lights up" the way a selected Script Style card does.
  selectedClass: string
  isEmpty: boolean
  children?: React.ReactNode
  onSelect: () => void
  onClear?: () => void
  className?: string
  // Header variant — drops the rounded-full pill shape and accent fill so the
  // card can sit as a flat top row inside a merged input box (border-b instead
  // of its own border). Used for the Script slot, which pairs with the manual
  // paste textarea below it.
  flat?: boolean
}) {
  if (isEmpty) {
    return (
      <button
        onClick={onSelect}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          flat
            ? 'border-b border-ink/10 hover:bg-ink/[0.04]'
            : 'rounded-full border border-dashed border-ink/10 hover:border-ink/20 hover:bg-ink/[0.02]'
        } ${className ?? ''}`}
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accentClass}`}>
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink-300">{label}</p>
          <p className="text-[11px] text-ink-600">Click to select from bank</p>
        </div>
      </button>
    )
  }

  // Populated state mirrors the empty state's single-row pill so selecting a
  // reference doesn't change the card's shape or height — it stays fully
  // rounded and same-size. Whole card re-opens the picker; the X clears
  // (stopPropagation so it doesn't also re-open).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`group flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors ${
        flat
          ? 'border-b border-ink/10 hover:bg-ink/[0.04]'
          : `rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${selectedClass}`
      } ${className ?? ''}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden items-center rounded-md px-2 py-0.5 text-ink-500 group-hover:flex">
          <RefreshCw className="h-2.5 w-2.5" />
        </span>
        {onClear && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear() }}
            title={`Remove ${label.toLowerCase()}`}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const resolvedImage = useAssetUrl(product.productImage)
  return (
    <div className="flex items-center gap-3">
      {resolvedImage ? (
        <img
          src={resolvedImage}
          alt={product.productName}
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-400 light:text-gold-600">
          <Package className="h-5 w-5" strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-200">{product.productName}</p>
        <p className="truncate text-[11px] text-ink-500">Product</p>
      </div>
    </div>
  )
}

function ModelCard({ model }: { model: Model }) {
  const resolvedImage = useAssetUrl(model.characterImage)
  return (
    <div className="flex items-center gap-3">
      {resolvedImage ? (
        <img
          src={resolvedImage}
          alt={model.name}
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-influencers-500/15 text-influencers-400">
          <UserRound className="h-5 w-5" strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-200">{model.name}</p>
        <p className="truncate text-[11px] text-ink-500">Influencer</p>
      </div>
    </div>
  )
}

function ScriptCard({ script }: { script: Script | null; scriptText: string }) {
  const title = script?.title ?? 'Imported Script'
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-scripts-500/15 text-scripts-400">
        <FileText className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-200">{title}</p>
        <p className="truncate text-[11px] text-ink-500">Script</p>
      </div>
    </div>
  )
}

export default function InputPanel({
  selectedProduct,
  selectedModel,
  selectedScript,
  scriptText,
  additionalContext,
  onSelectProduct,
  onSelectModel,
  onSelectScript,
  onClearProduct,
  onClearModel,
  onClearScript,
  onScriptTextChange,
  onAdditionalContextChange,
  onGenerate,
  isGenerating,
  highlightField,
}: InputPanelProps) {
  const hasScript = scriptText.trim().length > 0
  const canGenerate = hasScript
  const [scriptExpanded, setScriptExpanded] = useState(false)
  const [instructionsExpanded, setInstructionsExpanded] = useState(false)

  return (
    <div className="flex flex-col md:h-full">
      {/* Bank selections */}
      <div className="flex flex-1 flex-col p-5 md:overflow-y-auto">
        <div className="flex grow flex-col gap-3">
          {/* References section. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-200">References</span>
          </div>

          {/* Product */}
          <BankCard
            icon={Package}
            label="Product"
            accentClass="bg-gold-500/15 text-gold-400 light:text-gold-600"
            selectedClass="border-gold-500/40 bg-gold-500/10 ring-1 ring-inset ring-gold-500/15 hover:bg-gold-500/[0.14]"
            isEmpty={!selectedProduct}
            onSelect={onSelectProduct}
            onClear={selectedProduct ? onClearProduct : undefined}
          >
            {selectedProduct && <ProductCard product={selectedProduct} />}
          </BankCard>

          {/* Character */}
          <BankCard
            icon={UserRound}
            label="Influencer"
            accentClass="bg-influencers-500/15 text-influencers-400"
            selectedClass="border-influencers-500/40 bg-influencers-500/10 ring-1 ring-inset ring-influencers-500/15 hover:bg-influencers-500/[0.14]"
            isEmpty={!selectedModel}
            onSelect={onSelectModel}
            onClear={selectedModel ? onClearModel : undefined}
          >
            {selectedModel && <ModelCard model={selectedModel} />}
          </BankCard>

          {/* Script — select from bank (header) or paste manually (textarea),
              merged into one rounded box so the two sources read as one input. */}
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-dashed border-ink/10 bg-ink/[0.02] transition-colors focus-within:border-ink/20 ${highlightField === 'script' ? 'animate-field-flash' : ''}`}>
            <BankCard
              icon={FileText}
              label="Script"
              accentClass="bg-scripts-500/15 text-scripts-400"
              selectedClass=""
              isEmpty={!selectedScript}
              onSelect={onSelectScript}
              onClear={selectedScript ? onClearScript : undefined}
              flat
            >
              {selectedScript && <ScriptCard script={selectedScript} scriptText={scriptText} />}
            </BankCard>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <textarea
                value={scriptText}
                onChange={(e) => onScriptTextChange(e.target.value)}
                rows={8}
                placeholder="…or paste your script text here"
                className="min-h-[140px] w-full grow resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-ink-200 placeholder-ink-700 outline-none"
              />
              <ExpandButton onClick={() => setScriptExpanded(true)} className="absolute bottom-2 right-2" />
            </div>
          </div>

          {/* Section separator */}
          <div className="my-2 h-px bg-ink/5" />

          {/* Additional instructions */}
          <div>
            <span className="text-sm font-medium text-ink-200">Additional Instructions</span>
            <div className="relative mt-2">
              <textarea
                value={additionalContext}
                onChange={(e) => onAdditionalContextChange(e.target.value)}
                rows={5}
                placeholder="Optional notes for this generation (mood, style preferences, specific angles...)"
                className="w-full rounded-xl border border-ink/10 bg-transparent px-3 py-2 text-sm text-ink-200 placeholder-ink-700 outline-none transition-colors focus:border-ink/20 resize-none"
              />
              <ExpandButton onClick={() => setInstructionsExpanded(true)} className="absolute bottom-2 right-2" />
            </div>
          </div>

        </div>
      </div>

      {/* Generate button — pinned to viewport bottom on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/5 bg-surface-0/95 p-4 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:bg-transparent md:backdrop-blur-none">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] btn-soft-shadow transition-all hover:bg-broll-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating Prompts...</span>
            </>
          ) : (
            <>
              <Film className="h-4 w-4" strokeWidth={2.5} />
              <span>Generate B-Roll Prompts</span>
            </>
          )}
        </button>
        {!canGenerate && !isGenerating && (
          <p className="mt-2 text-center text-[10px] text-ink-700">
            Select or paste a script to get started
          </p>
        )}
      </div>

      <ExpandTextModal
        open={scriptExpanded}
        onClose={() => setScriptExpanded(false)}
        value={scriptText}
        onChange={onScriptTextChange}
        title="Script"
        accent="broll"
        placeholder="Paste your script text here..."
      />
      <ExpandTextModal
        open={instructionsExpanded}
        onClose={() => setInstructionsExpanded(false)}
        value={additionalContext}
        onChange={onAdditionalContextChange}
        title="Additional Instructions"
        accent="broll"
        placeholder="Optional notes for this generation (mood, style preferences, specific angles...)"
      />
    </div>
  )
}
