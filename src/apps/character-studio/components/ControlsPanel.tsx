import { useState } from 'react'
import { XCircle } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'
import ChipField from './ChipField'
import PhotoExtractZone from './PhotoExtractZone'
import LoadPresetDropdown from './LoadPresetDropdown'
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
  const [confirmClear, setConfirmClear] = useState(false)
  const currentTab = TABS.find((t) => t.id === activeTab)!

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  return (
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Rounded segmented toggle — filled so all 4 tabs share the column
          with no horizontal scroll. Label + small filled-count chip. */}
      <div className="px-2 pb-1 pt-2">
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

      {/* Preset picker + reference-image drop zone live below the toggles.
          The clear-all control (X-in-circle) sits next to the drop zone. */}
      <div className="flex items-stretch gap-2 border-b border-white/5 px-3 pb-2.5 pt-1">
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
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          title="Clear all fields"
          aria-label="Clear all fields"
          className="flex w-10 shrink-0 items-center justify-center self-stretch rounded-2xl border border-red-500/15 bg-red-500/[0.04] text-red-400/80 transition-colors hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-300"
        >
          <XCircle className="h-5 w-5" strokeWidth={1.75} />
        </button>
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

      {/* Clear-all confirmation popup */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmClear(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#0c0c0e] p-5 shadow-2xl"
          >
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <XCircle className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <p className="mt-1 text-sm font-semibold tracking-tight text-zinc-100">Clear all fields?</p>
              <p className="text-xs leading-relaxed text-zinc-400">
                Are you sure you want to clear all the input fields?
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="flex-1 rounded-full border border-white/10 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { onProfileChange(createEmptyProfile()); setConfirmClear(false) }}
                className="flex-1 rounded-full bg-red-500/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
