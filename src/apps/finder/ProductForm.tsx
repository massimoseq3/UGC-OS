import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus, Download, Loader2, AlertCircle } from 'lucide-react'
import type { Product } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'

interface ProductFormProps {
  item?: Product | null
  onSave: (data: Omit<Product, 'id' | 'createdAt'>) => Promise<void> | void
  onCancel: () => void
}

const FIELDS: { key: keyof Product; label: string; type: 'text' | 'textarea'; required?: boolean }[] = [
  { key: 'productName', label: 'Product Name', type: 'text', required: true },
  { key: 'productDescription', label: 'Description', type: 'textarea', required: true },
  { key: 'targetMarket', label: 'Target Market', type: 'text' },
  { key: 'painPoints', label: 'Pain Points', type: 'textarea' },
  { key: 'usps', label: 'USPs', type: 'textarea' },
  { key: 'benefits', label: 'Benefits', type: 'textarea' },
  { key: 'offer', label: 'Offer', type: 'text' },
  { key: 'cta', label: 'CTA', type: 'text' },
]

const REQUIRED_KEYS = ['productName', 'productDescription'] as const

export default function ProductForm({ item, onSave, onCancel }: ProductFormProps) {
  const [form, setForm] = useState({
    productImage: item?.productImage ?? '',
    productName: item?.productName ?? '',
    productDescription: item?.productDescription ?? '',
    targetMarket: item?.targetMarket ?? '',
    painPoints: item?.painPoints ?? '',
    usps: item?.usps ?? '',
    benefits: item?.benefits ?? '',
    offer: item?.offer ?? '',
    cta: item?.cta ?? '',
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showError, setShowError] = useState(false)
  const resolvedAssetUrl = useAssetUrl(form.productImage)
  const displayImage = localPreview ?? resolvedAssetUrl

  useEffect(() => {
    if (item) {
      setForm({
        productImage: item.productImage,
        productName: item.productName,
        productDescription: item.productDescription,
        targetMarket: item.targetMarket,
        painPoints: item.painPoints,
        usps: item.usps,
        benefits: item.benefits,
        offer: item.offer,
        cta: item.cta,
      })
    }
  }, [item])

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (showError && (REQUIRED_KEYS as readonly string[]).includes(key) && value.trim()) {
      // Recompute whether all required fields are now filled.
      const next = { ...form, [key]: value }
      const stillMissing = REQUIRED_KEYS.some((k) => !next[k].trim())
      if (!stillMissing) setShowError(false)
    }
  }

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      set('productImage', dataUrl)
      setLocalPreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDownload = () => {
    if (!displayImage) return
    const a = document.createElement('a')
    a.href = displayImage
    a.download = `product-${form.productName || item?.id?.slice(0, 8) || 'image'}.png`
    a.click()
  }

  const missingRequired = REQUIRED_KEYS.filter((k) => !form[k].trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (missingRequired.length > 0) {
      setShowError(true)
      return
    }
    setShowError(false)
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Product' : 'New Product'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Side-by-side: image left, fields right */}
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left — square product image */}
        <div className="w-full md:w-48 shrink-0">
          {displayImage ? (
            <div className="group/img relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
              <img src={displayImage} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={handleDownload}
                className="absolute right-2 top-2 z-10 rounded-lg bg-black/60 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover/img:opacity-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-2 right-2 z-10 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] font-medium text-zinc-300 opacity-0 backdrop-blur-sm transition-all hover:bg-black/80 group-hover/img:opacity-100"
              >
                Replace
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition-colors hover:border-white/20"
            >
              <ImagePlus className="h-6 w-6 text-zinc-600 transition-colors group-hover:text-zinc-400" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

        {/* Right — all fields + save */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          {FIELDS.map(({ key, label, type, required }) => {
            const isMissing = showError && required && !form[key as keyof typeof form].toString().trim()
            const baseCls = 'rounded-lg border bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors'
            const borderCls = isMissing ? 'border-red-500/60 focus:border-red-400' : 'border-white/10 focus:border-white/20'
            return (
              <label key={key} className="flex flex-col gap-1">
                <span className={`text-[11px] font-medium uppercase tracking-widest ${isMissing ? 'text-red-400' : 'text-zinc-500'}`}>
                  {label}{required && ' *'}
                </span>
                {type === 'textarea' ? (
                  <textarea
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) => set(key, e.target.value)}
                    rows={2}
                    className={`${baseCls} ${borderCls} resize-none`}
                  />
                ) : (
                  <input
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) => set(key, e.target.value)}
                    className={`${baseCls} ${borderCls}`}
                  />
                )}
              </label>
            )
          })}

          {showError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Please fill in the required fields first.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Product')}
          </button>
        </div>
      </div>
    </form>
  )
}
