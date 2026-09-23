import { useState } from 'react'
import { Search, Play, Pause, Check } from 'lucide-react'
import type { Gender, VoiceOption } from '../types'
import { VOICES } from '../types'
import SegmentedToggle from '../../../components/SegmentedToggle'
import CountSlot from '../../../components/CountSlot'
import { GallerySectionHeading } from '../../../components/SectionRail'

import { seedColor } from './seedColor'
import { useVoicePreview } from './useVoicePreview'

interface VoicePickerViewProps {
  selectedId: string
  onSelect: (voice: VoiceOption) => void
}

// The toggle's segments, and the headings the list is grouped under: All, then the two
// genders. It was Google's four published PITCH bands (higher / middle /
// lower-middle / lower) until September 2026 (Massimo's call). Pitch is real
// data and it stays on the row's type, but it isn't the question anyone opens
// this list with — a UGC ad is cast as a woman or a man reading to camera, and
// four bands split each of those across four headings, so finding "a warm
// female read" meant scanning all four. The avatar metals follow the same
// split (see `seedColor`), so the disc and the heading agree.
type GenderFilter = 'All' | Gender
const GENDER_FILTERS: GenderFilter[] = ['All', 'Female', 'Male']
const GENDER_ORDER: Gender[] = ['Female', 'Male']

// The BODY of the voice picker — the toolbar (search + gender toggle) and the
// grouped list. `PickerModal` supplies the shell and the title;
// `PresetPickerView` fills the same shell with the same row shape.
export default function VoicePickerView({ selectedId, onSelect }: VoicePickerViewProps) {
  const [query, setQuery] = useState('')
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('All')
  const { previewingId, loadingId, toggle } = useVoicePreview()

  // Search first, so the toggle's counts are what each segment would actually
  // show (BankPicker's rule); then the gender filter; then group by gender with
  // a heading per group, so the list reads as the two casts it is.
  const q = query.trim().toLowerCase()
  const searched = q
    ? VOICES.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q),
      )
    : VOICES
  const countFor = (g: GenderFilter) => (g === 'All' ? searched.length : searched.filter((v) => v.gender === g).length)
  const filtered = genderFilter === 'All' ? searched : searched.filter((v) => v.gender === genderFilter)
  const groups = GENDER_ORDER
    .map((g) => [g, filtered.filter((v) => v.gender === g)] as const)
    .filter(([, list]) => list.length > 0)

  const totalCount = groups.reduce((n, [, list]) => n + list.length, 0)

  const handlePreview = (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation()
    toggle(voice.id, voice.id)
  }

  const renderRow = (voice: VoiceOption) => {
    const isSelected = voice.id === selectedId
    const isPlaying = previewingId === voice.id
    const isLoading = loadingId === voice.id

    return (
      <div
        key={voice.id}
        onClick={() => onSelect(voice)}
        className={`group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
          isSelected ? 'bg-voice-500/15' : 'hover:bg-ink/[0.04]'
        }`}
      >
        {/* Avatar with loading ring */}
        <button
          type="button"
          onClick={(e) => handlePreview(voice, e)}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          aria-label={isPlaying ? 'Stop preview' : 'Preview voice'}
        >
          <span className="absolute inset-0 rounded-full" style={{ background: seedColor(voice.id) }} />
          {isLoading && (
            <span className="absolute -inset-[3px] rounded-full border-2 border-ink/10 border-t-ink animate-spin" />
          )}
          {isPlaying && <span className="absolute -inset-[3px] rounded-full border-2 border-voice-400" />}
          {/* `touch:opacity-100`: a phone has no hover to reveal the glyph,
              and it is the only thing saying a tap on the disc is a sample.
              Its resting scrim is lighter there (`/15`), since it shows on all
              thirty discs at once and the metal is what says whose voice. */}
          <span
            className={`relative flex h-full w-full items-center justify-center rounded-full bg-black/40 text-white transition-opacity ${
              isPlaying || isLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 touch:bg-black/15 touch:opacity-100'
            }`}
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
          </span>
        </button>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`truncate text-sm font-medium ${isSelected ? 'text-ink-50' : 'text-ink-100'}`}>
              {voice.name}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-500">
              {voice.category}
            </span>
          </div>
          <div className="truncate text-xs text-ink-400">{voice.description}</div>
        </div>

        {isSelected && <Check className="h-4 w-4 shrink-0 text-voice-300" />}
      </div>
    )
  }

  return (
    <>
      {/* ONE toolbar row, BankPicker's shape: search, then the filter that
          narrows it. The gender pair is the house `SegmentedToggle` with its
          counts in a `CountSlot`, the same control the character picker and
          Playground's Choose a Voice filter by — it was a row of loose chips
          of its own, left-aligned on a line under the search. `fitContent='md'`:
          on a phone the row wraps and the toggle takes its own line at full
          width rather than stopping short of the edge. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/5 px-5 py-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices..."
            className="w-full rounded-full border border-ink/10 bg-transparent py-2 pl-10 pr-3 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-voice-500/40"
          />
        </div>
        <SegmentedToggle
          value={genderFilter}
          onChange={setGenderFilter}
          accent="voice"
          dense
          fitContent="md"
          className="md:shrink-0"
          options={GENDER_FILTERS.map((g) => ({ value: g, label: g, badge: <CountSlot value={countFor(g)} /> }))}
        />
      </div>

      {/* Voice list — grouped by gender, each group under the house section
          pill (`GallerySectionHeading`, i.e. `DayPill`) every other gallery
          picker heads its sections with; the count moved to the toggle above.
          The panel holds its full height (`fill`), so the empty state simply
          pads. `scrollbar-gutter: stable`, as in `Modal`'s body: a filter that
          stops the list overflowing would otherwise hand the 11px track back
          to the content box and slide every centred pill sideways. */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {totalCount === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="text-sm text-ink-500">No voices match these filters.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {groups.map(([g, list], i) => (
              <div key={g} className="flex flex-col gap-0.5">
                <GallerySectionHeading label={g} className={i === 0 ? 'mb-1.5 mt-2' : 'mb-1.5 mt-4'} />
                {list.map(renderRow)}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
