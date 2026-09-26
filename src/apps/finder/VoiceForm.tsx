import { useRef, useState } from 'react'
import { Mic, SlidersHorizontal } from 'lucide-react'
import type { VoicePreset } from '../../stores/types'
import { VOICES, DEFAULT_VOICE_SETTINGS, VOICE_STYLES, VOICE_PACES, VOICE_ACCENTS } from '../voice-studio/types'
import SectionCard, { SectionLabel } from '../../components/SectionCard'
import { useBankAutosave, type BankAutosaveOptions } from './useBankAutosave'
import { AutosaveStatus, DoneButton, FormCloseButton, RequiredNote } from './BankFormChrome'

// The whole preset, as written: a new row is created from it, an existing one
// is overwritten field by field (temperature and the linked character ride
// along unchanged — nothing here edits them).
export type VoiceDraft = Omit<VoicePreset, 'id' | 'createdAt'>

interface VoiceFormProps {
  item?: VoicePreset | null
  // A draft handed back by the "wasn't saved" toast's Reopen (see Finder).
  seed?: VoiceDraft
  onAutosave: BankAutosaveOptions<VoiceDraft>['persist']
  onAbandoned: (draft: VoiceDraft, rowId: string | null, message: string) => void
  onClose: () => void
}

export default function VoiceForm({ item, seed, onAutosave, onAbandoned, onClose }: VoiceFormProps) {
  // Seeded once — see ScriptForm: the row changes under the form on every save.
  const start = seed ?? item
  const [label, setLabel] = useState(start?.label ?? '')
  const [voiceId, setVoiceId] = useState(start?.voiceId ?? VOICES[0].id)
  const [style, setStyle] = useState(start?.style ?? DEFAULT_VOICE_SETTINGS.style)
  const [pace, setPace] = useState(start?.pace ?? DEFAULT_VOICE_SETTINGS.pace)
  const [accent, setAccent] = useState(start?.accent ?? DEFAULT_VOICE_SETTINGS.accent)
  // Optional direction. Part of the preset so loading it in Voiceovers restores
  // the whole read — voice, delivery params, AND the scene/tone it was written for.
  const [scene, setScene] = useState(start?.scene ?? '')
  const [sampleContext, setSampleContext] = useState(start?.sampleContext ?? '')
  const [attempted, setAttempted] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  const voice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0]
  const missingLabel = !label.trim()
  const autosave = useBankAutosave<VoiceDraft>(
    {
      label,
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
      style,
      pace,
      accent,
      temperature: item?.temperature ?? DEFAULT_VOICE_SETTINGS.temperature,
      scene: scene.trim() || undefined,
      sampleContext: sampleContext.trim() || undefined,
      linkedModelId: item?.linkedModelId ?? '',
    },
    {
      rowId: item?.id ?? null,
      canSave: (d) => !!d.label.trim(),
      persist: onAutosave,
      restored: !!seed,
      onAbandon: (d, rowId) => onAbandoned(d, rowId, 'That voice preset wasn’t saved: it still needs a label.'),
    },
  )

  const unsaved = missingLabel && autosave.touched
  const showMissing = autosave.touched || attempted

  const revealMissing = () => {
    setAttempted(true)
    labelRef.current?.focus()
  }

  const close = () => {
    void autosave.flush()
    onClose()
  }

  const discard = () => {
    autosave.discard()
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (missingLabel) revealMissing()
        else close()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-200">
          {item ? 'Edit Voice Preset' : 'New Voice Preset'}
        </h3>
        <div className="flex items-center gap-3">
          <AutosaveStatus state={autosave.state} blocked={unsaved} />
          <FormCloseButton onClose={close} onDiscard={discard} wouldDiscard={unsaved} onBlocked={revealMissing} />
        </div>
      </div>

      {/* Two cards then two bare extras — the exact shape of the Voiceovers side
          panel this form edits the presets for, so a preset reads the same way
          wherever you meet it. Only Label carries a dot: it's what gates the
          save, while the voice and the three delivery controls always hold a
          value, and a permanent row of green dots teaches you to stop reading dots. */}
      <SectionCard icon={Mic} title="Voice" contentClassName="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <SectionLabel label="Label" filled={!missingLabel} required />
          <input
            ref={labelRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`e.g. "Punchy hook voice"`}
            className={`rounded-full border bg-transparent px-3.5 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors ${
              showMissing && missingLabel ? 'border-red-500/60 focus:border-red-400' : 'border-ink/10 focus:border-ink/20'
            }`}
          />
          <RequiredNote show={showMissing && missingLabel}>A preset needs a label to be saved.</RequiredNote>
        </label>

        <label className="flex flex-col gap-1.5">
          <SectionLabel label="Voice" />
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="rounded-full border border-ink/10 bg-surface-1 px-3.5 py-2 text-sm text-ink-200 outline-none focus:border-ink/20"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.category} · {v.description}
              </option>
            ))}
          </select>
        </label>
      </SectionCard>

      <SectionCard icon={SlidersHorizontal} title="Delivery">
        <div className="grid grid-cols-3 gap-2">
          <SelectField label="Style" value={style} options={VOICE_STYLES} onChange={setStyle} />
          <SelectField label="Pace" value={pace} options={VOICE_PACES} onChange={setPace} />
          <SelectField label="Accent" value={accent} options={VOICE_ACCENTS} onChange={setAccent} />
        </div>
      </SectionCard>

      <TextAreaField
        label="Scene"
        value={scene}
        onChange={setScene}
        placeholder="e.g. A bright, upbeat product demo in a sunny kitchen."
      />
      <TextAreaField
        label="Tone / Context"
        value={sampleContext}
        onChange={setSampleContext}
        placeholder="e.g. An excited creator sharing a product they love with a friend."
      />

      <DoneButton
        blocker={missingLabel ? 'Label This Preset' : null}
        onDone={close}
        onBlocked={revealMissing}
        className="mt-1"
      />
    </form>
  )
}

function TextAreaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {/* Bare, under the cards — the two extras, same as the Voiceovers panel.
          A neutral dot, because these are the only optional inputs here. */}
      <SectionLabel
        label={label}
        filled={!!value.trim()}
        right={<span className="text-[10px] tracking-tight text-ink-600">optional</span>}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={placeholder}
        className="resize-none rounded-2xl border border-ink/10 bg-transparent px-3 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <SectionLabel label={label} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-ink/10 bg-surface-1 px-2.5 py-2 text-sm text-ink-200 outline-none focus:border-ink/20"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}
