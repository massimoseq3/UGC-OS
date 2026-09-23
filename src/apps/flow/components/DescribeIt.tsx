// Describe It, on Flow Home: say what you want made, and Flow lays out the
// blocks. The plan — the blocks, what they'll cost, anything the validator
// changed — shows before Accept, and accepting opens the canvas without
// running anything.

import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import AutoGrowTextarea from '../../../components/AutoGrowTextarea'
import Spinner from '../../../components/Spinner'
import { useAppStore } from '../../../stores/appStore'
import { useBankStore } from '../../../stores/bankStore'
import { humanizeError } from '../../../utils/friendlyError'
import { describeFlow } from '../templates/describe'
import type { FlowTemplateFile } from '../templates/io'
import { planFlow } from '../engine/plan'
import { PLAN_DEPS } from '../run/runtime'
import { KINDS, isKnownKind, titleOf } from '../engine/catalog'
import { useFlowStore } from '../store/flowStore'
import { creditsLabel } from '../hooks/useFlowPlan'

const EXAMPLES = [
  '5 hooks for my serum, a female voice, B-Roll for each',
  'Remix my saved ad for my product and shoot it with my character',
  'Three 30-second scripts, each voiced by Kore, packed for editing',
]

export default function DescribeIt() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ file: FlowTemplateFile; changes: string[] } | null>(null)
  const addToast = useAppStore((s) => s.addToast)
  const banks = useBankStore((s) => s)
  const createFlow = useFlowStore((s) => s.createFlow)
  const openFlow = useFlowStore((s) => s.openFlow)

  const build = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setDraft(null)
    try {
      setDraft(await describeFlow(text))
    } catch (err) {
      addToast(humanizeError(err, "Flow couldn't build that. Try saying it another way."), 'error')
    }
    setBusy(false)
  }

  const plan = draft && banks ? planFlow({ blocks: draft.file.blocks.filter((b) => isKnownKind(b.kind)), wires: draft.file.wires }, {}, PLAN_DEPS) : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <div className="relative">
        <AutoGrowTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void build()
          }}
          placeholder="Describe the ads you want made…"
          className="w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] py-3.5 pl-4 pr-28 text-[13.5px] text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-flow-500/40"
          rows={2}
        />
        <button
          type="button"
          onClick={() => void build()}
          disabled={!text.trim() || busy}
          className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-flow-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          Build It
        </button>
      </div>
      {!draft && !busy && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-ink/10 px-3 py-1 text-[11px] text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-200">
              {ex}
            </button>
          ))}
        </div>
      )}
      {draft && (
        <div className="flex flex-col gap-3 rounded-2xl border border-flow-500/25 bg-flow-500/[0.05] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold text-ink-100">{draft.file.name}</span>
            <span className="text-[12px] tabular-nums text-ink-400">{creditsLabel(plan?.creditsAll ?? 0, plan?.unpriced)} a run</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.file.blocks.filter((b) => isKnownKind(b.kind) && b.kind !== 'note').map((b, i, all) => (
              <span key={b.id} className="flex items-center gap-1.5">
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11.5px] text-ink-200">
                  {titleOf(b)}{b.review ? ' · Review' : ''}{plan?.blocks[b.id]?.instances.length && plan.blocks[b.id].instances.length > 1 ? ` ×${plan.blocks[b.id].instances.length}` : ''}
                </span>
                {i < all.length - 1 && KINDS[b.kind] && <ArrowRight className="h-3 w-3 text-ink-600" />}
              </span>
            ))}
          </div>
          {(draft.file.notes?.length ?? 0) > 0 && <p className="text-[12px] leading-relaxed text-ink-400">{draft.file.notes!.join(' ')}</p>}
          {draft.changes.map((c, i) => <p key={i} className="text-[11.5px] text-amber-400/90">{c}</p>)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Adjust</button>
            <button
              type="button"
              onClick={() => openFlow(createFlow({ name: draft.file.name, graph: { blocks: draft.file.blocks, wires: draft.file.wires } }))}
              className="glass-fill glass-fill-soft rounded-full border border-white/15 bg-flow-500 px-5 py-2 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110"
            >
              Accept and Open
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
