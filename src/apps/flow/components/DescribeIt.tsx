// Describe It, the bar under Flow Home's title: say what you want made, and
// Flow lays out the blocks. The plan — the blocks, what they'll cost, anything
// the validator changed — shows in the bar before anything opens, and opening
// it runs nothing.

import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import Spinner from '../../../components/Spinner'
import { useAppStore } from '../../../stores/appStore'
import { useBankStore } from '../../../stores/bankStore'
import { humanizeError } from '../../../utils/friendlyError'
import { describeFlow } from '../templates/describe'
import type { FlowTemplateFile } from '../templates/io'
import { planFlow } from '../engine/plan'
import { PLAN_DEPS } from '../run/runtime'
import { isKnownKind } from '../engine/catalog'
import { useFlowStore } from '../store/flowStore'
import { creditsLabel } from '../hooks/useFlowPlan'
import PlanChips from './PlanChips'

const EXAMPLES = [
  'Five hooks for my serum, a female voice, B-Roll for each',
  'Remix my saved ad for my product and shoot it with my character',
  'Ten lifestyle stills of my product',
]

export default function DescribeIt() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ file: FlowTemplateFile; changes: string[] } | null>(null)
  const addToast = useAppStore((s) => s.addToast)
  const banks = useBankStore((s) => s)
  const createFlow = useFlowStore((s) => s.createFlow)
  const openFlow = useFlowStore((s) => s.openFlow)
  const setView = useFlowStore((s) => s.setView)

  const build = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setDraft(null)
    const made = await describeFlow(text).catch((err: unknown) => {
      addToast(humanizeError(err, "Flow couldn't build that. Try saying it another way."), 'error')
      return null
    })
    setDraft(made)
    setBusy(false)
  }

  const plan = draft && banks ? planFlow({ blocks: draft.file.blocks.filter((b) => isKnownKind(b.kind)), wires: draft.file.wires }, {}, PLAN_DEPS) : null

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-ink/[0.08] bg-ink/[0.03] p-3.5 shadow-[0_24px_60px_-30px_color-mix(in_oklab,var(--color-flow-500)_45%,transparent)]">
      <div className="flex items-center gap-3 pl-2.5 pr-1">
        <Sparkles className="h-4 w-4 shrink-0 text-flow-300" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void build()
          }}
          placeholder="Describe the flow you want"
          aria-label="Describe the flow you want"
          className="h-12 min-w-0 flex-1 bg-transparent text-[13px] tracking-tight text-ink-100 placeholder-ink-500 outline-none md:text-[15px]"
        />
        {busy ? (
          <span className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-flow-500/40 px-4 text-[13px] text-flow-200">
            <Spinner className="h-3.5 w-3.5" />
            Laying Out Blocks
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void build()}
            disabled={!text.trim()}
            aria-label="Build Flow"
            className="glass-fill glass-fill-soft flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-flow-500 px-3.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 sm:px-5"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Build Flow</span>
          </button>
        )}
      </div>

      {!draft && !busy && (
        <div className="flex flex-wrap items-center gap-2 px-1.5 pb-0.5">
          <span className="text-[11.5px] text-ink-500">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              title={ex}
              className="h-[30px] max-w-full truncate rounded-full border border-ink/[0.08] bg-ink/[0.03] px-3 text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.07] hover:text-ink-100"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {draft && (
        <div className="modal-pop flex flex-col gap-3 rounded-2xl border border-flow-500/30 bg-flow-500/[0.06] p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-flow-500/20 px-2.5 py-0.5 text-[11px] font-medium text-flow-200">Here's the Flow</span>
            <span className="text-[13px] font-semibold text-ink-100">{draft.file.name}</span>
          </div>
          <PlanChips blocks={draft.file.blocks} plan={plan} />
          {(draft.file.notes?.length ?? 0) > 0 && <p className="text-[12px] leading-relaxed text-ink-400">{draft.file.notes!.join(' ')}</p>}
          {draft.changes.map((c, i) => <p key={i} className="text-[11.5px] text-amber-400/90 light:text-amber-700">{c}</p>)}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-[12px] tabular-nums text-ink-400">{creditsLabel(plan?.creditsAll ?? 0, plan?.unpriced)} per run</span>
            <button type="button" onClick={() => setDraft(null)} className="h-8 rounded-full border border-ink/10 px-3.5 text-[12px] text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100">Adjust</button>
            <button
              type="button"
              onClick={() => {
                openFlow(createFlow({ name: draft.file.name, graph: { blocks: draft.file.blocks, wires: draft.file.wires } }))
                // The canvas, as the button says — not whichever view the
                // last flow was left in.
                setView('edit')
              }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-flow-500 px-3.5 text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-all hover:brightness-110"
            >
              Open Canvas
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
