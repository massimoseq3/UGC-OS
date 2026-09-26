import { useState, useRef, useEffect, type ElementType, type ReactNode } from 'react'
import { ScanFace, PersonStanding, Camera, Copy, Check } from 'lucide-react'
import type { TabId, CharacterProfile, FieldGroup } from '../types'
import { TABS, PHOTOREALISM_STYLE, getTabFields } from '../types'

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
import { SectionPresetPill } from '../../../components/SectionCard'
import LoadPresetDropdown from './LoadPresetDropdown'
import PresetPickerModal from './PresetPickerModal'
import PhotoExtractZone from './PhotoExtractZone'
import { buildImagePrompt, buildPhysicalPrompt, buildScenePrompt } from '../services/generateCharacter'
import { copyToClipboard } from '../../../utils/clipboard'
import { suspendChromeAutoHide } from '../../../hooks/useChromeAutoHide'
import { useIsDesktop } from '../../../hooks/useBreakpoint'

// Field keys owned by each tab, derived from the tab config so the scoped
// preset pickers stay in sync with the form. Physical = identity/physical/
// wardrobe; Scene = scene/pose/camera.
const PHYSICAL_KEYS = getTabFields(TABS[0]).map((f) => f.key)
const SCENE_KEYS = getTabFields(TABS[1]).map((f) => f.key)

// A centered pill marking each tab's block. The `center` node (the scoped
// preset button) stands in for the old static label pill — it carries the tab's
// glyph + name and doubles as the preset action. `left` / `right` slots host
// optional actions (Clear / Copy), pinned to the row's edges.
function TabDivider({ center, left, right }: { center: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    // grid-cols-[1fr_auto_1fr], not absolute edge slots: the equal gutters keep
    // the centre pill genuinely centred, and a phone-width column squeezes the
    // side pills instead of sliding them underneath the title (which is exactly
    // what the Physical copy did on top of "Physical Presets" at 390px).
    //
    // Equal gutters also set a floor: each one has to hold the WIDER side, so
    // the Physical row (Clear All · Physical Presets · All + Physical) needs
    // 442px of column, and a phone gives it 335–350. Squeezed below that, the
    // right pair ran off the column and was clipped at the edge. So under 28rem
    // of COLUMN the pill takes its own line and the
    // two utilities sit under it at the edges — a wrap, not a scroll, and a
    // container query because what runs out is this column, not the window
    // (the same squeeze hit the half-width column of a 768–910px window).
    <div className="@container">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 @max-[28rem]:grid-cols-2 @max-[28rem]:gap-y-2">
        <div className="flex min-w-0 justify-start @max-[28rem]:order-2">{left}</div>
        <div className="flex min-w-0 justify-center @max-[28rem]:order-1 @max-[28rem]:col-span-2">{center}</div>
        <div className="flex min-w-0 justify-end @max-[28rem]:order-3">{right}</div>
      </div>
    </div>
  )
}

// Copies a scoped slice of the assembled prompt (physical, or scene & pose) to
// the clipboard. One sits on the right of each tab divider.
function CopyPromptButton({ text, label, shortLabel, title }: { text: string; label: string; shortLabel?: string; title: string }) {
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
      title={title}
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/10 bg-ink/[0.02] px-2.5 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:border-ink/20 hover:bg-ink/[0.05] hover:text-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400 light:text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {/* No "Copy" in the label — the glyph already says it, so the Physical
          pair reads "All" / "Physical" at every width. A `shortLabel` is a
          one-word stand-in where the divider is narrow: the full label wrapped
          onto two lines on a phone, making a 22px pill two rows tall. The
          switch reads the DIVIDER's width (its `@container`), not the window's,
          because what runs out is the column. */}
      {copied ? 'Copied' : shortLabel ? <><span className="@min-[36rem]:hidden">{shortLabel}</span><span className="hidden @min-[36rem]:inline">{label}</span></> : label}
    </button>
  )
}

interface ControlsPanelProps {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
  activeTab: TabId
  onActiveTabChange: (tab: TabId) => void
  analyzingCount: number
  extractError: string | null
  referenceApplied: boolean
  extractedThumb: string | null
  onPhotoDrop: (files: File[]) => void
  onResetExtract: () => void
  onOpenLibrary: () => void
  // The band's whole-character preset load. Absent, it writes straight through
  // `onProfileChange`; Characters passes its own so the load can be undone.
  onLoadPreset?: (profile: CharacterProfile) => void
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
  batchCount: number
  onBatchCountChange: (value: number) => void
  inFlightCount: number
  // Flow's Characters block — see GenerateBar.
  modelId?: string
  onModelChange?: (modelId: string) => void
  actionLabel?: string
}

export default function ControlsPanel({
  profile,
  onProfileChange,
  activeTab,
  onActiveTabChange,
  analyzingCount,
  extractError,
  referenceApplied,
  extractedThumb,
  onPhotoDrop,
  onResetExtract,
  onOpenLibrary,
  onLoadPreset,
  onClear,
  error,
  onGenerate,
  canGenerate,
  resolution,
  onResolutionChange,
  sheetMode,
  onSheetModeChange,
  batchCount,
  onBatchCountChange,
  inFlightCount,
  modelId,
  onModelChange,
  actionLabel,
}: ControlsPanelProps) {
  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  // Scoped preset pickers — each opens the shared preset modal but merges
  // only its own tab's keys onto the current form, leaving the other tab's
  // fields untouched.
  const [physicalPresetOpen, setPhysicalPresetOpen] = useState(false)
  const [scenePresetOpen, setScenePresetOpen] = useState(false)
  // …and one level finer: every section title in the column is itself a scoped
  // picker, merging only that group's keys. Held as the group being picked FOR
  // rather than one flag per group, so a section added to `TABS` gets its own
  // picker with no wiring here.
  const [groupPreset, setGroupPreset] = useState<FieldGroup | null>(null)
  // The whole-form prompt as one editable JSON box — copy the character out, or
  // paste one in. It sits in the band with the other two ways of filling this
  // form (a saved preset, an analyzed photo) rather than on a tab divider,
  // because it is the only one of the three that carries every field at once.

  const applyScopedPreset = (incoming: Record<string, string>, keys: string[]) => {
    const next = { ...profile }
    for (const key of keys) {
      next[key] = typeof incoming[key] === 'string' ? incoming[key] : ''
    }
    // Camera Device is always-on — never let a preset that omits it blank the
    // photorealism style string (mirrors createEmptyProfile).
    if (keys.includes('cameraDevice') && !next.cameraDevice) next.cameraDevice = PHOTOREALISM_STYLE
    onProfileChange(next)
  }

  // All groups render on one scrollable page; the top toggle jumps to a tab's
  // section (like the Ad Analyzer Scorecard/Transcript/Scenes strip) instead of
  // swapping the panel. Refs anchor each tab's block; a scroll-spy keeps the
  // toggle in sync with whichever block sits near the top of the viewport.
  const scrollRef = useRef<HTMLDivElement>(null)
  // The phone's scroller — the wrapper around the fields AND the Generate bar
  // (see below). Below `md` the fields column stops scrolling itself, so this
  // is the box the spy has to watch there.
  const phoneScrollRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Latest onActiveTabChange in a ref so the observer (set up once) never holds
  // a stale closure.
  const onActiveTabChangeRef = useRef(onActiveTabChange)
  useEffect(() => { onActiveTabChangeRef.current = onActiveTabChange }, [onActiveTabChange])

  const scrollToTab = (id: TabId) => {
    onActiveTabChange(id)
    suspendChromeAutoHide()
    tabRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Rooted on whichever box actually SCROLLS at this width. It was always the
  // fields column, which on a phone is `overflow-visible` and simply grows —
  // an observer rooted on a box that doesn't scroll sees its targets move WITH
  // it, never reports a change, and the toggle sat on "Physical" all the way
  // down to the Setting card.
  useEffect(() => {
    const root = isDesktop ? scrollRef.current : phoneScrollRef.current
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
  }, [isDesktop])

  // Scoped prompt slices for the per-divider Copy buttons. Physical = identity/
  // physical/wardrobe (valid in both portrait + sheet modes); Scene & Pose =
  // scene/pose/camera.
  const physicalPrompt = buildPhysicalPrompt(profile)
  const scenePrompt = buildScenePrompt(profile)
  // Both tabs at once — the same JSON the model is actually sent, and the same
  // seed the Prompt JSON modal opens on.
  const fullPrompt = buildImagePrompt(profile)

  return (
    // On a phone everything below the tab toggle is one scroller and the
    // Generate bar is the last thing in it, not a band pinned over the fields —
    // see the note above the GenerateBar below.
    <div className="flex h-full min-h-0 min-w-0 flex-col md:grid md:grid-cols-[76px_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto]">
      {/* Rounded segmented toggle — filled so all tabs share the column with no
          horizontal scroll. The h-[57px] band + bottom hairline is the app-wide
          panel-header spec (Scripts, B-Roll, Bank, Playground, Ad Analyzer and
          Voiceovers all use it), so the left and right columns' divider lines
          land on the same pixel — and `px-5` is the other half of that spec, so
          on a phone this pill shares its left edge with the pane tabs above it.
          From `md` up it sits right of the rail below. */}
      <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5 md:col-start-2 md:row-start-1">
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

      {/* Desktop: the two whole-form fillers — Load Preset and Extract DNA —
          are a vertical rail down the column's left edge (Massimo's
          experiment, September 2026) instead of a band of two pills under the
          tab toggle, which gives the fields that band's height back. It runs
          from the top of the panel to the Generate bar, which spans under it,
          with the two tiles centred on that stretch. A phone keeps the band
          (below): a 76px rail is a fifth of a 375px screen, taken from a
          two-column field grid already tight. From `md` up the panel is a grid
          (rail | toggle + fields, then the Generate bar across both) and the
          phone scroll port below is `md:contents`, so the fields and the bar
          land in it as cells without a second copy of either. */}
      <div className="hidden flex-col justify-center gap-2 border-r border-ink/5 px-2 md:col-start-1 md:row-span-2 md:row-start-1 md:flex">
        <LoadPresetDropdown variant="rail" onLoadProfile={onLoadPreset ?? onProfileChange} />
        <PhotoExtractZone
          variant="rail"
          analyzingCount={analyzingCount}
          extractError={extractError}
          applied={referenceApplied}
          thumbnail={extractedThumb}
          onPhotoDrop={onPhotoDrop}
          onReset={onResetExtract}
          onOpenLibrary={onOpenLibrary}
        />
      </div>

      {/* Phone only — the rail above holds these from `md` up. Preset loader +
          reference-photo autofill, a FIXED band under the tab toggle and a
          sibling of the phone-width scroll port rather than inside it: inside,
          it scrolled away with the fields, and the two things every run starts
          from were gone by the second card. It was a `sticky top-0` child of
          the scroller before that, which pins only once the scroll has
          started, so every overscroll bounce floated it. */}
      {/* Side by side at every width. They were stacked under `sm` because two
          picker rows sharing a phone-width column truncated to "Load Cha…" /
          "Extract C…", which names neither — but the fix for a label that
          doesn't fit is a shorter label, not a second row of chrome on the
          screen with the least of it. Each row carries a short name. */}
      <div className="flex shrink-0 items-center gap-2 px-5 py-2 md:hidden">
        <div className="min-w-0 flex-1">
          <LoadPresetDropdown onLoadProfile={onLoadPreset ?? onProfileChange} />
        </div>
        <div className="min-w-0 flex-1">
          <PhotoExtractZone
            analyzingCount={analyzingCount}
            extractError={extractError}
            applied={referenceApplied}
            thumbnail={extractedThumb}
            onPhotoDrop={onPhotoDrop}
            onReset={onResetExtract}
            onOpenLibrary={onOpenLibrary}
          />
        </div>
      </div>
      {/* The phone's scroll port. It starts BELOW the toggle above, which is
          why that toggle is a sibling of this box and not its first child: the
          panel root used to be the scroller, so the tab bar scrolled away with
          the fields and the member lost the way back to the other tab halfway
          down a form. Above `md` this is a plain wrapper and the column below
          scrolls on its own. */}
      <div ref={phoneScrollRef} className="flex min-h-0 flex-1 flex-col max-md:overflow-y-auto md:contents">
        {/* Scrollable parameter fields. Every
            tab's groups render on one page — each group sits in its own card, and
            the top toggle scroll-jumps between tab blocks (Ad Analyzer pattern).
            Both edges feather out — under the Generate bar and under the pinned
            band above — so fields dissolve at the boundary instead of cutting off
            mid-row, which reads as a render glitch. */}
        {/* On a phone this stops being a scroller of its own and simply grows —
            the column above scrolls. The feathered edges go with it: they mark
            where content passes under pinned chrome, and on a phone there is
            none to pass under. */}
        {/* The app's invisible scrollbar still takes an 11px track (index.css),
            and it sits OUTSIDE the padding — so at `px-5` the cards carried 31px
            on the right against 20 on the left and stopped lining up with the
            tab pill above and the Generate bar below. The right padding gives
            it back (`pr-[9px]` = 20 − 11), with the gutter held `stable` so it
            doesn't move when the column stops overflowing — Voiceovers'
            SettingsView idiom. `touch:` and `max-md:` restore the full 20
            where there is no track: a touch screen has none, and on a phone
            this box doesn't scroll at all. */}
        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-4 pl-5 pr-[9px] [scrollbar-gutter:stable] touch:pr-5 max-md:pr-5 md:col-start-2 md:row-start-2 [mask-image:linear-gradient(to_bottom,transparent_0,black_0.5rem,black_calc(100%-1.5rem),transparent_100%)] max-md:flex-none max-md:overflow-visible max-md:[mask-image:none]"
        >
          <div className="flex flex-col gap-4 pt-2">
            {TABS.map((tab, tabIndex) => (
              <div
                key={tab.id}
                ref={(el) => { tabRefs.current[tab.id] = el }}
                data-tab={tab.id}
                className="flex scroll-mt-20 flex-col gap-4"
              >
                {/* Tab divider — a centered preset button on a full-width line
                    (mirrors the History date pills), marking each tab's block. The
                    centered button doubles as the scoped preset picker; Clear all
                    sits on the left and the scoped Copy on the right of every
                    divider. The scoped Copy carries one TAB's fields; Copy All,
                    beside it on the Physical divider, carries the whole prompt. */}
                <TabDivider
                  /* "Clear all", not "New" (September 2026, Massimo's call).
                     It is the same ClearAllButton every other input panel
                     wears and it still clears INPUTS ONLY — every generated
                     character stays in the gallery and in history — which is
                     what the shared component's "New" wording was protecting.
                     The two-click arm, the "Confirm" state and the tooltip
                     that spells out what survives all stay, and they are what
                     carries that promise now the label doesn't. */
                  left={<ClearAllButton onClear={onClear} label="Clear All" className="!py-1 !text-[11px]" />}
                  center={
                    tabIndex === 0 ? (
                      <SectionPresetPill
                        label="Physical Presets"
                        title="Load only the physical fields from a preset"
                        icon={TAB_ICONS.physical}
                        onClick={() => setPhysicalPresetOpen(true)}
                      />
                    ) : (
                      <SectionPresetPill
                        label="Scene & Pose Presets"
                        title="Load only the scene & pose fields from a preset"
                        icon={TAB_ICONS.scene}
                        onClick={() => setScenePresetOpen(true)}
                      />
                    )
                  }
                  right={
                    tabIndex === 0 ? (
                      // The WHOLE prompt sits with the scoped copies rather
                      // than as a glyph-only circle on the panel's tab bar
                      // (September 2026, Massimo's call). Up there it was an
                      // unlabelled button beside a toggle, and the one action
                      // that can't say what its scope is was the one with no
                      // word on it; down here it is read against "Physical"
                      // standing next to it, which is what makes "All" mean
                      // something.
                      <div className="flex min-w-0 items-center gap-1">
                        <CopyPromptButton text={fullPrompt} label="All" title="Copy the full prompt · every field on both tabs" />
                        <CopyPromptButton text={physicalPrompt} label="Physical" title="Copy the physical fields as a prompt" />
                      </div>
                    ) : (
                      <CopyPromptButton text={scenePrompt} label="Scene & Pose" shortLabel="Scene" title="Copy the scene & pose fields as a prompt" />
                    )
                  }
                />
                {tab.groups.map((group) => {
                  const GroupIcon = group.icon
                  return (
                    <div key={group.id} className="rounded-2xl border border-ink/5 bg-ink/[0.02] p-4 card-soft-shadow">
                      {/* Section subheading — a centered icon + title-case label,
                          then a hairline rule. The heading IS the section's own
                          preset button: same dashed pill as the tab dividers
                          above it, in ink rather than the influencers accent,
                          filling only this group's fields. */}
                      <h4 className="mb-3 flex justify-center">
                        <SectionPresetPill
                          tone="neutral"
                          label={group.label}
                          title={`Load only the ${group.label.toLowerCase()} fields from a preset`}
                          icon={GroupIcon}
                          onClick={() => setGroupPreset(group)}
                        />
                      </h4>
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
            that feed them.

            Pinned from `md` up only (August 2026, Massimo's call). On a phone a
            fixed band stood over the 28 fields it belongs to and cost most of a
            short column; you fill the form top to bottom, and Generate is where
            you arrive. */}
        <div className="min-w-0 shrink-0 md:col-span-2 md:row-start-3">
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
          batchCount={batchCount}
          onBatchCountChange={onBatchCountChange}
          inFlightCount={inFlightCount}
          modelId={modelId}
          onModelChange={onModelChange}
          actionLabel={actionLabel}
        />
        </div>

        {/* Scoped preset pickers — same modal as the footer's full picker,
            but each merges only its tab's fields onto the current form. */}
        {/* Every picker is mounted only while it's open — the grid, its page
            count and the rail's highlight then belong to that opening, which
            is the component's own contract (see its doc). */}
        {physicalPresetOpen && (
          <PresetPickerModal
            open
            onClose={() => setPhysicalPresetOpen(false)}
            onPick={(incoming) => applyScopedPreset(incoming, PHYSICAL_KEYS)}
            title="Physical Presets"
            subtitle="Fill only the physical fields"
          />
        )}
        {scenePresetOpen && (
          <PresetPickerModal
            open
            onClose={() => setScenePresetOpen(false)}
            onPick={(incoming) => applyScopedPreset(incoming, SCENE_KEYS)}
            title="Scene & Pose Presets"
            subtitle="Fill only the scene & pose fields"
          />
        )}
        {/* One picker for every section title, scoped to whichever heading was
            clicked — eight always-mounted copies would each hold their own
            grid. */}
        {groupPreset && (
          <PresetPickerModal
            open
            onClose={() => setGroupPreset(null)}
            onPick={(incoming) => applyScopedPreset(incoming, groupPreset.fields.map((f) => f.key))}
            title={`${groupPreset.label} Presets`}
            subtitle={`Fill only the ${groupPreset.label.toLowerCase()} fields`}
          />
        )}

      </div>
    </div>
  )
}
