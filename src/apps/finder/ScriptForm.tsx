import { useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import type { Script } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'
import SectionCard, { SectionLabel } from '../../components/SectionCard'
import { useBankAutosave, type BankAutosaveOptions } from './useBankAutosave'
import { AutosaveStatus, DoneButton, FormCloseButton, RequiredNote } from './BankFormChrome'

// What this form writes. `source` rides along so a new row is created whole;
// an existing row's `kind` and star are left alone (the update merges).
export type ScriptDraft = Pick<Script, 'title' | 'scriptText' | 'linkedProductId' | 'source'>

interface ScriptFormProps {
  item?: Script | null
  // A draft handed back by the "wasn't saved" toast's Reopen (see Finder).
  seed?: ScriptDraft
  onAutosave: BankAutosaveOptions<ScriptDraft>['persist']
  onAbandoned: (draft: ScriptDraft, rowId: string | null, message: string) => void
  onClose: () => void
}

export default function ScriptForm({ item, seed, onAutosave, onAbandoned, onClose }: ScriptFormProps) {
  // Seeded once: Finder keys this form by the row it edits, and the row
  // changes under it on every autosave — re-seeding from it would overwrite
  // whatever was typed while that write was in the air.
  const start = seed ?? item
  const [title, setTitle] = useState(start?.title ?? '')
  const [scriptText, setScriptText] = useState(start?.scriptText ?? '')
  const [linkedProductId, setLinkedProductId] = useState(start?.linkedProductId ?? '')
  // The member tried to leave (Done or ✕) with a required field empty.
  const [attempted, setAttempted] = useState(false)
  const products = useBankStore((s) => s.products)
  const titleRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const missingText = !scriptText.trim()
  const missingTitle = !title.trim()
  const autosave = useBankAutosave<ScriptDraft>(
    { title, scriptText, linkedProductId, source: item?.source ?? 'manual' },
    {
      rowId: item?.id ?? null,
      canSave: (d) => !!d.title.trim() && !!d.scriptText.trim(),
      persist: onAutosave,
      restored: !!seed,
      onAbandon: (d, rowId) =>
        onAbandoned(d, rowId, `That script wasn’t saved: it still needs ${missingText ? 'its text' : 'a title'}.`),
    },
  )

  const blocked = missingText || missingTitle
  const unsaved = blocked && autosave.touched
  // Only once there's something to lose: a fresh form opening in red reads
  // as an error before the member has done anything.
  const showMissing = autosave.touched || attempted
  // In reading order — the script box is first on the page.
  const blocker = missingText ? 'Write or Paste a Script' : missingTitle ? 'Give It a Title' : null

  const revealMissing = () => {
    setAttempted(true)
    const field = missingText ? textRef.current : titleRef.current
    field?.focus()
  }

  // Closing IS saving: the flush writes whatever the debounce hadn't yet.
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
          {item ? 'Edit Script' : 'New Script'}
        </h3>
        <div className="flex items-center gap-3">
          <AutosaveStatus state={autosave.state} blocked={unsaved} />
          <FormCloseButton onClose={close} onDiscard={discard} wouldDiscard={unsaved} onBlocked={revealMissing} />
        </div>
      </div>

      {/* Two-column: tall script editor on the left, controls on the right. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Left — script editor fills the space. Uncarded on purpose: it's a
            lone control, and the border is what says "these belong together". */}
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <SectionLabel label="Script Text" filled={!missingText} required />
          <textarea
            ref={textRef}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={22}
            placeholder="Paste or write your script here…"
            className={`min-h-[460px] resize-y rounded-3xl border bg-ink/[0.02] px-5 py-4 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors ${
              showMissing && missingText ? 'border-red-500/60 focus:border-red-400' : 'border-ink/10 focus:border-ink/20'
            }`}
          />
          <RequiredNote show={showMissing && missingText}>A script needs its text to be saved.</RequiredNote>
        </label>

        {/* Right — title, linked product, Done (sticky on desktop). The two
            fields are one group, so they sit in a card; Done stays outside it,
            the same way every panel's Generate sits outside its input card. */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-1 lg:w-72">
          <SectionCard icon={FileText} title="Details" contentClassName="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <SectionLabel label="Title" filled={!missingTitle} required />
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "LARQ - Lazy Girl Hook"'
                className={`rounded-full border bg-ink/[0.02] px-4 py-2.5 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors ${
                  showMissing && missingTitle ? 'border-red-500/60 focus:border-red-400' : 'border-ink/10 focus:border-ink/20'
                }`}
              />
              <RequiredNote show={showMissing && missingTitle}>A script needs a title to be saved.</RequiredNote>
            </label>

            <label className="flex flex-col gap-1.5">
              <SectionLabel label="Linked Product" filled={!!linkedProductId} />
              <select
                value={linkedProductId}
                onChange={(e) => setLinkedProductId(e.target.value)}
                className="rounded-full border border-ink/10 bg-surface-1 px-4 py-2.5 text-sm text-ink-200 outline-none transition-colors focus:border-ink/20"
              >
                <option value="">None</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.productName}</option>
                ))}
              </select>
            </label>
          </SectionCard>

          <DoneButton blocker={blocker} onDone={close} onBlocked={revealMissing} className="mt-1" />
        </div>
      </div>
    </form>
  )
}
