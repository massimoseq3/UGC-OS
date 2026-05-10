import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus, Download, Braces, Copy, Check, Loader2 } from 'lucide-react'
import type { Model } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'

interface ModelFormProps {
  item?: Model | null
  onSave: (data: Omit<Model, 'id' | 'createdAt'>) => Promise<void> | void
  onCancel: () => void
}

export default function ModelForm({ item, onSave, onCancel }: ModelFormProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [characterImage, setCharacterImage] = useState(item?.characterImage ?? '')
  const [source] = useState<Model['source']>(item?.source ?? 'manual-import')
  const [jsonInput, setJsonInput] = useState(item?.jsonProfile ? JSON.stringify(item.jsonProfile, null, 2) : '')
  const [jsonError, setJsonError] = useState('')
  const [jsonCopied, setJsonCopied] = useState(false)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const resolvedAssetUrl = useAssetUrl(characterImage)
  const displayImage = localPreview ?? resolvedAssetUrl
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setName(item.name)
      setCharacterImage(item.characterImage)
    }
  }, [item])

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setCharacterImage(dataUrl)
      setLocalPreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDownload = () => {
    if (!displayImage) return
    const a = document.createElement('a')
    a.href = displayImage
    a.download = `model-${name || item?.id.slice(0, 8) || 'image'}.png`
    a.click()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return

    let parsedJson = item?.jsonProfile ?? null
    setJsonError('')
    if (jsonInput.trim()) {
      try {
        parsedJson = JSON.parse(jsonInput)
      } catch {
        setJsonError('Invalid JSON format.')
        return
      }
    }

    setSaving(true)
    try {
      await onSave({
        name,
        notes: item?.notes ?? '',
        characterImage,
        jsonProfile: parsedJson,
        source,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Model' : 'New Model'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Side-by-side: image left, fields right */}
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left — 9:16 portrait image */}
        <div className="relative group/img w-full md:w-48 shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[9/16] w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition-colors hover:border-white/20 overflow-hidden"
          >
            {displayImage ? (
              <img src={displayImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-6 w-6 text-zinc-600 transition-colors group-hover/img:text-zinc-400" />
            )}
          </button>
          {displayImage && (
            <button
              type="button"
              onClick={handleDownload}
              className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover/img:opacity-100"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

        {/* Right — name, JSON, save */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Sarah - Bedroom"'
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
            />
          </label>

          {/* Character DNA JSON — always expanded, fills remaining space */}
          <div className="flex flex-1 flex-col rounded-xl border border-white/5 bg-white/[0.02] min-h-0">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Braces className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-xs font-medium text-zinc-300">Character DNA (Paste JSON)</span>
              </div>
              {jsonInput.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(jsonInput)
                    setJsonCopied(true)
                    setTimeout(() => setJsonCopied(false), 2000)
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
                >
                  {jsonCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {jsonCopied ? 'Copied' : 'Copy JSON'}
                </button>
              )}
            </div>
            <div className="flex flex-1 border-t border-white/5 px-4 py-3 min-h-0">
              <textarea
                value={jsonInput}
                onChange={(e) => { setJsonInput(e.target.value); setJsonError('') }}
                rows={10}
                placeholder={'{\n  "Physical": {\n    "gender": "Female"\n  }\n}'}
                className={`w-full flex-1 rounded-lg border bg-black/30 p-3 text-[11px] font-mono leading-relaxed text-zinc-400 outline-none transition-colors resize-none ${jsonError ? 'border-red-500/50 focus:border-red-400' : 'border-transparent focus:border-white/20'
                  }`}
              />
            </div>
            {jsonError && <p className="px-4 pb-2 text-[10px] text-red-400">{jsonError}</p>}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Character')}
          </button>
        </div>
      </div>
    </form>
  )
}
