import type { TabId, CharacterProfile } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'
import type { ImageResolution } from '../../../utils/models'
import ChipField from './ChipField'
import GenerateBar from './GenerateBar'
import LoadPresetDropdown from './LoadPresetDropdown'
import PhotoExtractZone from './PhotoExtractZone'
import SegmentedToggle from '../../../components/SegmentedToggle'

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
  inFlightCount,
}: ControlsPanelProps) {
  const currentTab = TABS.find((t) => t.id === activeTab)!

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  return (
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Preset picker + reference-image drop zone — same pill styling as the
          model picker, sitting at the top of the column. */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
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
          />
        </div>
      </div>

      {/* Divider between the presets and the toggle. */}
      <div className="mx-3 border-t border-ink/5" />

      {/* Rounded segmented toggle — filled so all 4 tabs share the column
          with no horizontal scroll. */}
      <div className="px-2 pb-1 pt-2.5">
        <SegmentedToggle<TabId>
          value={activeTab}
          onChange={onActiveTabChange}
          options={TABS.map((tab) => {
            const fields = getTabFields(tab)
            const filled = fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
            return {
              value: tab.id,
              label: tab.shortLabel ?? tab.label,
              badge: `${filled}/${fields.length}`,
            }
          })}
        />
      </div>

      {/* Scrollable parameter fields (only scrolls internally on desktop) —
          fields flow without dividers; a hairline separator only marks the
          boundary between groups (identity → skin → eyes → hair, …). */}
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto">
        <div className="flex flex-col divide-y divide-ink/5">
          {currentTab.groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">
              {group.fields.map((field) => (
                <ChipField
                  key={field.key}
                  label={field.label}
                  value={profile[field.key] ?? ''}
                  onChange={(v) => setField(field.key, v)}
                  placeholder={field.placeholder}
                  defaultLocked={field.key === 'cameraDevice'}
                  suggestions={field.suggestions ?? field.chips}
                />
              ))}
            </div>
          ))}
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
        inFlightCount={inFlightCount}
        onClear={() => onProfileChange(createEmptyProfile())}
      />
    </div>
  )
}
