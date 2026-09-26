import { useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import type { StylePreset } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import SectionCard, { SectionLabel } from '../../components/SectionCard'
import { useBankAutosave, type BankAutosaveOptions } from './useBankAutosave'
import { AutosaveStatus, DoneButton, FormCloseButton, RequiredNote } from './BankFormChrome'

// What this form writes — the name and the brief, trimmed, since the brief is
// appended verbatim to every prompt in the look. The reference frames are
// read-only here and never part of the write, so an autosave can't purge them.
export type StyleDraft = Pick<StylePreset, 'name' | 'brief'>

interface StyleFormProps {
  item?: StylePreset | null
  // A draft handed back by the "wasn't saved" toast's Reopen (see Finder).
  seed?: StyleDraft
  onAutosave: BankAutosaveOptions<StyleDraft>['persist']
  onAbandoned: (draft: StyleDraft, rowId: string | null, message: string) => void
  onClose: () => void
}

// The reference frames a style was read from are read-only here — they're
// captured in B-Roll at analysis time and only exist to remind the user what
// the look came from. The brief is the editable part; it's what a model sees.
function ReferenceThumb({ refId }: { refId: string }) {
  const url = useAssetUrl(refId)
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.04]">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </div>
  )
}

export default function StyleForm({ item, seed, onAutosave, onAbandoned, onClose }: StyleFormProps) {
  // Seeded once — see ScriptForm: the row changes under the form on every save.
  const start = seed ?? item
  const [name, setName] = useState(start?.name ?? '')
  const [brief, setBrief] = useState(start?.brief ?? '')
  const [attempted, setAttempted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const briefRef = useRef<HTMLTextAreaElement>(null)

  const missingBrief = !brief.trim()
  const missingName = !name.trim()
  const autosave = useBankAutosave<StyleDraft>(
    { name: name.trim(), brief: brief.trim() },
    {
      rowId: item?.id ?? null,
      canSave: (d) => !!d.name && !!d.brief,
      persist: onAutosave,
      restored: !!seed,
      onAbandon: (d, rowId) =>
        onAbandoned(d, rowId, `That style wasn’t saved: it still needs ${missingBrief ? 'its brief' : 'a name'}.`),
    },
  )

  const blocked = missingBrief || missingName
  const unsaved = blocked && autosave.touched
  const showMissing = autosave.touched || attempted
  const blocker = missingBrief ? 'Write the Style Brief' : missingName ? 'Name This Style' : null

  const revealMissing = () => {
    setAttempted(true)
    const field = missingBrief ? briefRef.current : nameRef.current
    field?.focus()
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
        if (blocker) revealMissing()
        else close()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-200">
          {item ? 'Edit Style' : 'New Style'}
        </h3>
        <div className="flex items-center gap-3">
          <AutosaveStatus state={autosave.state} blocked={unsaved} />
          <FormCloseButton onClose={close} onDiscard={discard} wouldDiscard={unsaved} onBlocked={revealMissing} />
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Left — the style paragraph itself. A lone control, so no card. */}
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <SectionLabel label="Style Brief" filled={!missingBrief} required />
          <textarea
            ref={briefRef}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={16}
            placeholder="How everything rendered in this style looks: medium, forms, palette, light, camera and finish. Describe the look only; never the subjects it came from."
            className={`min-h-[320px] resize-y rounded-3xl border bg-ink/[0.02] px-5 py-4 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors ${
              showMissing && missingBrief ? 'border-red-500/60 focus:border-red-400' : 'border-ink/10 focus:border-ink/20'
            }`}
          />
          <RequiredNote show={showMissing && missingBrief}>A style needs its brief to be saved.</RequiredNote>
          <span className="px-1 text-[11px] leading-relaxed text-ink-600">
            This paragraph is appended to every image and video prompt rendered in this style.
          </span>
        </label>

        {/* Right — name, reference frames, Done. The name and the frames it was
            read from are one group (what this style IS and where it came from);
            Done stays outside the card, like every panel's Generate. */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-1 lg:w-72">
          <SectionCard icon={Palette} title="Style" contentClassName="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <SectionLabel label="Name" filled={!missingName} required />
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Warm 90s Camcorder"'
                className={`rounded-full border bg-ink/[0.02] px-4 py-2.5 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors ${
                  showMissing && missingName ? 'border-red-500/60 focus:border-red-400' : 'border-ink/10 focus:border-ink/20'
                }`}
              />
              <RequiredNote show={showMissing && missingName}>A style needs a name to be saved.</RequiredNote>
            </label>

            {item?.thumbRefs && item.thumbRefs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {/* No dot: these are read-only thumbnails of what the brief was
                    distilled from, not an input anything waits on. */}
                <SectionLabel label="Read From" />
                <div className="flex flex-wrap gap-2">
                  {item.thumbRefs.map((ref) => (
                    <ReferenceThumb key={ref} refId={ref} />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {!item && (
            <p className="flex items-start gap-2 rounded-2xl border border-ink/5 bg-ink/[0.03] px-3.5 py-3 text-[11px] leading-relaxed text-ink-500">
              <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-600" strokeWidth={1.5} />
              <span>Tip: B-Roll can write this for you. Upload a few frames of an ad whose look you want and save the result here.</span>
            </p>
          )}

          <DoneButton blocker={blocker} onDone={close} onBlocked={revealMissing} className="mt-1" />
        </div>
      </div>
    </form>
  )
}
