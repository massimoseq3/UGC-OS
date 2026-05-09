import { useRef, useState } from 'react'
import { Upload, X, Library } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { BRoll } from '../../stores/types'
import BankPicker from '../BankPicker'

export interface VideoInputValue {
  dataUri: string
  sourceBRollId?: string
}

interface VideoInputSlotProps {
  label: string
  helper?: string
  value: VideoInputValue | null
  onChange: (next: VideoInputValue | null) => void
}

async function brollToDataUri(broll: BRoll): Promise<string | null> {
  if (!broll.imageUrl) return null
  if (broll.imageUrl.startsWith('data:')) return broll.imageUrl
  if (isAssetRef(broll.imageUrl)) {
    const asset = await getAsBase64(broll.imageUrl)
    if (!asset) return null
    return `data:${asset.mimeType};base64,${asset.base64}`
  }
  return broll.imageUrl
}

// Image input slot used by B-Roll Videos for start/end frames. Two sources:
// Upload (file picker) and Pick from Bank (BankPicker filtered to brolls with
// stills). Tracks the source BRoll id when picked from the bank so the save
// flow can attach the generated video to the original record.
export default function VideoInputSlot({ label, helper, value, onChange }: VideoInputSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  async function handleFile(file: File | null) {
    if (!file) return
    const dataUri = await fileToDataUri(file)
    onChange({ dataUri })
  }

  async function handleBankPick(item: unknown) {
    const broll = item as BRoll
    const dataUri = await brollToDataUri(broll)
    if (!dataUri) return
    onChange({ dataUri, sourceBRollId: broll.id })
  }

  return (
    <div>
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
        {helper && <span className="text-zinc-700 normal-case"> {helper}</span>}
      </label>

      {value ? (
        <div className="flex h-40 items-center justify-center">
          <div className="relative inline-block overflow-hidden rounded-lg border border-white/10 bg-black/40">
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
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="text-[10px]">Upload image</span>
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300"
          >
            <Library className="h-3.5 w-3.5" />
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
        bankType="brolls"
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleBankPick}
        filter={(item) => !!(item as BRoll).imageUrl}
      />
    </div>
  )
}
