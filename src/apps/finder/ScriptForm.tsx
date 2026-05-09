import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Script } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'

interface ScriptFormProps {
  item?: Script | null
  onSave: (data: Omit<Script, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

export default function ScriptForm({ item, onSave, onCancel }: ScriptFormProps) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [scriptText, setScriptText] = useState(item?.scriptText ?? '')
  const [linkedProductId, setLinkedProductId] = useState(item?.linkedProductId ?? '')
  const products = useBankStore((s) => s.products)

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setScriptText(item.scriptText)
      setLinkedProductId(item.linkedProductId)
    }
  }, [item])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !scriptText.trim()) return
    onSave({
      title,
      scriptText,
      linkedProductId,
      source: item?.source ?? 'manual',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Script' : 'New Script'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Title *</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "LARQ - Lazy Girl Hook"'
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Script Text *</span>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={20}
          className="min-h-[420px] rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 resize-y"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Linked Product</span>
        <select
          value={linkedProductId}
          onChange={(e) => setLinkedProductId(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-white/20"
        >
          <option value="">None</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.productName}</option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="mt-1 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
      >
        {item ? 'Save Changes' : 'Add Script'}
      </button>
    </form>
  )
}
