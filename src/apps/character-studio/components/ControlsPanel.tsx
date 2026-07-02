import { useState, useRef, useEffect, type ElementType, type ReactNode } from 'react'
import { ScanFace, PersonStanding, Camera, Copy, Check } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
import { TABS } from '../types'

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
import { buildImagePrompt, buildSheetPrompt } from '../services/generateCharacter'
import { copyToClipboard } from '../../../utils/clipboard'

// A centered icon + label pill marking each tab's block of sections (same
// icon + title-case style as the top toggle). `left` / `right` slots host
// optional actions (Clear / Copy), pinned to the row's edges.
function TabDivider({ label, icon: Icon, left, right }: { label: string; icon: ElementType; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative flex items-center justify-center">
      {left && <div className="absolute left-0">{left}</div>}
      <span className="flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1 text-[12px] font-medium text-ink-300">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      {right && <div className="absolute right-0">{right}</div>}
    </div>
  )
}

// Copies the full assembled prompt (exactly what would be sent to the image
// model) to the clipboard. Sits on the right of the first tab divider.
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
  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  // All groups render on one scrollable page; the top toggle jumps to a tab's
  // section (like the Ad Analyzer Scorecard/Transcript/Scenes strip) instead of
  // swapping the panel. Refs anchor each tab's block; a scroll-spy keeps the
  // toggle in sync with whichever block sits near the top of the viewport.
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Latest onActiveTabChange in a ref so the observer (set up once) never holds
  // a stale closure.
  const onActiveTabChangeRef = useRef(onActiveTabChange)
  useEffect(() => { onActiveTabChangeRef.current = onActiveTabChange }, [onActiveTabChange])

  const scrollToTab = (id: TabId) => {
    onActiveTabChange(id)
    tabRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const els = Object.values(tabRefs.current).filter(Boolean) as HTMLElement[]
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const key = visible[0]?.target.getAttribute('data-tab') as TabId | null
        if (key) onActiveTabChangeRef.current(key)
      },
      { root, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // The full assembled prompt for the current mode — what the Copy prompt
  // button in the first tab divider puts on the clipboard.
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
          onChange={scrollToTab}
          options={TABS.map((tab) => ({
            value: tab.id,
            label: tab.shortLabel ?? tab.label,
            icon: TAB_ICONS[tab.id],
          }))}
        />
      </div>

      {/* Divider between the toggle and the parameter inputs — full width. The
          preset picker + autofill drop zone now live in the action footer,
          directly above the Portrait / Influencer Sheet toggle. */}
      <div className="border-t border-ink/5" />

      {/* Scrollable parameter fields (only scrolls internally on desktop). Every
          tab's groups render on one page — each group sits in its own card, and
          the top toggle scroll-jumps between tab blocks (Ad Analyzer pattern). */}
      <div ref={scrollRef} className="min-w-0 flex-1 p-4 md:overflow-y-auto">
        <div className="flex flex-col gap-4">
          {TABS.map((tab, tabIndex) => (
            <div
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el }}
              data-tab={tab.id}
              className="flex scroll-mt-4 flex-col gap-4"
            >
              {/* Tab divider — a centered pill on a full-width line (mirrors the
                  History date pills), marking each tab's block. The first tab's
                  divider also hosts the global Clear (left) + Copy (right)
                  actions, using the space on either side of the pill. */}
              <TabDivider
                label={tab.shortLabel ?? tab.label}
                icon={TAB_ICONS[tab.id]}
                left={tabIndex === 0 ? <ClearAllButton onClear={onClear} label="Clear" className="!py-1 !text-[11px]" /> : undefined}
                right={tabIndex === 0 ? <CopyPromptButton text={fullPrompt} /> : undefined}
              />
              {tab.groups.map((group) => {
                const GroupIcon = group.icon
                return (
                  <div key={group.id} className="rounded-2xl border border-ink/5 bg-ink/[0.02] p-4 card-soft-shadow">
                    {/* Section subheading — a centered icon + title-case label,
                        then a hairline rule. */}
                    <div className="mb-3 flex items-center justify-center gap-1.5">
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
                            wideMenu={field.wideMenu}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
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
