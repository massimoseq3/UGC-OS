import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Script } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'

interface ScriptFormProps {
  item?: Script | null
  onSave: (data: Omit<Script, 'id' | 'createdAt'>) => Promise<void> | void
  onCancel: () => void
}

export default function ScriptForm({ item, onSave, onCancel }: ScriptFormProps) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [scriptText, setScriptText] = useState(item?.scriptText ?? '')
  const [linkedProductId, setLinkedProductId] = useState(item?.linkedProductId ?? '')
  const [saving, setSaving] = useState(false)
  const products = useBankStore((s) => s.products)

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setScriptText(item.scriptText)
      setLinkedProductId(item.linkedProductId)
    }
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!title.trim() || !scriptText.trim()) return
    setSaving(true)
    try {
      await onSave({
        title,
        scriptText,
        linkedProductId,
        source: item?.source ?? 'manual',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-200">
          {item ? 'Edit Script' : 'New Script'}
        </h3>
        <button type="button" onClick={onCancel} className="text-ink-500 hover:text-ink-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Title *</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "LARQ - Lazy Girl Hook"'
          className="rounded-lg border border-ink/10 bg-transparent px-3 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Script Text *</span>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={20}
          className="min-h-[420px] rounded-lg border border-ink/10 bg-transparent px-3 py-2 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 resize-y"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Linked Product</span>
        <select
          value={linkedProductId}
          onChange={(e) => setLinkedProductId(e.target.value)}
          className="rounded-lg border border-ink/10 bg-surface-1 px-3 py-2 text-sm text-ink-200 outline-none transition-colors focus:border-ink/20"
        >
          <option value="">None</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.productName}</option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="mt-1 flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Script')}
      </button>
    </form>
  )
}
