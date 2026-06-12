import type { TabId, CharacterProfile } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'
import ChipField from './ChipField'
import PhotoExtractZone from './PhotoExtractZone'
import LoadPresetDropdown from './LoadPresetDropdown'
import SegmentedToggle from '../../../components/SegmentedToggle'
import ClearAllButton from '../../../components/ClearAllButton'

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

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  return (
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Top-left "Clear All" link, above the presets. */}
      <div className="px-3 pb-1.5 pt-3">
        <ClearAllButton onClear={() => onProfileChange(createEmptyProfile())} />
      </div>

      {/* Preset picker + reference-image drop zone. */}
      <div className="flex items-stretch gap-2 px-3 pb-2 pt-0">
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

      {/* Rounded segmented toggle — filled so all 4 tabs share the column
          with no horizontal scroll. */}
      <div className="px-2 pb-1 pt-0.5">
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
        <div className="flex flex-col divide-y divide-white/5">
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
    </div>
  )
}
