import { useState, useRef, type ElementType } from 'react'
import { ScanFace, PersonStanding, Camera, Copy, Check, Bookmark, X } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
import { TABS, getTabFields } from '../types'

// Per-tab glyphs — specific to each tab's job (appearance / pose / lens),
// not a generic decoration. Keyed by the stable tab id.
const TAB_ICONS: Record<TabId, ElementType> = {
  physical: ScanFace,
  scene: PersonStanding,
  camera: Camera,
}
import type { ImageResolution } from '../../../utils/models'
import ChipField from './ChipField'
import GenerateBar from './GenerateBar'
import SegmentedToggle from '../../../components/SegmentedToggle'
import ClearAllButton from '../../../components/ClearAllButton'
import { useBankStore } from '../../../stores/bankStore'
import { buildImagePrompt, buildSheetPrompt, buildJsonPrompt } from '../services/generateCharacter'
import { copyToClipboard } from '../../../utils/clipboard'

// Random first name for a quick preset save — gender-aware so the suggested
// name fits the character. The user can rename it later in the Bank.
const PRESET_FEMALE_NAMES = ['Ava', 'Mia', 'Maya', 'Nora', 'Quinn', 'Ella', 'Zoe', 'Iris', 'Luna', 'Hazel']
const PRESET_MALE_NAMES = ['Leo', 'Noah', 'Ethan', 'Kai', 'Miles', 'Jude', 'Finn', 'Theo', 'Silas', 'Ezra']
function presetName(profile: CharacterProfile): string {
  const g = (profile.gender || '').toLowerCase()
  const pool = g.startsWith('f')
    ? PRESET_FEMALE_NAMES
    : g.startsWith('m') && !g.startsWith('mx')
      ? PRESET_MALE_NAMES
      : [...PRESET_FEMALE_NAMES, ...PRESET_MALE_NAMES]
  return pool[Math.floor(Math.random() * pool.length)]
}

// Right-aligned header action: copies the full assembled prompt (exactly what
// would be sent to the image model) to the clipboard.
function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text.trim()}
      title="Copy the full prompt"
      className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.02] px-2.5 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:border-ink/20 hover:bg-ink/[0.05] hover:text-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// Right-aligned header cluster: a Save-as-Preset action (with an inline naming
// step before the preset lands in the bank) sitting to the left of Copy.
function PresetActions({
  suggestedName,
  onSave,
  promptText,
  onClear,
}: {
  suggestedName: () => string
  onSave: (name: string) => void
  promptText: string
  onClear: () => void
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const startNaming = () => {
    setName(suggestedName())
    setNaming(true)
    // Select the suggested name so the user can type over it immediately.
    window.setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setNaming(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  if (naming) {
    return (
      <div className="ml-auto flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); setNaming(false) }
          }}
          placeholder="Preset name"
          className="h-[26px] w-28 min-w-0 rounded-full border border-ink/15 bg-ink/[0.04] px-2.5 text-[11px] text-ink-100 placeholder:text-ink-500 focus:border-influencers-500/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!name.trim()}
          title="Save preset"
          aria-label="Save preset"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-influencers-500 text-white transition-colors hover:bg-influencers-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => setNaming(false)}
          title="Cancel"
          aria-label="Cancel"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink/10 hover:text-ink-200"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <ClearAllButton onClear={onClear} label="New" className="!py-1 !text-[11px]" />
      <button
        type="button"
        onClick={startNaming}
        title="Save these parameters as a preset"
        className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.02] px-2.5 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:border-ink/20 hover:bg-ink/[0.05] hover:text-ink-200"
      >
        {saved ? <Check className="h-3 w-3 text-influencers-400" /> : <Bookmark className="h-3 w-3" />}
        {saved ? 'Saved' : 'Save Preset'}
      </button>
      <CopyPromptButton text={promptText} />
    </div>
  )
}

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
  // "New" — resets the form + extracted reference photo to a blank slate.
  onClear: () => void
  // Generate bar (lives at the foot of this column).
  error: string | null
  onGenerate: () => void
  canGenerate: boolean
  resolution: ImageResolution
  onResolutionChange: (value: ImageResolution) => void
  sheetMode: boolean
  onSheetModeChange: (value: boolean) => void
  sheetAspect: string
  onSheetAspectChange: (value: string) => void
  inFlightCount: number
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
  onClear,
  error,
  onGenerate,
  canGenerate,
  resolution,
  onResolutionChange,
  sheetMode,
  onSheetModeChange,
  sheetAspect,
  onSheetAspectChange,
  inFlightCount,
}: ControlsPanelProps) {
  // Fall back to the first tab when a persisted tab id no longer exists
  // (e.g. the old standalone 'pose' tab, now merged into Scene & Pose).
  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  // Save the current form parameters into the Influencers bank as a reusable
  // preset (no generated image — characterImage stays empty, so it shows under
  // "Bank" in the preset picker). addModel surfaces its own success/error toast.
  const addModel = useBankStore((s) => s.addModel)
  const handleSavePreset = (name: string) => {
    void addModel({
      name,
      characterImage: '',
      notes: '',
      source: 'character-studio',
      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>,
    })
  }

  // The full assembled prompt for the current mode — what the Copy prompt
  // button in the first section header puts on the clipboard.
  const fullPrompt = sheetMode ? buildSheetPrompt(profile, sheetAspect) : buildImagePrompt(profile)

  return (
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Rounded segmented toggle — filled so all tabs share the column
          with no horizontal scroll. Sits at the top of the column in a fixed
          h-14 band so its divider lines up with the sidebar header divider. */}
      <div className="flex h-14 items-center px-2">
        <SegmentedToggle<TabId>
          className="h-10 !p-1"
          value={activeTab}
          onChange={onActiveTabChange}
          options={TABS.map((tab) => {
            const fields = getTabFields(tab)
            const filled = fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
            return {
              value: tab.id,
              label: tab.shortLabel ?? tab.label,
              icon: TAB_ICONS[tab.id],
              badge: `${filled}/${fields.length}`,
            }
          })}
        />
      </div>

      {/* Divider between the toggle and the parameter inputs — full width. The
          preset picker + autofill drop zone now live in the action footer,
          directly above the Portrait / Influencer Sheet toggle. */}
      <div className="border-t border-ink/5" />

      {/* Scrollable parameter fields (only scrolls internally on desktop) —
          fields flow without dividers; a hairline separator only marks the
          boundary between groups (identity → skin → eyes → hair, …). */}
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto">
        <div className="flex flex-col gap-7">
          {currentTab.groups.map((group, groupIndex) => {
            const GroupIcon = group.icon
            return (
            <div key={group.id}>
              {/* Section subheading — a left-aligned icon + title-case label,
                  then a hairline rule, so each tab reads as a few scannable
                  sections above the all-caps field labels. The first section's
                  header also carries the right-aligned Copy prompt action. */}
              <div className="mb-3 flex items-center gap-1.5">
                {GroupIcon && <GroupIcon className="h-3.5 w-3.5 text-ink-100" />}
                <h4 className="text-sm font-semibold tracking-tight text-ink-100">{group.label}</h4>
                {groupIndex === 0 && (
                  <PresetActions
                    suggestedName={() => presetName(profile)}
                    onSave={handleSavePreset}
                    promptText={fullPrompt}
                    onClear={onClear}
                  />
                )}
              </div>
              <div className="mb-4 border-t border-ink/10" />
              {/* Two-column grid: short one-word fields (gender, age, eye
                  color…) pack two per row; `wide` fields (free-text /
                  sentence-length presets) span the full row via col-span-2.
                  Field order in types.ts keeps the wide ones grouped so no
                  half field is left stranded next to an empty cell. */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                {group.fields.map((field) => (
                  <div key={field.key} className={field.wide ? 'col-span-2' : 'min-w-0'}>
                    <ChipField
                      label={field.label}
                      value={profile[field.key] ?? ''}
                      onChange={(v) => setField(field.key, v)}
                      placeholder={field.placeholder}
                      defaultLocked={field.key === 'cameraDevice'}
                      suggestions={field.suggestions ?? field.chips}
                    />
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* Action footer — model picker, chips, Generate, and a tight Clear All
          sit at the foot of the controls column, directly under all the inputs
          that feed them. */}
      <GenerateBar
        error={error}
        onGenerate={onGenerate}
        canGenerate={canGenerate}
        onLoadProfile={onProfileChange}
        isExtracting={isExtracting}
        extractError={extractError}
        extractedThumb={extractedThumb}
        onPhotoDrop={onPhotoDrop}
        onResetExtract={onResetExtract}
        aspectRatio={profile.aspectRatio || '9:16'}
        onAspectRatioChange={(value) => onProfileChange({ ...profile, aspectRatio: value })}
        resolution={resolution}
        onResolutionChange={onResolutionChange}
        sheetMode={sheetMode}
        onSheetModeChange={onSheetModeChange}
        sheetAspect={sheetAspect}
        onSheetAspectChange={onSheetAspectChange}
        inFlightCount={inFlightCount}
      />
    </div>
  )
}
