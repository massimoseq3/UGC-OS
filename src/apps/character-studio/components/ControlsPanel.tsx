import { useRef } from 'react'
import { Trash2 } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
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

  // Anchor refs for the section TOC — keyed by group id, pointing at the
  // first field row of each group so a TOC click can scroll to it.
  const groupAnchors = useRef<Record<string, HTMLDivElement | null>>({})

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  // Fields render as one flat divided list; each group's first field carries
  // the scroll anchor for the TOC.
  const flatFields = currentTab.groups.flatMap((group) =>
    group.fields.map((field, i) => ({ field, anchorId: i === 0 ? group.id : null })),
  )

  // Single-group tabs don't need a table of contents.
  const showToc = currentTab.groups.length > 1

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

      {/* Preset card — sits directly under the drop zone */}
      <div className="border-b border-white/5 px-3 py-2">
        <LoadPresetDropdown onLoadProfile={onProfileChange} />
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

      {/* Horizontal section TOC — replaces the old per-group accordions.
          Clicking a label scrolls the field list to that section. */}
      {showToc && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-3 py-2">
          {currentTab.groups.map((group) => {
            const GroupIcon = group.icon
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => groupAnchors.current[group.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
              >
                {GroupIcon && <GroupIcon className="h-3 w-3" strokeWidth={1.5} />}
                {group.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Scrollable parameter fields (only scrolls internally on desktop) —
          one flat list, a hairline separator between every field. */}
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto">
        <div className="flex flex-col divide-y divide-white/5">
          {flatFields.map(({ field, anchorId }) => (
            <div
              key={field.key}
              ref={anchorId ? (el) => { groupAnchors.current[anchorId] = el } : undefined}
              className="scroll-mt-2 py-3.5 first:pt-0 last:pb-0"
            >
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
    </div>
  )
}
