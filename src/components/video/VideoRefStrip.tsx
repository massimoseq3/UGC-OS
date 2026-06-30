import { useRef, useState } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { BRoll, Product, Model, Script, VoicePreset } from '../../stores/types'
import type { BankType } from '../../utils/constants'
import BankPicker from '../BankPicker'
import SlotActionMenu from './SlotActionMenu'
import type { VideoInputValue } from './VideoInputSlot'

type BankItem = Product | Model | Script | VoicePreset | BRoll

interface VideoRefStripProps {
  label: string
  helper?: string
  values: VideoInputValue[]
  onChange: (next: VideoInputValue[]) => void
  max: number
  // When set, the BankPicker opens on this bank instead of the default 'brolls'.
  bankType?: BankType
  // When set, BankPicker renders an inline tab strip.
  tabs?: Array<BankType | { type: BankType; filter?: (item: BankItem) => boolean }>
  // When false, the picked-thumbnail strip is suppressed so the parent can
  // render it elsewhere (e.g. full-width above a multi-column button row).
  showThumbnails?: boolean
}

// Picked-reference thumbnails — a row of four. Exported so a parent can hoist
// it out of the card's column and render it full-width.
export function RefThumbnailStrip({
  values,
  onChange,
}: {
  values: VideoInputValue[]
  onChange: (next: VideoInputValue[]) => void
}) {
  if (values.length === 0) return null
  return (
    <div className="grid grid-cols-4 gap-2">
      {values.map((v, i) => (
        <div key={i} className="relative aspect-square w-full overflow-hidden rounded-xl border border-ink/10">
          <img src={v.dataUri} alt="" className="h-full w-full object-cover" />
          <button
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-black/90"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          {v.sourceBRollId && (
            <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1 py-0.5 text-[9px] font-medium text-zinc-300">
              Bank
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function bankItemImageField(item: BankItem): string | undefined {
  if ('imageUrl' in item && item.imageUrl) return item.imageUrl as string
  if ('characterImage' in item && item.characterImage) return item.characterImage as string
  if ('productImage' in item && item.productImage) return item.productImage as string
  return undefined
}

async function bankItemToDataUri(item: BankItem): Promise<string | null> {
  const src = bankItemImageField(item)
  if (!src) return null
  if (src.startsWith('data:')) return src
  if (isAssetRef(src)) {
    const asset = await getAsBase64(src)
    if (!asset) return null
    return `data:${asset.mimeType};base64,${asset.base64}`
  }
  return src
}

export default function VideoRefStrip({ label, helper, values, onChange, max, bankType, tabs, showThumbnails = true }: VideoRefStripProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState(false)

  const remaining = max - values.length

  async function handleFile(file: File | null) {
    if (!file) return
    if (values.length >= max) return
    const dataUri = await fileToDataUri(file)
    onChange([...values, { dataUri }])
  }

  async function handleBankPickMany(items: unknown[]) {
    const picked = items as BankItem[]
    const slotsLeft = max - values.length
    const additions: VideoInputValue[] = []
    for (const item of picked.slice(0, slotsLeft)) {
      const dataUri = await bankItemToDataUri(item)
      if (!dataUri) continue
      const sourceBRollId = 'imageUrl' in item && (item as BRoll).imageUrl ? item.id : undefined
      additions.push({ dataUri, sourceBRollId })
    }
    onChange([...values, ...additions])
  }

  const title = label || 'Reference Images'

  return (
    <div>
      {/* Picked references render as a four-up thumbnail strip above the card.
          Suppressed when the parent hoists the strip out (showThumbnails=false). */}
      {showThumbnails && values.length > 0 && (
        <div className="mb-2">
          <RefThumbnailStrip values={values} onChange={onChange} />
        </div>
      )}

      {/* Labelled add card — key info lives here (title · count · helper),
          mirrors the Start/End frame slots. Click opens Upload / Pick-from-Bank. */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={remaining <= 0}
          onClick={() => { if (remaining > 0) setActionMenu((v) => !v) }}
          className={`group relative flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 bg-ink/[0.02] transition-colors ${
            remaining <= 0 ? 'cursor-not-allowed opacity-50' : 'hover:border-ink/25 hover:bg-ink/[0.04]'
          }`}
        >
          {helper && (
            <span className="absolute left-2 top-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[9px] font-medium capitalize tracking-tight text-ink-500">
              {helper}
            </span>
          )}
          <span className="absolute right-2 top-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[9px] font-medium tabular-nums tracking-tight text-ink-500">
            {values.length}/{max}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-ink/[0.03] text-ink-400 transition-colors group-hover:text-ink-200">
            <ImagePlus className="h-3.5 w-3.5" />
          </span>
          <span className="text-[12px] font-normal text-ink-500">{title}</span>
        </button>
        {remaining > 0 && (
          <SlotActionMenu
            anchorRef={triggerRef}
            open={actionMenu}
            onClose={() => setActionMenu(false)}
            onUpload={() => fileInputRef.current?.click()}
            onPickFromBank={() => setPickerOpen(true)}
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      <BankPicker
        bankType={bankType ?? 'brolls'}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => { /* unused in multi-select mode */ }}
        multiSelect
        onSelectMany={handleBankPickMany}
        filter={tabs ? undefined : (item) => !!(item as BRoll).imageUrl}
        tabs={tabs}
      />
    </div>
  )
}
