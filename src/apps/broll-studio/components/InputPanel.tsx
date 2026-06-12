import { Package, UserRound, FileText, RefreshCw, Loader2, Film, X } from 'lucide-react'
import type { Product, Model, Script } from '../../../stores/types'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import ClearAllButton from '../../../components/ClearAllButton'

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
  // Clear-all control — wipes the inputs/references and the generated scenes.
  // The session is preserved as its own History row.
  onClearOutput?: () => void
}

function BankCard({
  icon: Icon,
  label,
  accentClass,
  isEmpty,
  children,
  onSelect,
  onClear,
  className,
}: {
  icon: React.ElementType
  label: string
  accentClass: string
  isEmpty: boolean
  children?: React.ReactNode
  onSelect: () => void
  onClear?: () => void
  className?: string
}) {
  if (isEmpty) {
    return (
      <button
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-full border border-dashed border-white/10 px-4 py-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.02] ${className ?? ''}`}
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accentClass}`}>
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-300">{label}</p>
          <p className="text-[11px] text-zinc-600">Click to select from bank</p>
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
      className={`group flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.04] ${className ?? ''}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-zinc-500 group-hover:flex">
          <RefreshCw className="h-2.5 w-2.5" />
          Change
        </span>
        {onClear && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear() }}
            title={`Remove ${label.toLowerCase()}`}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400"
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
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-amber-400/80"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 ring-2 ring-amber-400/80">
          <Package className="h-5 w-5" strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-200">{product.productName}</p>
        <p className="truncate text-[11px] text-zinc-500">Product</p>
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
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-influencers-500/80"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-influencers-500/15 text-influencers-400 ring-2 ring-influencers-500/80">
          <UserRound className="h-5 w-5" strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-200">{model.name}</p>
        <p className="truncate text-[11px] text-zinc-500">Influencer</p>
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
        <p className="truncate text-sm font-medium text-zinc-200">{title}</p>
        <p className="truncate text-[11px] text-zinc-500">Script</p>
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
  onClearOutput,
}: InputPanelProps) {
  const hasScript = scriptText.trim().length > 0
  const canGenerate = hasScript

  return (
    <div className="flex flex-col md:h-full">
      {/* Bank selections */}
      <div className="flex-1 p-5 md:overflow-y-auto">
        <div className="flex flex-col gap-3">
          {/* References section — "Clear All" sits top-right, in line with it. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-200">References</span>
            {onClearOutput && <ClearAllButton onClear={onClearOutput} />}
          </div>

          {/* Product */}
          <BankCard
            icon={Package}
            label="Product"
            accentClass="bg-amber-500/15 text-amber-400"
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
            isEmpty={!selectedModel}
            onSelect={onSelectModel}
            onClear={selectedModel ? onClearModel : undefined}
          >
            {selectedModel && <ModelCard model={selectedModel} />}
          </BankCard>

          {/* Script from bank */}
          <BankCard
            icon={FileText}
            label="Script"
            accentClass="bg-scripts-500/15 text-scripts-400"
            isEmpty={!selectedScript}
            onSelect={onSelectScript}
            onClear={selectedScript ? onClearScript : undefined}
            className={highlightField === 'script' ? 'animate-field-flash' : ''}
          >
            {selectedScript && <ScriptCard script={selectedScript} scriptText={scriptText} />}
          </BankCard>

          {/* "or paste script manually" divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">or paste script manually</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          {/* Manual script textarea */}
          <div>
            <textarea
              value={scriptText}
              onChange={(e) => onScriptTextChange(e.target.value)}
              rows={8}
              placeholder="Paste your script text here..."
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm leading-relaxed text-zinc-200 placeholder-zinc-700 outline-none transition-colors focus:border-white/20 resize-none"
            />
          </div>

          {/* Section separator */}
          <div className="my-2 h-px bg-white/5" />

          {/* Additional instructions */}
          <div>
            <span className="text-sm font-medium text-zinc-200">Additional Instructions</span>
            <textarea
              value={additionalContext}
              onChange={(e) => onAdditionalContextChange(e.target.value)}
              rows={5}
              placeholder="Optional notes for this generation (mood, style preferences, specific angles...)"
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 outline-none transition-colors focus:border-white/20 resize-none"
            />
          </div>

        </div>
      </div>

      {/* Generate button — pinned to viewport bottom on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 bg-[#050505]/95 p-4 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:bg-transparent md:backdrop-blur-none">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-6 py-3.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
          <p className="mt-2 text-center text-[10px] text-zinc-700">
            Select or paste a script to get started
          </p>
        )}
      </div>
    </div>
  )
}
