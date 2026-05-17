import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus, Download, Loader2 } from 'lucide-react'
import type { Model } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'

interface ModelFormProps {
  item?: Model | null
  onSave: (data: Omit<Model, 'id' | 'createdAt'>) => Promise<void> | void
  onCancel: () => void
}

const FIELD_LABELS: Record<string, string> = {
  gender: 'Gender',
  age: 'Age Range',
  ethnicity: 'Ethnicity',
  bodyType: 'Body Type',
  skinTone: 'Skin Tone',
  skinTexture: 'Skin Texture',
  eyeColor: 'Eye Color',
  eyeShape: 'Eye Shape',
  hairColor: 'Hair Color',
  hairStyle: 'Hair Style',
  hairTexture: 'Hair Texture',
  facialFeatures: 'Facial Features',
  facialHair: 'Facial Hair',
  distinguishingMarks: 'Distinguishing Marks',
  clothingStyle: 'Clothing Style',
  accessories: 'Accessories',
  makeup: 'Makeup',
  location: 'Location',
  background: 'Background',
  lighting: 'Lighting',
  weather: 'Weather',
  timeOfDay: 'Time of Day',
  pose: 'Pose',
  action: 'Action',
  expression: 'Expression',
  shotType: 'Shot Type',
  cameraAngle: 'Camera Angle',
  cameraDevice: 'Camera Device',
}

const CANONICAL_CATEGORIES = ['Physical', 'Style', 'Scene', 'Pose & Action', 'Camera'] as const

const CATEGORY_ACCENT: Record<string, string> = {
  Physical: 'bg-sky-400/40',
  Style: 'bg-rose-400/40',
  Scene: 'bg-emerald-400/40',
  'Pose & Action': 'bg-amber-400/40',
  Camera: 'bg-violet-400/40',
}

const SOURCE_LABELS: Record<Model['source'], string> = {
  'character-studio': 'Character Studio',
  'image-dna-extractor': 'DNA Extracted',
  'manual-import': 'Manually added',
}

function camelToTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? camelToTitle(key)
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function stringifyValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(', ')
  if (isPlainRecord(v)) return Object.values(v).map(stringifyValue).filter(Boolean).join(', ')
  return ''
}

function buildSections(profile: Record<string, unknown> | null): Array<{ name: string; rows: Array<{ label: string; value: string }> }> {
  if (!profile) return []
  const keys = Object.keys(profile)
  const looksCanonical = keys.some((k) => CANONICAL_CATEGORIES.includes(k as typeof CANONICAL_CATEGORIES[number]))
  const ordered = looksCanonical
    ? [...CANONICAL_CATEGORIES.filter((c) => keys.includes(c)), ...keys.filter((k) => !CANONICAL_CATEGORIES.includes(k as typeof CANONICAL_CATEGORIES[number]))]
    : keys

  const sections: Array<{ name: string; rows: Array<{ label: string; value: string }> }> = []
  for (const cat of ordered) {
    const inner = profile[cat]
    if (!isPlainRecord(inner)) {
      const value = stringifyValue(inner)
      if (value) sections.push({ name: camelToTitle(cat), rows: [{ label: labelFor(cat), value }] })
      continue
    }
    const rows: Array<{ label: string; value: string }> = []
    for (const [k, v] of Object.entries(inner)) {
      const value = stringifyValue(v)
      if (!value) continue
      rows.push({ label: labelFor(k), value })
    }
    if (rows.length) sections.push({ name: cat, rows })
  }
  return sections
}

export default function ModelForm({ item, onSave, onCancel }: ModelFormProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [characterImage, setCharacterImage] = useState(item?.characterImage ?? '')
  const [source] = useState<Model['source']>(item?.source ?? 'manual-import')
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

    setSaving(true)
    try {
      await onSave({
        name,
        notes: item?.notes ?? '',
        characterImage,
        jsonProfile: item?.jsonProfile ?? null,
        source,
      })
    } finally {
      setSaving(false)
    }
  }

  const sections = buildSections((item?.jsonProfile as Record<string, unknown> | null) ?? null)
  const savedDate = item?.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const metaParts = [
    'Character',
    SOURCE_LABELS[source],
    savedDate ? `Saved ${savedDate}` : null,
  ].filter(Boolean)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Header — close */}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Hero — portrait + name */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="relative group/img w-full md:w-56 shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] transition-colors hover:border-white/15 overflow-hidden"
          >
            {displayImage ? (
              <img src={displayImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-7 w-7 text-zinc-600 transition-colors group-hover/img:text-zinc-400" />
            )}
          </button>
          {displayImage && (
            <button
              type="button"
              onClick={handleDownload}
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover/img:opacity-100"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

        <div className="flex flex-1 flex-col justify-end gap-2 min-w-0 pb-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unnamed character"
            className="w-full bg-transparent text-3xl font-semibold tracking-tight text-zinc-100 placeholder-zinc-700 outline-none border-b border-transparent transition-colors focus:border-white/15 -mx-1 px-1 py-1"
          />
          <p className="text-xs text-zinc-500">
            {metaParts.join(' · ')}
          </p>
        </div>
      </div>

      {/* Spec sheet */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.015] p-6">
        {sections.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">
            {item ? 'No DNA on file for this character.' : 'DNA will appear here after generating from Characters.'}
          </p>
        ) : (
          <div className="flex flex-col gap-7">
            {sections.map((section) => (
              <section key={section.name}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className={`block h-3 w-[3px] rounded-full ${CATEGORY_ACCENT[section.name] ?? 'bg-white/30'}`} />
                  <h4 className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">{section.name}</h4>
                  <span className="ml-1 h-px flex-1 bg-white/5" />
                </div>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                  {section.rows.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5 py-1.5 border-b border-white/5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                      <dt className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{row.label}</dt>
                      <dd className="text-sm text-zinc-200 leading-snug">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Character')}
      </button>
    </form>
  )
}
