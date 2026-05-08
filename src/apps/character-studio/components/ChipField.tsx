import { useState, useEffect } from 'react'
import { Plus, Check, X, Lock, Unlock } from 'lucide-react'

const STORAGE_KEY = 'ai-ugc-lab-custom-chips'

function loadCustomChips(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCustomChips(data: Record<string, string[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const CHIP_TRUNCATE_LENGTH = 40

function truncateChip(text: string): string {
  if (text.length <= CHIP_TRUNCATE_LENGTH) return text
  return text.slice(0, CHIP_TRUNCATE_LENGTH) + '...'
}

interface ChipFieldProps {
  label: string
  fieldKey: string
  value: string
  chips: string[]
  onChange: (value: string) => void
  placeholder?: string
  // When true, the field starts locked: input is read-only, chips are
  // disabled, custom-chip add is hidden. User can click Unlock to edit.
  defaultLocked?: boolean
}

export default function ChipField({ label, fieldKey, value, chips, onChange, placeholder, defaultLocked = false }: ChipFieldProps) {
  const isFilled = value.trim() !== ''
  const [showAddInput, setShowAddInput] = useState(false)
  const [newChipValue, setNewChipValue] = useState('')
  const [customChips, setCustomChips] = useState<string[]>([])
  const [locked, setLocked] = useState(defaultLocked)

  // Load custom chips for this field on mount
  useEffect(() => {
    const all = loadCustomChips()
    setCustomChips(all[fieldKey] ?? [])
  }, [fieldKey])

  const addCustomChip = () => {
    const trimmed = newChipValue.trim()
    if (!trimmed) return
    // Don't add duplicates
    if (chips.includes(trimmed) || customChips.includes(trimmed)) return

    const updated = [...customChips, trimmed]
    setCustomChips(updated)
    const all = loadCustomChips()
    all[fieldKey] = updated
    saveCustomChips(all)

    onChange(trimmed)
    setNewChipValue('')
    setShowAddInput(false)
  }

  const removeCustomChip = (chip: string) => {
    const updated = customChips.filter((c) => c !== chip)
    setCustomChips(updated)
    const all = loadCustomChips()
    all[fieldKey] = updated
    saveCustomChips(all)
    // If the removed chip was selected, clear the value
    if (value === chip) onChange('')
  }

  const allChips = [...chips, ...customChips]

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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={locked}
        placeholder={placeholder ?? `Select or type ${label.toLowerCase()}...`}
        className={`rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-sky-500/40 ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
      />
      <div className="flex flex-wrap gap-1.5">
        {allChips.map((chip) => {
          const isActive = value === chip
          const isCustom = customChips.includes(chip)
          const needsTruncation = chip.length > CHIP_TRUNCATE_LENGTH
          return (
            <div key={chip} className="group/chip relative flex items-center">
              <button
                type="button"
                onClick={() => { if (!locked) onChange(isActive ? '' : chip) }}
                disabled={locked}
                title={needsTruncation ? chip : undefined}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all ${locked ? 'cursor-not-allowed' : ''} ${isActive
                    ? 'bg-sky-500/10 text-sky-300/90 border border-sky-400/20'
                    : isCustom
                      ? 'bg-violet-500/[0.06] text-zinc-400 border border-violet-500/15 hover:bg-violet-500/10 hover:text-zinc-200'
                      : 'bg-white/[0.025] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
              >
                {truncateChip(chip)}
              </button>
              {isCustom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeCustomChip(chip) }}
                  className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 transition-colors hover:bg-red-500/80 hover:text-white group-hover/chip:flex"
                >
                  <X className="h-2 w-2" />
                </button>
              )}
            </div>
          )
        })}

        {/* Add custom chip */}
        {showAddInput ? (
          <div className="flex items-center gap-1">
            <input
              value={newChipValue}
              onChange={(e) => setNewChipValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomChip(); if (e.key === 'Escape') { setShowAddInput(false); setNewChipValue('') } }}
              autoFocus
              placeholder="Custom value..."
              className="w-36 rounded-full border border-white/10 bg-transparent px-3 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-sky-500/30"
            />
            <button
              type="button"
              onClick={addCustomChip}
              disabled={!newChipValue.trim()}
              className="rounded-full p-1 text-zinc-500 transition-colors hover:text-emerald-400 disabled:opacity-30"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => { setShowAddInput(false); setNewChipValue('') }}
              className="rounded-full p-1 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddInput(true)}
            className="flex items-center gap-0.5 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-white/30 hover:text-white"
          >
            <Plus className="h-2.5 w-2.5" />
            Add
          </button>
        )}
      </div>
    </div>
  )
}
