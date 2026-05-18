import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import type { TabId, CharacterProfile, FieldGroup } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'
import ChipField from './ChipField'
import PhotoExtractZone from './PhotoExtractZone'
import LoadPresetDropdown from './LoadPresetDropdown'

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
    <div className="flex min-w-0 flex-col md:h-full">
      {/* Top: drop zone with Clear all chip */}
      <div className="border-b border-white/5 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400">Auto-fill from reference image</span>
          <button
            type="button"
            onClick={() => onProfileChange(createEmptyProfile())}
            className="flex shrink-0 items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.75} />
            Clear all
          </button>
        </div>
        <PhotoExtractZone
          isExtracting={isExtracting}
          extractError={extractError}
          thumbnail={extractedThumb}
          onPhotoDrop={onPhotoDrop}
          onReset={onResetExtract}
        />
      </div>

      {/* Fixed segmented tabs — Playground style. flex-1 per tab so all 4 fit
          the column with no horizontal scroll. Label + small count chip. */}
      <div className="flex min-w-0 items-center border-b border-white/5 px-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          const fields = getTabFields(tab)
          const filled = fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
          return (
            <button
              key={tab.id}
              onClick={() => onActiveTabChange(tab.id)}
              className={`relative flex flex-1 min-w-0 items-center justify-center gap-1 px-1 pb-2 pt-2.5 text-[12px] font-medium tracking-tight transition-colors ${isActive
                ? 'text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="truncate">{tab.shortLabel ?? tab.label}</span>
              <span className={`shrink-0 rounded-full px-1 py-0.5 text-[9px] font-semibold tabular-nums ${isActive
                ? 'bg-white/10 text-zinc-300'
                : 'bg-white/[0.04] text-zinc-500'
              }`}>
                {filled}/{fields.length}
              </span>
              <span
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${
                  isActive ? 'bg-zinc-100' : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* Load Preset from Bank — sits right under the tabs, above the first field group */}
      <div className="border-b border-white/5 px-3 py-2">
        <LoadPresetDropdown onLoadProfile={onProfileChange} />
      </div>

      {/* Scrollable parameter fields (only scrolls internally on desktop) */}
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto">
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
