import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'

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

export default function ChipField({ label, value, onChange, suggestions, placeholder, defaultLocked = false }: ChipFieldProps) {
  const isFilled = value.trim() !== ''
  const [locked, setLocked] = useState(defaultLocked)
  const [open, setOpen] = useState(false)

  const q = value.trim().toLowerCase()
  const matches = suggestions.filter((s) => s.toLowerCase().includes(q))
  // An exact single match means the user just picked (or finished typing) a
  // listed value — no point re-showing it under the input.
  const showDropdown = open && !locked && matches.length > 0 && !(matches.length === 1 && matches[0].toLowerCase() === q)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isFilled ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-300">{label}</span>
        {defaultLocked && (
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-500 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-zinc-300"
            title={locked ? 'Click to enable editing' : 'Click to lock the value back'}
          >
            {locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
            {locked ? 'Locked' : 'Unlocked'}
          </button>
        )}
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (!locked) setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          readOnly={locked}
          placeholder={placeholder ?? `Search or type ${label.toLowerCase()}...`}
          className={`w-full rounded-full border border-white/15 bg-transparent px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-sky-500/40 ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
        />
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0D] shadow-2xl">
            <div className="max-h-52 overflow-y-auto p-1">
              {matches.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false) }}
                  className={`block w-full truncate rounded-lg px-3 py-1.5 text-left text-[12px] transition-colors ${
                    s === value ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
