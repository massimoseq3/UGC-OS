import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { BRoll, Product, Model, Script, VoicePreset } from '../../stores/types'
import type { BankType } from '../../utils/constants'
import BankPicker from '../BankPicker'
import SlotActionMenu from './SlotActionMenu'
import { RefSlotPill, RefThumbnail } from './RefSlot'
import type { VideoInputValue } from './VideoInputSlot'

type BankItem = Product | Model | Script | VoicePreset | BRoll

interface VideoRefStripProps {
  label: string
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

// Reference-image slot: a dashed pill that opens Upload / Pick-from-Bank, with
// each attached image following it as a thumbnail. Renders as a fragment so the
// parent's attachment row lays the pill and its thumbnails out as one flow.
export default function VideoRefStrip({ label, values, onChange, max, bankType, tabs }: VideoRefStripProps) {
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
      additions.push({ dataUri })
    }
    onChange([...values, ...additions])
  }

  return (
    <>
      <RefSlotPill
        triggerRef={triggerRef}
        icon={ImagePlus}
        label={label || 'Reference Images'}
        count={values.length}
        max={max}
        disabled={remaining <= 0}
        onClick={() => setActionMenu((v) => !v)}
      />
      {remaining > 0 && (
        <SlotActionMenu
          anchorRef={triggerRef}
          open={actionMenu}
          onClose={() => setActionMenu(false)}
          onUpload={() => fileInputRef.current?.click()}
          onPickFromBank={() => setPickerOpen(true)}
        />
      )}

      {values.map((v, i) => (
        <RefThumbnail
          key={i}
          src={v.dataUri}
          onRemove={() => onChange(values.filter((_, idx) => idx !== i))}
        />
      ))}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        // Reset after reading: without it, re-picking the same file the user
        // just removed fires no change event and silently does nothing.
        onChange={(e) => { void handleFile(e.target.files?.[0] ?? null); e.target.value = '' }}
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
    </>
  )
}
