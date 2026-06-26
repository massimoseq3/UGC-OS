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

export default function VideoRefStrip({ label, helper, values, onChange, max, bankType, tabs }: VideoRefStripProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState(false)
  // The Upload / Pick-from-bank menu opens on hover; a short close delay bridges
  // the gap between the tile and the menu so moving onto it doesn't dismiss it.
  const menuTimer = useRef<number | null>(null)
  const openMenu = () => { if (menuTimer.current) window.clearTimeout(menuTimer.current); setActionMenu(true) }
  const closeMenuSoon = () => { menuTimer.current = window.setTimeout(() => setActionMenu(false), 120) }

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

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <div>
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {label}
        <span className="text-ink-700 normal-case"> ({values.length}/{max}){helper ? ` — ${helper}` : ''}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-ink/10">
            <img src={v.dataUri} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => removeAt(i)}
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
        {remaining > 0 && (
          <>
            <button
              ref={triggerRef}
              onClick={() => setActionMenu((v) => !v)}
              onMouseEnter={openMenu}
              onMouseLeave={closeMenuSoon}
              className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] text-ink-500 transition-colors hover:border-ink/25 hover:text-ink-300"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <SlotActionMenu
              anchorRef={triggerRef}
              open={actionMenu}
              onClose={() => setActionMenu(false)}
              onUpload={() => fileInputRef.current?.click()}
              onPickFromBank={() => setPickerOpen(true)}
              hover
              onMouseEnter={openMenu}
              onMouseLeave={closeMenuSoon}
            />
          </>
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
