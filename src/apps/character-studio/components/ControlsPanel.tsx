import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import type { TabId, CharacterProfile, FieldGroup } from '../types'
import { TABS, getTabFields, createEmptyProfile } from '../types'
import ChipField from './ChipField'
import PhotoExtractZone from './PhotoExtractZone'

interface ControlsPanelProps {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
  activeTab: TabId
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
  isExtracting,
  extractError,
  extractedThumb,
  onPhotoDrop,
  onResetExtract,
}: ControlsPanelProps) {
  const currentTab = TABS.find((t) => t.id === activeTab)!
  const allFields = getTabFields(currentTab)
  const filledCount = allFields.filter((f) => (profile[f.key] ?? '').trim() !== '').length

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
        />
      ))}
    </div>
  )

  // If the tab only has one group, render its fields flat — no accordion.
  const isFlat = currentTab.groups.length === 1

  return (
    <div className="flex h-full flex-col">
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

      {/* Tab label header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-zinc-100">{currentTab.label}</span>
          <span className="text-[10px] tabular-nums text-zinc-400">
            {filledCount}/{allFields.length}
          </span>
        </div>
        <button
          onClick={() => onProfileChange(createEmptyProfile())}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-3 w-3 shrink-0" />
          Clear all inputs
        </button>
      </div>

      {/* Scrollable parameter fields */}
      <div className="flex-1 overflow-y-auto p-4">
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
