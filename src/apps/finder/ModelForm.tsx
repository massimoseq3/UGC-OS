import { useState, useRef } from 'react'
import type { ElementType } from 'react'
import { X, ImagePlus, Download, Copy, Check } from 'lucide-react'
import type { Model } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { downloadImage } from '../../utils/downloadImage'
import { copyToClipboard } from '../../utils/clipboard'
// Long parameter values wrap onto several lines and the field grows to fit —
// one shared idiom, so it can't drift from the one the product form uses.
import AutoGrowTextarea from '../../components/AutoGrowTextarea'
import SectionCard, { SectionLabel } from '../../components/SectionCard'
// The influencer DNA schema (tabs → subheading groups → fields) is owned by the
// Influencers studio. We read it here so the bank detail view groups, labels and
// ordering stay in lockstep with the create form instead of drifting apart.
import { TABS, ASPECT_RATIO_KEY } from '../character-studio/types'
import { useBankAutosave, type BankAutosaveOptions } from './useBankAutosave'
import { AutosaveStatus, DoneButton, FormCloseButton, RequiredNote } from './BankFormChrome'

// What this form writes. Notes and source ride along unchanged so a new row is
// created whole; the Omni character id, the star and the preset link are left
// alone by the merge, so a generation that stamps one while the form is open
// isn't overwritten by the next autosave.
export type ModelDraft = Pick<Model, 'name' | 'notes' | 'source' | 'characterImage' | 'sheetImage' | 'jsonProfile'>

interface ModelFormProps {
  item?: Model | null
  // A draft handed back by the "wasn't saved" toast's Reopen (see Finder).
  seed?: ModelDraft
  onAutosave: BankAutosaveOptions<ModelDraft>['persist']
  onAbandoned: (draft: ModelDraft, rowId: string | null, message: string) => void
  onClose: () => void
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
// inputs can write the value straight back. `wide` long-form fields span the
// full row (mirrors the studio form's col-span behaviour).
type SpecRow = { label: string; path: string[]; wide?: boolean }
type SpecGroup = { id: string; label: string; icon?: ElementType; rows: SpecRow[] }
type SpecTab = { id: string; label: string; groups: SpecGroup[] }
type Leaf = { value: string; path: string[] }

// Flatten a stored profile (nested category → field, OR legacy flat) into a
// lookup keyed by field key, remembering each value's path so edits write back
// to the same place regardless of how the profile was originally grouped.
function flattenProfile(profile: Record<string, unknown> | null, prefix: string[] = []): Map<string, Leaf> {
  const map = new Map<string, Leaf>()
  if (!profile) return map
  for (const [key, value] of Object.entries(profile)) {
    const path = [...prefix, key]
    if (isPlainRecord(value)) {
      for (const [k, leaf] of flattenProfile(value, path)) map.set(k, leaf)
    } else {
      map.set(key, { value: stringifyValue(value), path })
    }
  }
  return map
}

// Build the render model from the studio's TABS config, pulling in only the
// fields that actually carry a value. The lookup is by field *key*, so a
// profile saved under the old flat categories regroups itself into the new
// tabs/subheadings automatically. Anything not in the schema lands in a
// trailing "Other" group so nothing is silently dropped. Built from the
// *original* profile so the set of visible rows stays stable while editing.
function buildSpec(profile: Record<string, unknown> | null): { tabs: SpecTab[]; other: SpecRow[] } {
  const flat = flattenProfile(profile)
  const seen = new Set<string>()
  const tabs: SpecTab[] = []
  for (const tab of TABS) {
    const groups: SpecGroup[] = []
    for (const group of tab.groups) {
      const rows: SpecRow[] = []
      for (const field of group.fields) {
        const leaf = flat.get(field.key)
        if (!leaf || leaf.value.trim() === '') continue
        seen.add(field.key)
        rows.push({ label: field.label, path: leaf.path, wide: field.wide })
      }
      if (rows.length) groups.push({ id: group.id, label: group.label, icon: group.icon, rows })
    }
    if (groups.length) tabs.push({ id: tab.id, label: tab.label, groups })
  }
  const other: SpecRow[] = []
  for (const [key, leaf] of flat) {
    if (seen.has(key) || key === ASPECT_RATIO_KEY || leaf.value.trim() === '') continue
    other.push({ label: labelFor(key), path: leaf.path })
  }
  return { tabs, other }
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

export default function ModelForm({ item, seed, onAutosave, onAbandoned, onClose }: ModelFormProps) {
  // Seeded once — see ScriptForm: the row changes under the form on every save.
  const start = seed ?? item
  const [name, setName] = useState(start?.name ?? '')
  const [characterImage, setCharacterImage] = useState(start?.characterImage ?? '')
  const [sheetImage, setSheetImage] = useState(start?.sheetImage ?? '')
  const [profile, setProfile] = useState<Record<string, unknown> | null>(start?.jsonProfile ?? null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const resolvedAssetUrl = useAssetUrl(characterImage)
  const resolvedSheetUrl = useAssetUrl(sheetImage)
  const displayImage = localPreview ?? resolvedAssetUrl
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // The spec's ROWS come from the profile as it was when the form opened, so
  // the set of fields stays put while editing — built from the live profile,
  // clearing a field would drop its row out from under the cursor (buildSpec
  // skips empty values), and the row it writes to now changes on every save.
  const [{ tabs, other }] = useState(() => buildSpec(item?.jsonProfile ?? null))

  const missingName = !name.trim()
  const autosave = useBankAutosave<ModelDraft>(
    {
      name,
      notes: item?.notes ?? '',
      source: item?.source ?? 'manual-import',
      characterImage,
      sheetImage,
      jsonProfile: profile,
    },
    {
      rowId: item?.id ?? null,
      canSave: (d) => !!d.name.trim(),
      persist: onAutosave,
      // The portrait goes up once: take its asset ref back, where the form is
      // still showing the picture that was sent.
      onStored: (sent, stored) =>
        setCharacterImage((current) => (current === sent.characterImage ? stored.characterImage : current)),
      restored: !!seed,
      onAbandon: (d, rowId) => onAbandoned(d, rowId, 'That character wasn’t saved: it still needs a name.'),
    },
  )

  const unsaved = missingName && autosave.touched
  const showMissing = autosave.touched || attempted

  const revealMissing = () => {
    setAttempted(true)
    nameRef.current?.focus()
  }

  const close = () => {
    void autosave.flush()
    onClose()
  }

  const discard = () => {
    autosave.discard()
    onClose()
  }

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

  // Copy the live (edited) DNA profile to the clipboard as formatted JSON,
  // prefixed with the name so a pasted prompt is self-describing.
  const handleCopy = async () => {
    const payload = { name, ...(profile ?? {}) }
    const ok = await copyToClipboard(JSON.stringify(payload, null, 2))
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const savedDate = item?.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const metaParts = [
    'Character',
    savedDate ? `Saved ${savedDate}` : null,
  ].filter(Boolean)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (missingName) revealMissing()
        else close()
      }}
      className="relative flex flex-col lg:min-h-0 lg:flex-1"
    >
      {/* Close — floats top-right so it doesn't reserve an empty header band. */}
      <FormCloseButton
        onClose={close}
        onDiscard={discard}
        wouldDiscard={unsaved}
        onBlocked={revealMissing}
        className="absolute right-0 top-0 z-10"
      />

      {/* Two-column: portrait + name + Done pinned on the left, spec scrolls on
          the right. No whole-page scroll on desktop. */}
      <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Left — portrait, name, meta, Done. Stays put while the right scrolls. */}
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
                <img src={displayImage} alt="" className="block max-h-[42dvh] w-full object-contain md:max-h-none" />
              ) : (
                <div className="flex aspect-[9/16] max-h-[42dvh] w-full items-center justify-center md:max-h-none">
                  <ImagePlus className="h-8 w-8 text-ink-600 transition-colors group-hover/img:text-ink-400" />
                </div>
              )}
            </button>
            {displayImage && (
              <button
                type="button"
                onClick={handleDownload}
                className="absolute right-2.5 top-2.5 rounded-full border border-white/20 bg-black/35 p-2 text-white opacity-0 backdrop-blur transition-all hover:bg-black/50 group-hover/img:opacity-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

          <div className="flex flex-col gap-1">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unnamed character"
              className={`w-full border-b bg-transparent py-1 text-3xl font-semibold tracking-tight text-ink-100 placeholder-ink-700 outline-none transition-colors ${
                showMissing && missingName ? 'border-red-500/60 focus:border-red-400' : 'border-transparent focus:border-ink/15'
              }`}
            />
            <RequiredNote show={showMissing && missingName}>A character needs a name to be saved.</RequiredNote>
            {/* The save state sits on the meta line rather than beside the
                floating ✕, where it would land on the spec column's hairline. */}
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-ink-500">{metaParts.join(' · ')}</p>
              <AutosaveStatus state={autosave.state} blocked={unsaved} />
            </div>
          </div>

          {/* The transparent border is load-bearing: Copy Prompt below draws a
              real 1px one, and without a matching box here the two stacked
              buttons came out 40px and 42px. */}
          <DoneButton
            blocker={missingName ? 'Name This Character' : null}
            onDone={close}
            onBlocked={revealMissing}
            className="border border-transparent"
          />

          {profile && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 rounded-full border border-ink/10 bg-ink/[0.04] px-5 py-2.5 text-sm font-medium text-ink-300 transition-colors hover:bg-ink/[0.08]"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
          )}
        </div>

        {/* Right — character sheet + spec sheet (the only part that scrolls).
            Inset from the DNA cards by the width of their drop shadow: a scroll
            port clips on both axes, so a card flush against it lost its shadow
            down the sides and along the bottom. The negative margin hands that
            room back out of the pane's own `p-5` and the 32px column gap, so
            every card keeps the width and position it had. */}
        <div className="flex min-w-0 flex-1 flex-col gap-7 lg:-mx-5 lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-8">
          {/* Character sheet — attached from a sheet generation in Influencers.
              Read-only here apart from removal; regenerate from the studio.
              Skipped when the sheet IS the portrait (a sheet-only entry stamps
              both fields to the same image) so it isn't shown twice. */}
          {sheetImage && sheetImage !== characterImage && resolvedSheetUrl && (
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="block h-3 w-[3px] rounded-full bg-influencers-400/40" />
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Character Sheet</h4>
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

          {/* Spec sheet — two top-level tabs (Physical / Scene & Pose) each
              broken into the same subheading groups as the studio form, laid
              out as one continuous scroll. */}
          {tabs.length === 0 && other.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-500">
              {item ? 'No DNA on file for this character.' : 'DNA will appear here after generating from Characters.'}
            </p>
          ) : (
            <div className="flex flex-col gap-10">
              {tabs.map((tab) => (
                <div key={tab.id} className="flex flex-col gap-6">
                  {/* Tab header — uppercase + accent bar, matching the Character Sheet header */}
                  <div className="flex items-center gap-2.5">
                    <span className="block h-3 w-[3px] rounded-full bg-influencers-400/40" />
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{tab.label}</h3>
                    <span className="ml-1 h-px flex-1 bg-ink/5" />
                  </div>
                  {/* One card per DNA group. The heading was already the right
                      shape — icon + title + hairline, taken from the studio
                      form — but left-aligned and with no card around it, so the
                      Bank's view of a character read differently to the column
                      that made it. Centring it and closing the border is the
                      whole change; the fields are untouched. */}
                  {tab.groups.map((group) => (
                    <SectionCard
                      key={group.id}
                      icon={group.icon}
                      title={group.label}
                      contentClassName="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2"
                    >
                      {group.rows.map((row) => (
                        <div key={row.path.join('.')} className={`flex flex-col gap-0.5 ${row.wide ? 'sm:col-span-2' : ''}`}>
                          <div className="px-3">
                            {/* No dots anywhere in this form: every DNA field is
                                the same kind of optional and nothing here gates
                                a save, so a column of them would be decoration. */}
                            <SectionLabel label={row.label} />
                          </div>
                          <AutoGrowTextarea
                            rows={1}
                            value={getAtPath(profile, row.path)}
                            onChange={(e) => setProfileField(row.path, e.target.value)}
                            className="w-full resize-none overflow-hidden rounded-2xl border border-transparent bg-transparent px-3 py-1.5 text-sm leading-snug text-ink-200 outline-none transition-colors hover:bg-ink/[0.04] focus:border-ink/15 focus:bg-ink/[0.04]"
                          />
                        </div>
                      ))}
                    </SectionCard>
                  ))}
                </div>
              ))}

              {/* Profile fields not part of the current schema — never silently dropped. */}
              {other.length > 0 && (
                <SectionCard title="Other" contentClassName="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {other.map((row) => (
                    <div key={row.path.join('.')} className="flex flex-col gap-0.5">
                      <div className="px-3">
                        <SectionLabel label={row.label} />
                      </div>
                      <AutoGrowTextarea
                        rows={1}
                        value={getAtPath(profile, row.path)}
                        onChange={(e) => setProfileField(row.path, e.target.value)}
                        className="w-full resize-none overflow-hidden rounded-2xl border border-transparent bg-transparent px-3 py-1.5 text-sm leading-snug text-ink-200 outline-none transition-colors hover:bg-ink/[0.04] focus:border-ink/15 focus:bg-ink/[0.04]"
                      />
                    </div>
                  ))}
                </SectionCard>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
