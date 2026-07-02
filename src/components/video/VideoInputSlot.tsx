import { useRef, useState } from 'react'
import { Upload, X, Bookmark, Image as ImageIcon } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { BRoll, Product, Model, Script, VoicePreset } from '../../stores/types'
import type { BankType } from '../../utils/constants'
import BankPicker from '../BankPicker'
import SlotActionMenu from './SlotActionMenu'

type BankItem = Product | Model | Script | VoicePreset | BRoll

export interface VideoInputValue {
  dataUri: string
  sourceBRollId?: string
}

interface VideoInputSlotProps {
  label: string
  helper?: string
  value: VideoInputValue | null
  onChange: (next: VideoInputValue | null) => void
  // When set, the BankPicker opens on this bank instead of the default 'brolls'.
  bankType?: BankType
  // When set, BankPicker renders an inline tab strip so the user can switch
  // between these bank types without closing. See BankPicker for the prop shape.
  tabs?: Array<BankType | { type: BankType; filter?: (item: BankItem) => boolean }>
  // Compact mode: small square tiles matching VideoRefStrip's footprint.
  // Used by the Playground prompt bar so start/end frame tiles match the
  // adjacent reference-image strip. Default is the full-size B-Roll Videos
  // layout (h-40 with two side-by-side buttons).
  compact?: boolean
  // Dimmed, non-interactive (e.g. an End frame on a model that has no
  // frames-to-video mode). Compact mode only.
  disabled?: boolean
}

// Each bank type stores its image in a different field. Extract whichever
// one is present so this slot works with brolls / characters / products
// when used in tab-mode.
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

// Image input slot used by B-Roll Videos for start/end frames. Two sources:
// Upload (file picker) and Pick from Bank (BankPicker filtered to brolls with
// stills). Tracks the source BRoll id when picked from the bank so the save
// flow can attach the generated video to the original record.
//
// When `tabs` is supplied (e.g. from Playground) the picker is multi-bank;
// picking a Character or Product carries no `sourceBRollId`.
export default function VideoInputSlot({ label, helper, value, onChange, bankType, tabs, compact = false, disabled = false }: VideoInputSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    const dataUri = await fileToDataUri(file)
    onChange({ dataUri })
  }

  async function handleBankPick(item: unknown) {
    const picked = item as BankItem
    const dataUri = await bankItemToDataUri(picked)
    if (!dataUri) return
    // Only BRolls carry a meaningful "source" for save-back linkage. For
    // characters / products the id is meaningless to the save-to-bank flow.
    const sourceBRollId = 'imageUrl' in picked && (picked as BRoll).imageUrl ? picked.id : undefined
    onChange({ dataUri, sourceBRollId })
  }

  // Compact mode (Playground start/end frames): a single rounded card with a
  // circular image glyph, the label, and the "Optional" pill below it (matches
  // OmniAddCard). Clicking the empty card pops the Upload / Pick-from-Bank
  // menu (same as the reference strip). Once filled it shows the chosen still.
  if (compact) {
    const badge = (helper ?? '').replace(/^—\s*/, '').trim()
    return (
      <div className="relative">
        {value ? (
          <div className="relative h-24 w-full overflow-hidden rounded-2xl border border-ink/10 bg-black/40">
            <img src={value.dataUri} alt="" className="mx-auto block h-full w-auto max-w-full object-contain" />
            <button
              onClick={() => onChange(null)}
              className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-black/90"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            {value.sourceBRollId && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300">
                Bank
              </span>
            )}
          </div>
        ) : (
          <>
            <button
              ref={triggerRef}
              type="button"
              disabled={disabled}
              onClick={() => { if (!disabled) setActionMenu((v) => !v) }}
              className={`group relative flex h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/15 bg-ink/[0.02] transition-colors ${
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-ink/25 hover:bg-ink/[0.04]'
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-ink/[0.03] text-ink-400 transition-colors group-hover:text-ink-200">
                <ImageIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-normal text-ink-500">{label}</span>
              {badge && (
                <span className="mt-0.5 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[9px] font-medium capitalize tracking-tight text-ink-500">
                  {badge}
                </span>
              )}
            </button>
            {!disabled && (
              <SlotActionMenu
                anchorRef={triggerRef}
                open={actionMenu}
                onClose={() => setActionMenu(false)}
                onUpload={() => fileInputRef.current?.click()}
                onPickFromBank={() => setPickerOpen(true)}
              />
            )}
          </>
        )}

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
          onSelect={handleBankPick}
          filter={tabs ? undefined : (item) => !!(item as BRoll).imageUrl}
          tabs={tabs}
        />
      </div>
    )
  }

  return (
    <div>
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {label}
        {helper && <span className="text-ink-700 normal-case"> {helper}</span>}
      </label>

      {value ? (
        <div className="flex h-40 items-center justify-center">
          <div className="relative inline-block overflow-hidden rounded-lg border border-ink/10 bg-black/40">
            <img
              src={value.dataUri}
              alt=""
              className="block max-h-40 max-w-full"
            />
            <button
              onClick={() => onChange(null)}
              className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 backdrop-blur-sm hover:bg-black/90 hover:text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            {value.sourceBRollId && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 backdrop-blur-sm">
                Bank
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="grid h-40 grid-cols-2 gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] text-ink-500 transition-colors hover:border-ink/25 hover:text-ink-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="text-[10px]">Upload image</span>
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] text-ink-500 transition-colors hover:border-ink/25 hover:text-ink-300"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span className="text-[10px]">Pick from Bank</span>
          </button>
        </div>
      )}

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
        onSelect={handleBankPick}
        // Without tabs we keep the legacy filter (brolls with stills only).
        // With tabs, each tab can supply its own filter and we don't apply
        // a global one because Characters / Products always have an image.
        filter={tabs ? undefined : (item) => !!(item as BRoll).imageUrl}
        tabs={tabs}
      />
    </div>
  )
}
