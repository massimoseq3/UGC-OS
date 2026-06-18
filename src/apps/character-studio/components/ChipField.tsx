import { useState, useRef } from 'react'
import { Lock, Unlock, Maximize2 } from 'lucide-react'

interface ChipFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  // Typeahead list: focusing the input opens a searchable dropdown of these
  // values; typing filters it. Free text always works — the list is a menu,
  // not a constraint.
  suggestions: string[]
  placeholder?: string
  // When true, the field starts locked: input is read-only and the dropdown
  // stays closed. User can click Unlock to edit.
  defaultLocked?: boolean
}

// A value this long no longer fits the single-line pill — surface the expand
// button so the full prompt can be edited in the pop-up without scrolling.
const LONG_VALUE = 30

export default function ChipField({ label, value, onChange, suggestions, placeholder, defaultLocked = false }: ChipFieldProps) {
  const isFilled = value.trim() !== ''
  const [locked, setLocked] = useState(defaultLocked)
  const [open, setOpen] = useState(false)
  // The full-text editor pop-up — opened from the expand button on long values.
  const [editing, setEditing] = useState(false)
  // Flip both pop-ups above the field when it sits near the bottom of the
  // scrollable column. Opening downward there would extend past the content and
  // inflate the scroll container's height, opening a phantom gap — see the
  // flip logic in openPanel().
  const [openUp, setOpenUp] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const q = value.trim().toLowerCase()
  // Two sections: the options that match the current text float to the top,
  // a hairline separator, then every other option. With no text yet, a
  // "None" option (when the field has one) takes the top slot instead, so
  // the most common "skip this field" pick is always one click away. The
  // dropdown opens on every focus — even when the field already holds a
  // value — so clicking into a filled field still shows the full menu.
  let topSection: string[]
  let restSection: string[]
  if (q) {
    topSection = suggestions.filter((s) => s.toLowerCase().includes(q))
    restSection = suggestions.filter((s) => !s.toLowerCase().includes(q))
  } else {
    topSection = suggestions.filter((s) => s.toLowerCase() === 'none')
    restSection = suggestions.filter((s) => s.toLowerCase() !== 'none')
  }
  const showDropdown = open && !editing && !locked && suggestions.length > 0
  const showExpand = !locked && value.trim().length > LONG_VALUE

  // Decide flip direction from the field's distance to the viewport bottom.
  // The scrollable column ends just above the sticky generate footer, so a
  // field within ~280px of the bottom should pop its panel upward instead.
  function measureDirection() {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setOpenUp(window.innerHeight - rect.bottom < 280)
  }

  function openEditor() {
    measureDirection()
    setOpen(false)
    setEditing(true)
  }

  // Shared vertical placement for the dropdown + editor pop-ups.
  const panelPos = openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isFilled ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-300">{label}</span>
        {defaultLocked && (
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded-full border border-ink/[0.06] bg-ink/[0.02] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-500 transition-colors hover:border-ink/10 hover:bg-ink/[0.04] hover:text-ink-300"
            title={locked ? 'Click to enable editing' : 'Click to lock the value back'}
          >
            {locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
            {locked ? 'Locked' : 'Unlocked'}
          </button>
        )}
      </div>
      <div ref={wrapRef} className="relative">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (!locked) { measureDirection(); setOpen(true) } }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          readOnly={locked}
          placeholder={placeholder ?? `Search or type ${label.toLowerCase()}...`}
          className={`w-full rounded-full border border-ink/15 bg-transparent px-4 py-2 ${showExpand ? 'pr-10' : ''} text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-influencers-500/40 ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
        />
        {showExpand && (
          // Mousedown-preventDefault keeps the input from blurring (which would
          // race the dropdown shut) before the click opens the editor.
          <button
            type="button"
            title="Edit full text"
            aria-label="Edit full text"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openEditor}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink/10 hover:text-ink-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {showDropdown && (
          <div className={`absolute left-0 right-0 z-30 ${panelPos} overflow-hidden rounded-2xl border border-ink/10 bg-surface-2 shadow-2xl`}>
            <div className="max-h-52 overflow-y-auto p-1">
              {topSection.map((s) => (
                <SuggestionRow key={s} text={s} selected={s === value} onPick={() => { onChange(s); setOpen(false) }} />
              ))}
              {topSection.length > 0 && restSection.length > 0 && (
                <div className="mx-2 my-1 h-px bg-ink/[0.08]" />
              )}
              {restSection.map((s) => (
                <SuggestionRow key={s} text={s} selected={s === value} onPick={() => { onChange(s); setOpen(false) }} />
              ))}
            </div>
          </div>
        )}

        {editing && (
          <>
            {/* Transparent catcher so clicking anywhere outside closes the editor. */}
            <div className="fixed inset-0 z-30" onClick={() => setEditing(false)} />
            <div className={`absolute left-0 right-0 z-40 ${panelPos} rounded-2xl border border-ink/10 bg-surface-2 p-2 shadow-2xl`}>
              <textarea
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
                rows={5}
                placeholder={placeholder ?? `Edit ${label.toLowerCase()}...`}
                className="w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm leading-relaxed text-ink-100 placeholder-ink-500 outline-none"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
                <span className="text-[10px] font-medium uppercase tracking-widest text-ink-500">{label}</span>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-full bg-influencers-500/15 px-3 py-1 text-[11px] font-medium text-influencers-400 transition-colors hover:bg-influencers-500/25"
                >
                  Done
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SuggestionRow({ text, selected, onPick }: { text: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`block w-full truncate rounded-full px-3 py-1.5 text-left text-[12px] transition-colors ${
        selected ? 'bg-ink/[0.08] text-ink-100' : 'text-ink-300 hover:bg-ink/[0.06]'
      }`}
    >
      {text}
    </button>
  )
}
