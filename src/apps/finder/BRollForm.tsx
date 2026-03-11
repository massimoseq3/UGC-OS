import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus, Download } from 'lucide-react'
import type { BRoll } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'

interface BRollFormProps {
  item?: BRoll | null
  onSave: (data: Omit<BRoll, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

export default function BRollForm({ item, onSave, onCancel }: BRollFormProps) {
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [prompt, setPrompt] = useState(item?.prompt ?? '')
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null)
  const resolvedImageUrl = useAssetUrl(imageUrl)
  const displayImage = localImagePreview ?? resolvedImageUrl
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setImageUrl(item.imageUrl)
      setPrompt(item.prompt)
    }
  }, [item])

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImageUrl(dataUrl)
      setLocalImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    onSave({
      imageUrl,
      prompt,
      productId: item?.productId,
      modelId: item?.modelId,
      scriptId: item?.scriptId,
      videoUrl: item?.videoUrl,
      videos: item?.videos,
    })
  }

  const handleDownloadImage = () => {
    if (!displayImage) return
    const a = document.createElement('a')
    a.href = displayImage
    a.download = `broll-${item?.id?.slice(0, 8) ?? 'image'}.png`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'B-Roll Details' : 'New B-Roll'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image preview — original aspect ratio */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Still Image</span>
        {displayImage ? (
          <div className="relative group">
            <img
              src={displayImage}
              alt=""
              className="w-full rounded-lg border border-white/[0.06] object-contain bg-black/30"
              style={{ maxHeight: '400px' }}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={handleDownloadImage}
                className="rounded-lg bg-black/60 p-1.5 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
                title="Download image"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group flex h-48 w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition-colors hover:border-white/20"
          >
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="h-6 w-6 text-zinc-600 transition-colors group-hover:text-zinc-400" />
              <span className="text-[11px] text-zinc-600">Upload image</span>
            </div>
          </button>
        )}
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />
      </div>

      {/* Prompt */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Prompt *</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          placeholder="Describe the image generation prompt..."
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-zinc-400 placeholder-zinc-700 outline-none transition-colors focus:border-white/15 resize-none"
        />
      </label>

      {/* Save button */}
      <button
        type="submit"
        className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/15"
      >
        {item ? 'Save Changes' : 'Add B-Roll'}
      </button>

    </form>
  )
}
