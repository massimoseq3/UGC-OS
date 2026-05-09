import { useRef, useState } from 'react'
import { Upload, X, Library, Plus } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { BRoll } from '../../stores/types'
import BankPicker from '../BankPicker'
import type { VideoInputValue } from './VideoInputSlot'

interface VideoRefStripProps {
  label: string
  helper?: string
  values: VideoInputValue[]
  onChange: (next: VideoInputValue[]) => void
  max: number
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

export default function VideoRefStrip({ label, helper, values, onChange, max }: VideoRefStripProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    const brolls = items as BRoll[]
    const slotsLeft = max - values.length
    const additions: VideoInputValue[] = []
    for (const broll of brolls.slice(0, slotsLeft)) {
      const dataUri = await brollToDataUri(broll)
      if (dataUri) additions.push({ dataUri, sourceBRollId: broll.id })
    }
    onChange([...values, ...additions])
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <div>
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
        <span className="text-zinc-700 normal-case"> ({values.length}/{max}){helper ? ` — ${helper}` : ''}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10">
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
          <div className="relative">
            <button
              onClick={() => setActionMenu((v) => !v)}
              className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300"
            >
              <Plus className="h-4 w-4" />
            </button>
            {actionMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActionMenu(false)} />
                <div className="absolute left-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#0B0B0D]/95 shadow-xl backdrop-blur-xl">
                  <button
                    onClick={() => { setActionMenu(false); fileInputRef.current?.click() }}
                    className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.06]"
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    Upload image
                  </button>
                  <button
                    onClick={() => { setActionMenu(false); setPickerOpen(true) }}
                    className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.06]"
                  >
                    <Library className="h-3.5 w-3.5 shrink-0" />
                    Pick from Bank
                  </button>
                </div>
              </>
            )}
          </div>
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
        bankType="brolls"
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => { /* unused in multi-select mode */ }}
        multiSelect
        onSelectMany={handleBankPickMany}
        filter={(item) => !!(item as BRoll).imageUrl}
      />
    </div>
  )
}
