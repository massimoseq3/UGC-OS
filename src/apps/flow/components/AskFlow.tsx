// Ask Flow: change the flow by saying what you want — "a second voice on hook
// 1 only", "pause before animating". The model proposes edits, the validator
// keeps only the ones that fit, and they land as one undo step. Nothing runs.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { FlowDoc } from '../types'
import { askFlow } from '../templates/describe'
import { useFlowStore } from '../store/flowStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import Spinner from '../../../components/Spinner'
import { MenuItem, MenuSurface } from '../../../components/Menu'

const EXAMPLES = ['Try a second voice on the first hook only', 'Pause before animating', 'Make 20 hooks', 'Cast 4 new faces']

export default function AskFlow({ doc }: { doc: FlowDoc }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const replaceGraph = useFlowStore((s) => s.replaceGraph)
  const addToast = useAppStore((s) => s.addToast)

  const send = async (request: string) => {
    if (!request.trim() || busy) return
    setBusy(true)
    setOpen(false)
    try {
      const result = await askFlow(doc, request)
      replaceGraph(result.graph)
      addToast([result.summary, ...result.changes].join(' '), result.changes.length ? 'info' : 'success')
      setText('')
    } catch (err) {
      addToast(humanizeError(err, "Flow couldn't make that change. Try saying it another way."), 'error')
    }
    setBusy(false)
  }

  return (
    <div className="relative w-72">
      <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-surface-1 py-1.5 pl-3.5 pr-1.5 shadow-lg">
        {busy ? <Spinner className="h-3.5 w-3.5 text-flow-300" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-flow-300" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send(text)
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Ask Flow to change something…"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-100 placeholder-ink-500 outline-none"
          disabled={busy}
        />
      </div>
      {open && !busy && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5">
            <MenuSurface className="w-72">
              {EXAMPLES.map((ex) => (
                <MenuItem key={ex} onClick={() => void send(ex)}>{ex}</MenuItem>
              ))}
            </MenuSurface>
          </div>
        </>
      )}
    </div>
  )
}
