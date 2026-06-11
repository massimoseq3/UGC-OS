import { Package, UserRound, FileText, Mic, Film } from 'lucide-react'
import type { Product, Model, Script, VoicePreset, BRoll } from '../stores/types'
import type { BankType } from '../utils/constants'
import { useAssetUrl } from '../hooks/useAssetUrl'

type BankItem = Product | Model | Script | VoicePreset | BRoll

interface BankItemCardProps {
  bankType: BankType
  item: BankItem
  onClick: () => void
  selected?: boolean
}

// Selected-state classes per bank so the highlight follows each bank's
// accent (see the @theme palettes in index.css / BANK_CONFIG hexes).
const IMAGE_SELECTED: Record<string, string> = {
  models: 'border-influencers-500/50 ring-1 ring-influencers-500/40',
  products: 'border-amber-500/50 ring-1 ring-amber-500/40',
  brolls: 'border-broll-500/50 ring-1 ring-broll-500/40',
}
const ROW_SELECTED: Record<string, string> = {
  scripts: 'border-scripts-500/40 bg-scripts-500/[0.08]',
  voices: 'border-voice-500/40 bg-voice-500/[0.08]',
}

export default function BankItemCard({ bankType, item, onClick, selected }: BankItemCardProps) {
  // Image-backed banks (influencers / products / b-rolls) render as full image
  // cards that adapt to the image's natural aspect ratio — 16:9 / 9:16 / square
  // — matching how the Bank browser shows them. Scripts / voices have no image,
  // so they keep the compact row layout.
  if (bankType === 'models') {
    const m = item as Model
    return (
      <ImageCard
        src={m.characterImage}
        fallback={UserRound}
        fallbackAspect="aspect-[9/16]"
        name={m.name || 'Untitled Influencer'}
        onClick={onClick}
        selectedClass={selected ? IMAGE_SELECTED.models : undefined}
      />
    )
  }

  if (bankType === 'products') {
    const p = item as Product
    return (
      <ImageCard
        src={p.productImage}
        fallback={Package}
        fallbackAspect="aspect-square"
        name={p.productName || 'Untitled Product'}
        onClick={onClick}
        selectedClass={selected ? IMAGE_SELECTED.products : undefined}
      />
    )
  }

  if (bankType === 'brolls') {
    const b = item as BRoll
    const videoCount = b.videos?.length ?? 0
    return (
      <ImageCard
        src={b.imageUrl}
        fallback={Film}
        fallbackAspect="aspect-video"
        name={b.prompt || 'Untitled B-Roll'}
        sublabel={`${b.imageUrl ? 'Still' : 'Video only'}${videoCount > 0 ? ` · ${videoCount} clip${videoCount === 1 ? '' : 's'}` : ''}`}
        onClick={onClick}
        selectedClass={selected ? IMAGE_SELECTED.brolls : undefined}
      />
    )
  }

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        selected
          ? ROW_SELECTED[bankType] ?? 'border-white/20 bg-white/[0.06]'
          : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]'
      }`}
    >
      {bankType === 'scripts' && <ScriptContent item={item as Script} />}
      {bankType === 'voices' && <VoiceContent item={item as VoicePreset} />}
    </button>
  )
}

// Full image card — shows the asset at its natural aspect ratio with a
// gradient name overlay, mirroring the Bank browser's influencer/product cards.
function ImageCard({
  src,
  fallback: Icon,
  fallbackAspect,
  name,
  sublabel,
  onClick,
  selectedClass,
}: {
  src?: string
  fallback: React.ElementType
  fallbackAspect: string
  name: string
  sublabel?: string
  onClick: () => void
  selectedClass?: string
}) {
  const resolvedUrl = useAssetUrl(src)
  return (
    <button
      onClick={onClick}
      className={`group relative block w-full overflow-hidden rounded-2xl border text-left transition-all ${
        selectedClass ?? 'border-white/5 bg-white/[0.03] hover:border-white/15 hover:-translate-y-0.5'
      }`}
    >
      {resolvedUrl ? (
        <img src={resolvedUrl} alt="" className="block w-full" />
      ) : (
        <div className={`flex ${fallbackAspect} w-full items-center justify-center bg-white/[0.04]`}>
          <Icon className="h-10 w-10 text-zinc-800" strokeWidth={1} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-100">{name}</span>
        {sublabel && <span className="block truncate text-xs text-zinc-400">{sublabel}</span>}
      </div>
    </button>
  )
}

function ScriptContent({ item }: { item: Script }) {
  const preview = item.scriptText.split('\n').slice(0, 2).join(' ').slice(0, 60)
  return (
    <>
      <RowThumbnail fallback={FileText} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
          {item.title || 'Untitled Script'}
        </span>
        <span className="truncate text-xs text-zinc-500">
          {preview || 'Empty script'}
        </span>
      </div>
    </>
  )
}

function VoiceContent({ item }: { item: VoicePreset }) {
  return (
    <>
      <RowThumbnail fallback={Mic} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
          {item.label || 'Untitled Preset'}
        </span>
        <span className="truncate text-xs text-zinc-500">
          {item.voiceName}{item.gender ? ` · ${item.gender}` : ''}
        </span>
      </div>
    </>
  )
}

function RowThumbnail({ fallback: Icon }: { fallback: React.ElementType }) {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5">
      <Icon className="h-4 w-4 text-zinc-600" />
    </div>
  )
}
