import { Package, UserRound, FileText, Mic } from 'lucide-react'
import type { Product, Model, Script, VoicePreset } from '../stores/types'
import type { BankType } from '../utils/constants'
import { useAssetUrl } from '../hooks/useAssetUrl'

type BankItem = Product | Model | Script | VoicePreset

interface BankItemCardProps {
  bankType: BankType
  item: BankItem
  onClick: () => void
}

export default function BankItemCard({ bankType, item, onClick }: BankItemCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/10 hover:bg-white/[0.06]"
    >
      {bankType === 'products' && <ProductContent item={item as Product} />}
      {bankType === 'models' && <ModelContent item={item as Model} />}
      {bankType === 'scripts' && <ScriptContent item={item as Script} />}
      {bankType === 'voices' && <VoiceContent item={item as VoicePreset} />}
    </button>
  )
}

function Thumbnail({ src, fallback: Icon }: { src?: string; fallback: React.ElementType }) {
  const resolvedUrl = useAssetUrl(src)
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
      {resolvedUrl ? (
        <img src={resolvedUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-4 w-4 text-zinc-600" />
      )}
    </div>
  )
}

function ProductContent({ item }: { item: Product }) {
  return (
    <>
      <Thumbnail src={item.productImage} fallback={Package} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
          {item.productName || 'Untitled Product'}
        </span>
        <span className="truncate text-xs text-zinc-500">
          {item.targetMarket || 'No target market'}
        </span>
      </div>
    </>
  )
}

function ModelContent({ item }: { item: Model }) {
  return (
    <>
      <Thumbnail src={item.characterImage} fallback={UserRound} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
          {item.name || 'Untitled Model'}
        </span>
        <span className="truncate text-xs text-zinc-500">
          {item.source === 'character-studio' ? 'UGC Character Studio' : item.source === 'image-dna-extractor' ? 'Image DNA' : 'Imported'}
        </span>
      </div>
    </>
  )
}

function ScriptContent({ item }: { item: Script }) {
  const preview = item.scriptText.split('\n').slice(0, 2).join(' ').slice(0, 60)
  return (
    <>
      <Thumbnail fallback={FileText} />
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
      <Thumbnail fallback={Mic} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">
          {item.label || 'Untitled Preset'}
        </span>
        <span className="truncate text-xs text-zinc-500">
          {item.voiceName} · {item.gender}
        </span>
      </div>
    </>
  )
}
