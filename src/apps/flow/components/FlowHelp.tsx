// How a flow works, in six lines, and every key the canvas answers to —
// behind the ? in the canvas's corner, for the member who has never opened
// a node editor and the one who wants the shortcut they saw once.

import { useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { DELETE_KEY, MOD, SHIFT_MOD } from './keys'

const HOW: Array<{ title: string; text: string }> = [
  { title: 'Blocks are your apps', text: 'Each one does what its app does, with the settings you give it. Double-click one to open it in its app.' },
  { title: 'Wires carry what a block makes', text: 'Drag from a dot on the right into a dot on the left. Dots are coloured by what they carry, and an input only takes what fits.' },
  { title: '×N is how many times it runs', text: 'Once for each hook, face or item that comes in. Turn an item off, with the eye on its row, to run fewer.' },
  { title: 'Test With 1, then Run Flow', text: 'A test makes one of everything, cheaply. Run Flow makes the rest, and never pays twice for what is already made.' },
  { title: 'A hand pauses for your review', text: 'The run stops after that block so you keep, and edit, what is worth spending more on.' },
  { title: 'Run Field makes it a form', text: 'A block marked Run Field is something whoever runs the flow picks for themselves, like Your Product.' },
]

const KEYS: Array<[string, string]> = [
  ['Tab', 'Add a block'],
  ['Right-click', 'Everything you can do there'],
  ['Enter', 'Open the selected block'],
  ['F2', 'Rename it'],
  [`${MOD}D`, 'Duplicate'],
  [`${MOD}C · ${MOD}V`, 'Copy and paste, into any flow'],
  [DELETE_KEY, 'Delete'],
  [`${MOD}Z · ${SHIFT_MOD}Z`, 'Undo and redo'],
  [`${MOD}A`, 'Select everything'],
  ['Shift-drag', 'Select several'],
]

export default function FlowHelp() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="How Flow works, and its shortcuts"
        aria-label="How Flow Works"
        aria-expanded={open}
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors hover:bg-ink/[0.07] hover:text-ink-100 ${open ? 'bg-ink/[0.07] text-ink-100' : 'text-ink-300'}`}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="menu-scroll absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-200px)] w-[380px] overflow-y-auto rounded-2xl border border-ink/10 bg-surface-2 shadow-xl shadow-black/30">
          <div className="border-b border-ink/5 px-4 pb-2 pt-3.5 text-[13px] font-semibold text-ink-100">How a Flow Works</div>
          <div className="flex flex-col gap-2.5 px-4 py-3">
            {HOW.map((h) => (
              <div key={h.title}>
                <p className="text-[12.5px] font-medium text-ink-200">{h.title}</p>
                <p className="text-[11.5px] leading-relaxed text-ink-400">{h.text}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-ink/5 px-4 pb-3.5 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Keys</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11.5px]">
              {KEYS.map(([k, what]) => (
                <div key={k} className="contents">
                  <kbd className="font-sans font-medium text-ink-200">{k}</kbd>
                  <span className="text-ink-400">{what}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
