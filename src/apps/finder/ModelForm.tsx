import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus, ChevronDown, ChevronUp, Braces, Copy, Check } from 'lucide-react'
import type { Model } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'

interface ModelFormProps {
  item?: Model | null
  onSave: (data: Omit<Model, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

export default function ModelForm({ item, onSave, onCancel }: ModelFormProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [characterImage, setCharacterImage] = useState(item?.characterImage ?? '')
  const [source] = useState<Model['source']>(item?.source ?? 'manual-import')
  const [jsonInput, setJsonInput] = useState(item?.jsonProfile ? JSON.stringify(item.jsonProfile, null, 2) : '')
  const [jsonError, setJsonError] = useState('')
  const [jsonExpanded, setJsonExpanded] = useState(false)
  const [jsonCopied, setJsonCopied] = useState(false)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const resolvedAssetUrl = useAssetUrl(characterImage)
  const displayImage = localPreview ?? resolvedAssetUrl
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setName(item.name)
      setNotes(item.notes)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
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

    onSave({
      name,
      notes,
      characterImage,
      jsonProfile: parsedJson,
      source,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Model' : 'New Model'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition-colors hover:border-white/20 overflow-hidden"
      >
        {displayImage ? (
          <img src={displayImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-zinc-600 transition-colors group-hover:text-zinc-400" />
        )}
      </button>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Name *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Sarah - Bedroom"'
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 resize-none"
        />
      </label>

      <div className="rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setJsonExpanded(!jsonExpanded)}
            className="flex flex-1 items-center gap-2 text-left transition-colors"
          >
            <Braces className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-xs font-medium text-zinc-300">Character DNA (Paste JSON)</span>
            {jsonExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
            )}
          </button>
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
        {jsonExpanded && (
          <div className="border-t border-white/5 px-4 py-3">
            <textarea
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setJsonError('') }}
              rows={8}
              placeholder={'{\n  "Physical": {\n    "gender": "Female"\n  }\n}'}
              className={`w-full rounded-lg border bg-black/30 p-3 text-[11px] font-mono leading-relaxed text-zinc-400 outline-none transition-colors resize-y ${jsonError ? 'border-red-500/50 focus:border-red-400' : 'border-transparent focus:border-white/20'
                }`}
            />
            {jsonError && <p className="mt-1 text-[10px] text-red-400">{jsonError}</p>}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="mt-1 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/15"
      >
        {item ? 'Save Changes' : 'Add Model'}
      </button>
    </form>
  )
}
