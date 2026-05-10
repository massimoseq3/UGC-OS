import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Trash2, FolderOpen, Save, Check, Sparkles, X } from 'lucide-react'
import type { TabId, CharacterProfile, FieldGroup } from '../types'
import { TABS, getTabFields, createEmptyProfile, PRESET_MARIE, PRESET_ZANE } from '../types'
import type { Model } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { buildJsonPrompt } from '../services/generateCharacter'
import ChipField from './ChipField'
import PhotoExtractZone from './PhotoExtractZone'

interface ControlsPanelProps {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
  activeTab: TabId
  onActiveTabChange: (tab: TabId) => void
  isExtracting: boolean
  extractError: string | null
  extractedThumb: string | null
  onPhotoDrop: (file: File) => void
  onResetExtract: () => void
}

// Built-in presets shown alongside the user's saved bank entries.
const BUILTIN_PRESETS: Array<{ id: string; name: string; profile: CharacterProfile }> = [
  { id: 'builtin-marie', name: 'Marie', profile: PRESET_MARIE },
  { id: 'builtin-zane', name: 'Zane', profile: PRESET_ZANE },
]

function ModelThumb({ assetRef }: { assetRef: string }) {
  const url = useAssetUrl(assetRef)
  if (!url) return <div className="h-9 w-9 shrink-0 rounded-md bg-white/5" />
  return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
}

function flattenJsonProfile(json: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof json !== 'object' || json === null) return out
  for (const section of Object.values(json as Record<string, unknown>)) {
    if (typeof section === 'object' && section !== null) {
      for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value
      }
    }
  }
  return out
}

function PresetActions({
  profile,
  onProfileChange,
  onClearAll,
}: {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
  onClearAll: () => void
}) {
  const [loadOpen, setLoadOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const loadRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLDivElement>(null)

  const bankModels = useBankStore((s) => s.models)
  const addModel = useBankStore((s) => s.addModel)

  // Click-outside handlers for the two popovers.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (loadOpen && loadRef.current && !loadRef.current.contains(e.target as Node)) setLoadOpen(false)
      if (saveOpen && saveRef.current && !saveRef.current.contains(e.target as Node)) setSaveOpen(false)
    }
    if (loadOpen || saveOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [loadOpen, saveOpen])

  const applyProfile = (incoming: CharacterProfile | Record<string, string>) => {
    const next = createEmptyProfile()
    for (const [key, value] of Object.entries(incoming)) {
      if (key in next && typeof value === 'string') next[key] = value
    }
    onProfileChange(next)
  }

  const loadFromBank = (item: Model) => {
    if (!item.jsonProfile) return
    applyProfile(flattenJsonProfile(item.jsonProfile))
    setLoadOpen(false)
  }

  const loadBuiltin = (next: CharacterProfile) => {
    applyProfile(next)
    setLoadOpen(false)
  }

  const commitSave = () => {
    if (!saveName.trim()) return
    addModel({
      name: saveName.trim(),
      characterImage: '',
      notes: '',
      source: 'character-studio',
      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>,
    })
    setSaveName('')
    setSaveOpen(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2">
      <div className="flex items-center gap-2">
      {/* Load from Bank */}
      <div ref={loadRef} className="relative">
        <button
          type="button"
          onClick={() => { setLoadOpen((v) => !v); setSaveOpen(false) }}
          className="flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-sky-300 transition-colors hover:border-sky-500/35 hover:bg-sky-500/15 hover:text-sky-200"
        >
          <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
          Load Preset from Bank
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${loadOpen ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </button>
        {loadOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 min-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0D] shadow-2xl">
            <div className="max-h-[320px] overflow-y-auto p-1">
              <div className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                Starters
              </div>
              {BUILTIN_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadBuiltin(p.profile)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={1.5} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
              {bankModels.length > 0 && (
                <>
                  <div className="mx-2 my-1 h-px bg-white/5" />
                  <div className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                    Bank
                  </div>
                  {bankModels.filter((m) => m.jsonProfile).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => loadFromBank(m)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
                    >
                      {m.characterImage ? (
                        <ModelThumb assetRef={m.characterImage} />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5">
                          <Sparkles className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                        </div>
                      )}
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save as Preset */}
      <div ref={saveRef} className="relative">
        <button
          type="button"
          onClick={() => { setSaveOpen((v) => !v); setLoadOpen(false) }}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${savedFlash
            ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
            : 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300 hover:border-emerald-500/35 hover:bg-emerald-500/15 hover:text-emerald-200'
          }`}
        >
          {savedFlash ? <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.75} />}
          {savedFlash ? 'Saved' : 'Save as Preset'}
        </button>
        {saveOpen && (
          <div className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0D] p-2 shadow-2xl">
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') { setSaveOpen(false); setSaveName('') }
              }}
              placeholder="Preset name…"
              className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-sky-500/30"
            />
            <div className="mt-1.5 flex gap-1">
              <button
                onClick={commitSave}
                disabled={!saveName.trim()}
                className="flex-1 rounded-md bg-sky-500/15 px-2 py-1 text-[12px] font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setSaveOpen(false); setSaveName('') }}
                className="flex items-center justify-center rounded-md px-2 py-1 text-zinc-500 transition-colors hover:text-zinc-300"
                aria-label="Cancel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/[0.06] px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-300"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        Clear all
      </button>
    </div>
  )
}

export default function ControlsPanel({
  profile,
  onProfileChange,
  activeTab,
  onActiveTabChange,
  isExtracting,
  extractError,
  extractedThumb,
  onPhotoDrop,
  onResetExtract,
}: ControlsPanelProps) {
  const currentTab = TABS.find((t) => t.id === activeTab)!

  // Track which groups are collapsed. Empty set = all groups open (the default).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  const renderGroupFields = (group: FieldGroup) => (
    <div className="flex flex-col gap-5">
      {group.fields.map((field) => (
        <ChipField
          key={field.key}
          fieldKey={field.key}
          label={field.label}
          value={profile[field.key] ?? ''}
          chips={field.chips}
          onChange={(v) => setField(field.key, v)}
          placeholder={field.placeholder}
          defaultLocked={field.key === 'cameraDevice'}
        />
      ))}
    </div>
  )

  // If the tab only has one group, render its fields flat — no accordion.
  const isFlat = currentTab.groups.length === 1

  return (
    <div className="flex flex-col md:h-full">
      {/* Photo extract drop zone */}
      <div className="border-b border-white/5 px-3 py-2">
        <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-widest text-zinc-400">Auto-fill from reference image</span>
        <PhotoExtractZone
          isExtracting={isExtracting}
          extractError={extractError}
          thumbnail={extractedThumb}
          onPhotoDrop={onPhotoDrop}
          onReset={onResetExtract}
        />
      </div>

      {/* Preset actions — pill buttons under the drop zone */}
      <div className="border-b border-white/5 pt-2">
        <PresetActions
          profile={profile}
          onProfileChange={onProfileChange}
          onClearAll={() => onProfileChange(createEmptyProfile())}
        />
      </div>

      {/* Horizontal segmented tabs — same sizing/spacing as Voiceovers + B-Roll Videos */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-5">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          const fields = getTabFields(tab)
          const filled = fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
          return (
            <button
              key={tab.id}
              onClick={() => onActiveTabChange(tab.id)}
              className={`relative flex items-center whitespace-nowrap px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${isActive
                ? 'text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${isActive
                ? 'bg-white/10 text-zinc-300'
                : 'bg-white/[0.04] text-zinc-500'
              }`}>
                {filled}/{fields.length}
              </span>
              <span
                className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
                  isActive ? 'bg-zinc-100' : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* Scrollable parameter fields (only scrolls internally on desktop) */}
      <div className="flex-1 p-4 md:overflow-y-auto">
        {isFlat ? (
          renderGroupFields(currentTab.groups[0])
        ) : (
          <div className="flex flex-col gap-3">
            {currentTab.groups.map((group) => {
              const groupFilled = group.fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
              const isOpen = !collapsed.has(group.id)
              const GroupIcon = group.icon
              return (
                <div key={group.id} className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.015]">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-zinc-300 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                        strokeWidth={2}
                      />
                      {GroupIcon && (
                        <GroupIcon className="h-3.5 w-3.5 text-zinc-300" strokeWidth={1.25} />
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-100">
                        {group.label}
                      </span>
                    </div>
                    <span className="text-[10px] tabular-nums text-zinc-400">
                      {groupFilled}/{group.fields.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 px-4 py-4">
                      {renderGroupFields(group)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
