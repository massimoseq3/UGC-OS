import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { X, ImagePlus, Download, Loader2 } from 'lucide-react'
import type { Model } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { downloadImage } from '../../utils/downloadImage'

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

// Rows carry their `path` into the (possibly nested) profile so the editable
// inputs can write the value straight back. Built from the *original* profile
// so the set of visible fields stays stable while editing (clearing a field to
// empty doesn't make its row vanish mid-keystroke).
type SpecRow = { label: string; path: string[] }
function buildSections(profile: Record<string, unknown> | null): Array<{ name: string; rows: SpecRow[] }> {
  if (!profile) return []
  const keys = Object.keys(profile)
  const looksCanonical = keys.some((k) => CANONICAL_CATEGORIES.includes(k as typeof CANONICAL_CATEGORIES[number]))
  const ordered = looksCanonical
    ? [...CANONICAL_CATEGORIES.filter((c) => keys.includes(c)), ...keys.filter((k) => !CANONICAL_CATEGORIES.includes(k as typeof CANONICAL_CATEGORIES[number]))]
    : keys

  const sections: Array<{ name: string; rows: SpecRow[] }> = []
  for (const cat of ordered) {
    const inner = profile[cat]
    if (!isPlainRecord(inner)) {
      const value = stringifyValue(inner)
      if (value) sections.push({ name: camelToTitle(cat), rows: [{ label: labelFor(cat), path: [cat] }] })
      continue
    }
    const rows: SpecRow[] = []
    for (const [k, v] of Object.entries(inner)) {
      const value = stringifyValue(v)
      if (!value) continue
      rows.push({ label: labelFor(k), path: [cat, k] })
    }
    if (rows.length) sections.push({ name: cat, rows })
  }
  return sections
}

// Read the live (possibly edited) value at a profile path. Strings pass through
// untouched so typing trailing spaces works; non-strings are stringified.
function getAtPath(profile: Record<string, unknown> | null, path: string[]): string {
  if (!profile) return ''
  let v: unknown
  if (path.length === 1) v = profile[path[0]]
  else {
    const inner = profile[path[0]]
    v = isPlainRecord(inner) ? inner[path[1]] : undefined
  }
  return typeof v === 'string' ? v : stringifyValue(v)
}

// Immutably set a string value at a profile path.
function setAtPath(profile: Record<string, unknown> | null, path: string[], value: string): Record<string, unknown> {
  const next = { ...(profile ?? {}) }
  if (path.length === 1) {
    next[path[0]] = value
  } else {
    const [cat, key] = path
    next[cat] = { ...(isPlainRecord(next[cat]) ? next[cat] : {}), [key]: value }
  }
  return next
}

// Auto-growing textarea — wraps long parameter values onto multiple lines and
// grows to fit so nothing gets clipped (a single-line input would hide overflow).
function AutoTextarea({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  )
}

export default function ModelForm({ item, onSave, onCancel }: ModelFormProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [characterImage, setCharacterImage] = useState(item?.characterImage ?? '')
  const [sheetImage, setSheetImage] = useState(item?.sheetImage ?? '')
  const [source] = useState<Model['source']>(item?.source ?? 'manual-import')
  const [profile, setProfile] = useState<Record<string, unknown> | null>(item?.jsonProfile ?? null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const resolvedAssetUrl = useAssetUrl(characterImage)
  const resolvedSheetUrl = useAssetUrl(sheetImage)
  const displayImage = localPreview ?? resolvedAssetUrl
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setName(item.name)
      setCharacterImage(item.characterImage)
      setSheetImage(item.sheetImage ?? '')
      setProfile(item.jsonProfile ?? null)
    }
  }, [item])

  const setProfileField = (path: string[], value: string) => {
    setProfile((prev) => setAtPath(prev, path, value))
  }

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
    downloadImage(displayImage, `model-${name || item?.id.slice(0, 8) || 'image'}`)
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
        sheetImage,
        jsonProfile: profile,
        source,
      })
    } finally {
      setSaving(false)
    }
  }

  const sections = buildSections((item?.jsonProfile as Record<string, unknown> | null) ?? null)
  const savedDate = item?.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const metaParts = [
    'Influencer',
    savedDate ? `Saved ${savedDate}` : null,
  ].filter(Boolean)

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col lg:min-h-0 lg:flex-1">
      {/* Close — floats top-right so it doesn't reserve an empty header band. */}
      <button type="button" onClick={onCancel} className="absolute right-0 top-0 z-10 text-ink-500 hover:text-ink-300 transition-colors">
        <X className="h-4 w-4" />
      </button>

      {/* Two-column: portrait + name + save pinned on the left, spec scrolls on
          the right. No whole-page scroll on desktop. */}
      <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Left — portrait, name, meta, save. Stays put while the right scrolls. */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]">
          <div className="relative group/img">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center overflow-hidden rounded-3xl border border-ink/5 bg-ink/[0.02] transition-colors hover:border-ink/15"
            >
              {displayImage ? (
                // Natural aspect — supports portrait (9:16) AND landscape (16:9)
                // influencers (e.g. character-sheet entries) without cropping.
                <img src={displayImage} alt="" className="block w-full object-contain" />
              ) : (
                <div className="flex aspect-[9/16] w-full items-center justify-center">
                  <ImagePlus className="h-8 w-8 text-ink-600 transition-colors group-hover/img:text-ink-400" />
                </div>
              )}
            </button>
            {displayImage && (
              <button
                type="button"
                onClick={handleDownload}
                className="absolute right-2.5 top-2.5 rounded-full bg-black/60 p-2 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover/img:opacity-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

          <div className="flex flex-col gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unnamed influencer"
              className="w-full bg-transparent text-center text-3xl font-semibold tracking-tight text-ink-100 placeholder-ink-700 outline-none border-b border-transparent transition-colors focus:border-ink/15 py-1"
            />
            <p className="text-center text-xs text-ink-500">{metaParts.join(' · ')}</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Influencer')}
          </button>
        </div>

        {/* Right — character sheet + spec sheet (the only part that scrolls) */}
        <div className="flex min-w-0 flex-1 flex-col gap-7 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1">
          {/* Character sheet — attached from a sheet generation in Influencers.
              Read-only here apart from removal; regenerate from the studio.
              Skipped when the sheet IS the portrait (a sheet-only entry stamps
              both fields to the same image) so it isn't shown twice. */}
          {sheetImage && sheetImage !== characterImage && resolvedSheetUrl && (
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="block h-3 w-[3px] rounded-full bg-influencers-400/40" />
                <h4 className="text-[11px] font-medium uppercase tracking-widest text-ink-400">Character Sheet</h4>
                <span className="ml-1 h-px flex-1 bg-ink/5" />
              </div>
              <div className="relative group/sheet overflow-hidden rounded-3xl border border-ink/5 bg-ink/[0.02]">
                <img src={resolvedSheetUrl} alt="" className="block aspect-video w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover/sheet:opacity-100">
                  <button
                    type="button"
                    title="Download sheet"
                    onClick={() => downloadImage(resolvedSheetUrl, `character-sheet-${name || item?.id.slice(0, 8) || 'image'}`)}
                    className="rounded-full bg-black/60 p-2 text-zinc-400 backdrop-blur-sm transition-colors hover:text-zinc-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Detach sheet"
                    onClick={() => setSheetImage('')}
                    className="rounded-full bg-black/60 p-2 text-zinc-400 backdrop-blur-sm transition-colors hover:text-red-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Spec sheet */}
          {sections.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-500">
              {item ? 'No DNA on file for this influencer.' : 'DNA will appear here after generating from Influencers.'}
            </p>
          ) : (
            <div className="flex flex-col gap-7">
              {sections.map((section) => (
                <section key={section.name}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className={`block h-3 w-[3px] rounded-full ${CATEGORY_ACCENT[section.name] ?? 'bg-ink/30'}`} />
                    <h4 className="text-[11px] font-medium uppercase tracking-widest text-ink-400">{section.name}</h4>
                    <span className="ml-1 h-px flex-1 bg-ink/5" />
                  </div>
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                    {section.rows.map((row) => (
                      <div key={row.path.join('.')} className="flex flex-col gap-0.5 py-1.5 border-b border-ink/5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                        <dt className="px-3 text-[10px] font-medium uppercase tracking-widest text-ink-500">{row.label}</dt>
                        <dd>
                          <AutoTextarea
                            value={getAtPath(profile, row.path)}
                            onChange={(v) => setProfileField(row.path, v)}
                            className="w-full resize-none overflow-hidden rounded-2xl border border-transparent bg-transparent px-3 py-1.5 text-sm leading-snug text-ink-200 outline-none transition-colors hover:bg-ink/[0.04] focus:border-ink/15 focus:bg-ink/[0.04]"
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
