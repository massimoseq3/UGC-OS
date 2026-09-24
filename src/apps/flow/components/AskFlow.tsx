// Ask Flow: change the flow by saying what you want — "a second voice on hook
// 1 only", "pause before animating". The model proposes edits, the validator
// keeps only the ones that fit, and they land as one undo step. Nothing runs.
// What it did stays on screen under the box, with Undo, until the flow is
// edited again.

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Undo2, X } from 'lucide-react'
import type { FlowDoc } from '../types'
import { askFlow } from '../templates/describe'
import { useFlowStore } from '../store/flowStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import Spinner from '../../../components/Spinner'
import { MenuItem, MenuSurface } from '../../../components/Menu'

const EXAMPLES = ['Try a second voice on the first hook only', 'Pause before animating', 'Make 20 hooks', 'Cast 4 new faces']

interface Outcome {
  summary: string
  changes: string[]
  // The flow's updatedAt right after the edit landed: Undo is offered only
  // while nothing else has changed since, so it can't undo something else.
  at: number
}

export default function AskFlow({
  doc,
  sizeOf,
  onApplied,
}: {
  doc: FlowDoc
  sizeOf: (id: string) => { width: number; height: number } | undefined
  onApplied: (touched: string[]) => void
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const replaceGraph = useFlowStore((s) => s.replaceGraph)
  const undo = useFlowStore((s) => s.undo)
  const addToast = useAppStore((s) => s.addToast)

  // The examples close on a click outside or Escape, like every chip menu.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const send = async (request: string) => {
    if (!request.trim() || busy) return
    setBusy(true)
    setOpen(false)
    setOutcome(null)
    try {
      const result = await askFlow(doc, request, sizeOf)
      replaceGraph(result.graph)
      const at = useFlowStore.getState().docs[doc.id]?.updatedAt ?? 0
      setOutcome({ summary: result.summary, changes: result.changes, at })
      setText('')
      onApplied(result.touched)
    } catch (err) {
      addToast(humanizeError(err, "Flow couldn't make that change. Try saying it another way."), 'error')
    }
    setBusy(false)
  }

  const undoable = outcome !== null && doc.updatedAt === outcome.at

  return (
    <div ref={wrapperRef} className="relative w-72">
      <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-surface-1 py-1.5 pl-3.5 pr-1.5 shadow-lg">
        {busy ? <Spinner className="h-3.5 w-3.5 text-flow-300" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-flow-300" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send(text)
          }}
          placeholder={busy ? 'Changing the flow…' : 'Ask Flow to change something…'}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-100 placeholder-ink-500 outline-none"
          disabled={busy}
        />
      </div>
      {open && !busy && (
        <div className="absolute left-0 top-full z-20 mt-1.5">
          <MenuSurface className="w-72">
            {EXAMPLES.map((ex) => (
              <MenuItem key={ex} onClick={() => void send(ex)}>{ex}</MenuItem>
            ))}
          </MenuSurface>
        </div>
      )}
      {outcome && !open && (
        <div className="absolute left-0 top-full z-10 mt-1.5 w-80 rounded-2xl border border-ink/10 bg-surface-1 p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-200">{outcome.summary}</p>
            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink/10 hover:text-ink-100"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {outcome.changes.map((c) => (
            <p key={c} className="mt-1.5 text-[11.5px] leading-relaxed text-amber-400/90">{c}</p>
          ))}
          {undoable && (
            <button
              type="button"
              onClick={() => {
                undo()
                setOutcome(null)
              }}
              className="mt-2.5 flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-[11.5px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
