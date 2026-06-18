import type { ElementType } from 'react'
import { ScanFace, PersonStanding, Camera } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'

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
import LoadPresetDropdown from './LoadPresetDropdown'
import PhotoExtractZone from './PhotoExtractZone'
import SegmentedToggle from '../../../components/SegmentedToggle'
import { useBankStore } from '../../../stores/bankStore'
import { buildJsonPrompt } from '../services/generateCharacter'

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
  const handleSavePreset = () => {
    void addModel({
      name: presetName(profile),
      characterImage: '',
      notes: '',
      source: 'character-studio',
      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>,
    })
  }

  return (
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Rounded segmented toggle — filled so all tabs share the column
          with no horizontal scroll. Sits at the top of the column. */}
      <div className="px-2 pb-2.5 pt-3">
        <SegmentedToggle<TabId>
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

      {/* Divider between the toggle and the presets/dropzone row. */}
      <div className="mx-3 border-t border-ink/5" />

      {/* Preset picker + reference-image drop zone — same pill styling as the
          model picker, sitting just under the toggle. */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <LoadPresetDropdown onLoadProfile={onProfileChange} />
        </div>
        <div className="min-w-0 flex-1">
          <PhotoExtractZone
            isExtracting={isExtracting}
            extractError={extractError}
            thumbnail={extractedThumb}
            onPhotoDrop={onPhotoDrop}
            onReset={onResetExtract}
            onSavePreset={handleSavePreset}
          />
        </div>
      </div>

      {/* Divider between the toggle/presets block and the parameter inputs. */}
      <div className="mx-3 border-t border-ink/5" />

      {/* Scrollable parameter fields (only scrolls internally on desktop) —
          fields flow without dividers; a hairline separator only marks the
          boundary between groups (identity → skin → eyes → hair, …). */}
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto">
        <div className="flex flex-col gap-7">
          {currentTab.groups.map((group) => {
            const GroupIcon = group.icon
            return (
            <div key={group.id}>
              {/* Section subheading — a left-aligned icon + title-case label,
                  then a hairline rule, so each tab reads as a few scannable
                  sections above the all-caps field labels. */}
              <div className="mb-3 flex items-center gap-1.5">
                {GroupIcon && <GroupIcon className="h-3.5 w-3.5 text-ink-100" />}
                <h4 className="text-sm font-semibold tracking-tight text-ink-100">{group.label}</h4>
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
        aspectRatio={profile.aspectRatio || '9:16'}
        onAspectRatioChange={(value) => onProfileChange({ ...profile, aspectRatio: value })}
        resolution={resolution}
        onResolutionChange={onResolutionChange}
        sheetMode={sheetMode}
        onSheetModeChange={onSheetModeChange}
        sheetAspect={sheetAspect}
        onSheetAspectChange={onSheetAspectChange}
        inFlightCount={inFlightCount}
        onClear={() => onProfileChange(createEmptyProfile())}
      />
    </div>
  )
}
