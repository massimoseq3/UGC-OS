import { useRef, useState, type ReactNode, type Ref } from 'react'
import { Bookmark, ChevronDown, ChevronRight, Ellipsis, Mic, RotateCcw, X, SlidersHorizontal } from 'lucide-react'
import type { VoiceSettings } from '../types'
import { DEFAULT_VOICE_SETTINGS, getVoiceById, VOICE_STYLES, VOICE_PACES, VOICE_ACCENTS } from '../types'
import { seedColor } from './seedColor'
import Slider from './Slider'
import Dropdown from '../../../components/Dropdown'
import SectionCard, { SectionPresetPill, StatusDot } from '../../../components/SectionCard'
import { usePersistedState } from '../../../hooks/usePersistedState'
import { suspendChromeAutoHide } from '../../../hooks/useChromeAutoHide'

// Whether the More section is open. Per browser and shared by every host of
// this column (the app and Flow's Voiceovers window): it is how much of the
// panel a member wants to look at, not a setting of any one read.
const MORE_OPEN_KEY = 'ai-ugc-lab:voice-studio:more-open'

// One size for every setting subheading (Style / Pace / Accent /
// Expressiveness / Tone / Scene). Influencers' small-caps field register: the
// settings now sit inside titled section cards, and a 13px sentence-case label
// under a 13px card title reads as two competing headings. Slider carries the
// same class on its own label — keep the two in step.
const SETTING_LABEL = 'text-[11px] font-medium uppercase tracking-wider text-ink-300'

interface SettingsViewProps {
  settings: VoiceSettings
  onSettingsChange: (next: VoiceSettings) => void
  onOpenVoicePicker: () => void
  onOpenPresetPicker: () => void
  // The TTS model row, rendered inside More. A slot rather than a picker built
  // in here because the two hosts persist the pick differently: the app writes
  // the member's `voice-studio:tts` default, Flow's window writes the block's
  // own settings and keeps its picker in its run band — so Flow passes nothing.
  modelRow?: ReactNode
  // The picked model's name, for More's folded summary line.
  modelName?: string
}

export default function SettingsView({ settings, onSettingsChange, onOpenVoicePicker, onOpenPresetPicker, modelRow, modelName }: SettingsViewProps) {
  const voice = getVoiceById(settings.voiceId)
  // Folded by default: More holds the controls a first read never needs.
  const [moreOpen, setMoreOpen] = usePersistedState<boolean>(MORE_OPEN_KEY, false)
  // Tone / Context is the one box that flexes, so unfolding More used to take
  // its height straight out of it (Massimo's report, September 2026: "it
  // shouldn't eat into the tone/context box"). Opening More pins it at the
  // height it had the moment before, and the column scrolls instead. A column
  // that loads with More already open has no "before" to read, so it takes the
  // box's full four lines.
  const toneRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const [toneFloor, setToneFloor] = useState<number | null>(null)
  const toggleMore = () => {
    if (moreOpen) {
      setToneFloor(null)
      setMoreOpen(false)
      return
    }
    setToneFloor(toneRef.current?.offsetHeight ?? null)
    setMoreOpen(true)
    // What just opened now sits below the fold, so bring it up — otherwise
    // the click looks like it did nothing. Programmatic, so the phone dock
    // must not read it as the member scrolling.
    requestAnimationFrame(() => {
      suspendChromeAutoHide()
      moreRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  // Every hand edit drops the preset stamp — once a control moves, the settings
  // are no longer that preset, and the row must not keep claiming they are.
  const update = (patch: Partial<VoiceSettings>) =>
    onSettingsChange({ ...settings, ...patch, presetId: undefined, presetLabel: undefined })

  // DEFAULT_VOICE_SETTINGS carries explicit `undefined` preset fields, so a
  // reset also drops a loaded preset's stamp — the settings are no longer that
  // preset.
  const handleReset = () => {
    onSettingsChange({ ...settings, ...DEFAULT_VOICE_SETTINGS })
  }

  return (
    // `scrollbar-gutter: stable`, as in `Modal`'s body: the app's invisible
    // scrollbar still takes its 11px track, but only while the column
    // overflows — and unfolding More is exactly what tips it over, so every
    // centred card title jumped sideways on the click (Massimo's report,
    // September 2026). Reserved in both states it never moves; on a phone the
    // track is 0px anyway. The reserved 11px sits OUTSIDE the padding, so the
    // content's right padding gives it back (`pr-[9px]` = 20 − 11) — otherwise
    // the cards carry 31px on the right against 20 on the left and stop lining
    // up with the stepper and Generate below, which live outside this scroller.
    // `touch:` restores the full 20 where there is no track (index.css).
    <div className="flex h-full flex-col overflow-y-auto [scrollbar-gutter:stable]">
      {/* `min-h-full`: the column is at least as tall as its scroller, so the
          two direction boxes below have leftover height to open into — and on a
          short window they give it back rather than pushing Scene under the
          Generate bar, which is what used to slice it in half. `pb-2`, not
          `pb-6`: the bar carries its own `pt-3`, so 24 here spent 36px of a
          column that was overflowing on the gap above the thing it overflowed
          into. `gap-2`, not `gap-3`: 8px between rows is the house rhythm every
          other input column runs on, and this was the one at 12. */}
      <div className="flex min-h-full flex-col gap-2 pb-2 pl-5 pr-[9px] pt-4 touch:pr-5">
        {/* Who is speaking. The card holds one control on purpose — the header
            is what carries the preset pill, and a preset writes every setting
            in this panel, so it needs a home above the first of them rather
            than a row of its own competing with the voice. No dots: the voice
            always holds a value, and a lone permanent green dot is decoration
            that teaches you to stop reading them. */}
        <SectionCard
          icon={Mic}
          title="Voice"
          /* The HEADING is the way into the presets (September 2026, Massimo's
             call) — Playground's Voice card and every section title in
             Influencers already work this way, so a dashed ring plus a chevron
             is what a list of saved presets looks like app-wide. It replaces a
             separate "Presets" pill in the left gutter, which made a one-control
             card carry two controls in its header and left the title, the thing
             the pill fills, as the only part of the row you couldn't click.
             `size='sm'` is SectionCard's own 13px title, so it stacks with
             "Delivery" below at one heading size. */
          titleNode={
            <SectionPresetPill
              tone="neutral"
              size="sm"
              icon={Mic}
              label="Voice"
              title="Load a saved voice preset from the bank"
              onClick={onOpenPresetPicker}
            />
          }
          /* Which preset the settings CAME from, and the way to detach it —
             not a way in, which is why it is only ever the loaded state now.
             It keeps the left gutter, mirroring Delivery's Reset opposite. */
          left={
            settings.presetLabel ? (
              <PresetStamp
                label={settings.presetLabel}
                onOpen={onOpenPresetPicker}
                onClear={() => onSettingsChange({ ...settings, presetId: undefined, presetLabel: undefined })}
              />
            ) : undefined
          }
        >
          {/* Voice — clickable, slides into picker. Its name is the row itself,
              so the small-caps label above it is gone with the card title. */}
          <button
            onClick={onOpenVoicePicker}
            className="flex w-full items-center gap-3 rounded-full border border-voice-500/25 bg-voice-500/[0.06] px-3.5 py-2.5 text-left transition-colors hover:bg-voice-500/10"
          >
            <span
              className="h-8 w-8 shrink-0 rounded-full"
              style={{ background: voice ? seedColor(voice.id) : 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            />
            <div className="min-w-0 flex-1">
              {/* 13px: the same trigger text B-Roll's reference cards use, so
                  a picked voice reads at the weight a picker row does app-wide. */}
              <div className="truncate text-[13px] font-medium text-ink-100">{settings.voiceName}</div>
              {voice?.description && (
                <div className="truncate text-[11px] text-ink-400">{voice.description}</div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
          </button>
        </SectionCard>

        {/* How it's said. Reset rides on this card's header rather than at the
            foot of the whole column, where it sat a long scroll away from the
            controls it restores and read as a panel-level action. */}
        <SectionCard
          icon={SlidersHorizontal}
          title="Delivery"
          contentClassName="flex flex-col gap-3"
          right={
            /* Toned like the shared ClearAllButton ("New") so the two read as
               the same class of affordance; not that component, since this
               restores defaults rather than clearing inputs and stays a single
               click. */
            <button
              type="button"
              onClick={handleReset}
              title="Restore the delivery settings to their defaults"
              className="flex items-center gap-1 rounded-full bg-ink/[0.03] px-2 py-0.5 text-[10px] text-ink-500 transition-colors hover:bg-ink/[0.06] hover:text-ink-300"
            >
              <RotateCcw className="h-2.5 w-2.5" strokeWidth={2.5} />
              Reset
            </button>
          }
        >
          {/* Style — full width */}
          <Field label="Style">
            <Dropdown value={settings.style} options={VOICE_STYLES} onChange={(style) => update({ style })} />
          </Field>

          {/* Pace + Accent — side by side to save vertical space */}
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Pace">
              <Dropdown compact value={settings.pace} options={VOICE_PACES} onChange={(pace) => update({ pace })} />
            </Field>
            <Field label="Accent">
              <Dropdown compact value={settings.accent} options={VOICE_ACCENTS} onChange={(accent) => update({ accent })} />
            </Field>
          </div>
          {/* Expressiveness moved into More (September 2026): it is a tuning
              knob with a sensible default, and up here it was the fourth
              control between a member and the Generate button. Reset above
              still restores it — it is a delivery setting wherever it sits. */}
        </SectionCard>

        {/* Optional direction. Deliberately NOT carded: it's the extra at the
            end of the column, and leaving it bare under the cards is what says
            so. It's also one of the only settings here that is ever actually
            empty, so it carries a status dot. */}
        <DirectionBox
          label="Tone / Context"
          value={settings.sampleContext}
          placeholder="e.g. An excited creator sharing a product they love with a friend."
          onChange={(sampleContext) => update({ sampleContext })}
          boxRef={toneRef}
          floor={moreOpen ? toneFloor ?? TONE_MAX_HEIGHT : undefined}
        />

        {/* More — Scene, Expressiveness and the TTS model, folded away
            (September 2026, Massimo's call: fewer knobs up front). None of the
            three is something a first read has to decide: Scene is a second
            steer box after Tone, Expressiveness has a default that is right
            for most reads, and the two TTS models take the same request at the
            same price. The fold is the shared `SectionCard` one — the whole
            header row toggles, the chevron stays a real button — and folded it
            keeps one dim line saying what is in there and what it's set to, so
            a filled Scene can't hide behind it unannounced. */}
        <div ref={moreRef} className="shrink-0">
          {/* The hairline under the title is drawn folded too, like the Voice
              and Delivery cards above: it is a card header, and the summary line
              is its body, not a subtitle hanging off the title. */}
          <SectionCard
            icon={Ellipsis}
            title="More"
            onHeaderClick={toggleMore}
            divider
            contentClassName="flex flex-col gap-3"
            left={
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleMore() }}
                title={moreOpen ? 'Hide these settings' : modelRow ? 'Show Scene, Expressiveness and the model' : 'Show Scene and Expressiveness'}
                aria-label={moreOpen ? 'Hide more settings' : 'Show more settings'}
                aria-expanded={moreOpen}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors group-hover:text-ink-300 hover:bg-ink/5 hover:text-ink-300"
              >
                {moreOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            }
          >
            {moreOpen ? (
              <>
                <DirectionBox
                  label="Scene"
                  value={settings.scene}
                  placeholder="e.g. A bright, upbeat product demo in a sunny kitchen."
                  onChange={(scene) => update({ scene })}
                  fixed
                />
                <Slider
                  label="Expressiveness"
                  tooltip="Controls how much the delivery varies. Lower values are more predictable and consistent between re-generations; higher values are more creative and expressive but less repeatable."
                  value={settings.temperature}
                  min={0}
                  max={2}
                  step={0.05}
                  leftHint="Focused"
                  rightHint="Creative"
                  onChange={(temperature) => update({ temperature })}
                  format={(v) => v.toFixed(2)}
                />
                {/* Unlabelled and dotless, as it was at the column's foot: a
                    picker row already names the model over its hint, and there
                    is always a resolved model. */}
                {modelRow}
              </>
            ) : (
              <button
                type="button"
                onClick={toggleMore}
                className="block w-full truncate text-center text-[11.5px] tracking-tight text-ink-600 transition-colors hover:text-ink-400"
              >
                {[
                  settings.scene.trim() ? 'Scene set' : 'No scene',
                  `Expressiveness ${settings.temperature.toFixed(2)}`,
                  modelName,
                ].filter(Boolean).join(' · ')}
              </button>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

// Which preset the settings CAME from, on the Voice card's header — a STAMP,
// not a way in. The way in is the card's own title (`SectionPresetPill`), so
// this renders only once a preset is loaded: it names it, and carries the X
// that detaches it. Clearing drops the stamp only, because the values it loaded
// are the settings the member is about to generate with — and every hand edit
// drops it too (see `update`), so it can never claim settings it no longer
// describes.
//
// The label is capped and truncates: this sits in one gutter of the card
// header's 3-column grid, and a long bank name would otherwise squeeze the
// title it's sitting next to.
function PresetStamp({
  label,
  onOpen,
  onClear,
}: {
  label: string
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-full border border-voice-500/30 bg-voice-500/15 py-1 pl-2.5 pr-1 text-[12px] font-medium text-voice-300">
      <button
        type="button"
        onClick={onOpen}
        title={`Preset: ${label} · click to load a different one`}
        className="flex min-w-0 items-center gap-1 transition-colors hover:text-voice-200"
      >
        <Bookmark className="h-3 w-3 shrink-0" />
        <span className="max-w-[110px] truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={onClear}
        title="Detach preset · the settings it loaded stay as they are"
        aria-label="Detach preset"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-voice-300/70 transition-colors hover:bg-ink/10 hover:text-red-400 light:hover:text-red-600"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// One optional direction box. It carries no "optional" pill: everything in an
// input column that isn't marked otherwise is optional (the shared VoiceCard
// dropped its pill for the same reason), and here the neutral dot and the box
// sitting bare under the cards already say it twice.
// The flexing box's cap, as a number for the More-open floor above; keep it
// in step with the `max-h-[129px]` below.
const TONE_MAX_HEIGHT = 129

function DirectionBox({
  label,
  value,
  placeholder,
  onChange,
  fixed = false,
  boxRef,
  floor,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  // Inside More the box sits in a card that doesn't share the column's
  // leftover height, so it takes a plain two-line field instead of flexing.
  fixed?: boolean
  boxRef?: Ref<HTMLDivElement>
  // A height the box won't flex below (see `toneFloor` in SettingsView).
  floor?: number
}) {
  if (fixed) {
    return (
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5">
          <StatusDot filled={value.trim() !== ''} />
          <span className={SETTING_LABEL}>{label}</span>
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={placeholder}
          className="resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-sm text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-voice-500/40"
        />
      </div>
    )
  }
  // Tone / Context is the only thing in this column that can give ground, so
  // it is the only thing that flexes. Everything else is a pill, a dropdown, a
  // slider or the folded More card at a fixed height — there is nothing to take
  // from them. (Scene flexed beside it until it moved into More.)
  //
  // 69px floor = the label row + one line; 129px cap = the label row + four.
  // The cap matters as much as the floor: uncapped, a tall window would hand
  // an optional steer box half the column. `rows={1}` is the whole trick —
  // `rows` is a textarea's MIN-CONTENT height, and min-content is the one size
  // a flex column can never shrink past, so `rows={2}` made the second row a
  // hard floor that propagated all the way up and pushed the last row under
  // the Generate bar. The height comes from `flex-1` now, between those two
  // numbers.
  return (
    <div ref={boxRef} style={floor ? { minHeight: floor } : undefined} className="flex min-h-[69px] max-h-[129px] flex-1 flex-col gap-2">
      <span className="flex shrink-0 items-center gap-1.5">
        {/* Never `required` — nothing is waiting on either of these, so an
            empty one is neutral. Red is reserved for an input that's actually
            holding a Generate button shut. */}
        <StatusDot filled={value.trim() !== ''} />
        <span className={SETTING_LABEL}>{label}</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        maxLength={1000}
        placeholder={placeholder}
        className="min-h-0 flex-1 resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-sm text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-voice-500/40"
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={SETTING_LABEL}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
