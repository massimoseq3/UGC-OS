// The left column with nothing selected: the flow's own panel. Its fields
// (the blocks marked Show as a Field), what the next run and the whole flow
// cost against the kie.ai balance, and the two ways to run it.

import { AlertCircle, Coins, FlaskConical, Play } from 'lucide-react'
import type { FlowDoc } from '../../types'
import type { FlowPlan } from '../../engine/plan'
import { KINDS, titleOf } from '../../engine/catalog'
import type { LiveRun } from '../../run/runtime'
import { creditsLabel, creditsPill, runButton } from '../../hooks/useFlowPlan'
import { useFlowStore } from '../../store/flowStore'
import { BankPick } from './Picks'
import { StopButton } from './common'
import type { BankType } from '../../../../utils/constants'
import type { RunRequest } from '../Editor'
import { useRecordingActive } from '../../../../stores/recordingStore'

export default function FlowPanel({
  doc,
  plan,
  test,
  again,
  run,
  balance,
  onRun,
}: {
  flowId: string
  doc: FlowDoc
  plan: FlowPlan | null
  test: FlowPlan | null
  again: FlowPlan | null
  run: LiveRun | undefined
  balance: number | null
  onRun: (req: RunRequest) => void
}) {
  const setSelection = useFlowStore((s) => s.setSelection)
  const recording = useRecordingActive()
  const active = run?.status === 'running'
  const button = runButton(doc, plan, again, run)
  const fields = doc.blocks.filter((b) => b.field && !b.suggested)
  const blocked = doc.blocks.filter((b) => plan?.blocks[b.id]?.blocked && plan.blocks[b.id].blocked !== 'Turned off' && KINDS[b.kind]?.runnable)
  const next = button.credits
  const all = plan?.creditsAll ?? 0
  const short = balance !== null && next > balance

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5">
        <span className="text-sm font-semibold tracking-tight text-ink-100">Run</span>
        <span className="ml-2 text-xs text-ink-500">{doc.blocks.length} {doc.blocks.length === 1 ? 'block' : 'blocks'}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-5 py-4">
          {fields.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">Fields</p>
              {fields.map((b) => (
                <div key={b.id} className="flex flex-col gap-1">
                  <span className="px-1 text-[12px] text-ink-300">{titleOf(b)}</span>
                  {b.kind === 'bank' ? (
                    <BankPick block={b} bank={(b.settings.bank as BankType) ?? 'products'} />
                  ) : (
                    <button type="button" onClick={() => setSelection([b.id])} className="rounded-2xl border border-ink/10 px-4 py-3 text-left text-[12px] text-ink-300 hover:border-ink/20">
                      Edit in its block
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl border border-ink/5 bg-ink/[0.02] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-ink-400">Next Run</span>
              <span className="text-[15px] font-semibold tabular-nums text-ink-100">{creditsLabel(next, plan?.unpriced)}</span>
            </div>
            {plan && plan.planned.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {plan.planned.map((id) => {
                  const b = doc.blocks.find((x) => x.id === id)
                  const bp = plan.blocks[id]
                  if (!b) return null
                  return (
                    <button key={id} type="button" onClick={() => setSelection([id])} className="flex items-center justify-between rounded-lg px-1 py-0.5 text-left text-[11.5px] hover:bg-ink/[0.04]">
                      <span className="text-ink-400">{titleOf(b)}{bp.runs > 1 ? ` ×${bp.runs}` : ''}</span>
                      <span className="tabular-nums text-ink-500">{creditsLabel(bp.credits, bp.unpriced)}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-ink/5 pt-2">
              <span className="text-[12px] text-ink-500">Whole Flow</span>
              <span className="text-[12px] tabular-nums text-ink-400">{creditsLabel(all)}</span>
            </div>
            {balance !== null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-ink-500">Your Balance</span>
                <span className={`text-[12px] tabular-nums ${short ? 'text-red-400' : 'text-ink-400'}`}>{Math.floor(balance).toLocaleString('en-US')} credits</span>
              </div>
            )}
          </section>

          {short && (
            <p className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300 light:text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This run needs {creditsLabel(next)} and your balance is {Math.floor(balance!).toLocaleString('en-US')}. Top up at kie.ai, or Test With 1 first.
            </p>
          )}

          {blocked.length > 0 && (
            <section className="flex flex-col gap-1">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">Needs Attention</p>
              {blocked.map((b) => (
                <button key={b.id} type="button" onClick={() => setSelection([b.id])} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] hover:bg-ink/[0.04]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  <span><span className="text-ink-200">{titleOf(b)}</span> <span className="text-ink-500">· {plan!.blocks[b.id].blocked}</span></span>
                </button>
              ))}
            </section>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-ink-500">
            Runs while UGC OS is open. Close the tab and it picks up where it left off when you're back. Everything it makes lands in each app's own history.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-ink/5 px-5 pb-3 pt-3">
        {recording && <p className="mb-2 text-[11px] text-rose-300">Recording Mode is on: runs replay what you hid, and spend nothing.</p>}
        <div className="flex items-center gap-2">
          {!active && (
            <button
              type="button"
              onClick={() => onRun({ test: true })}
              title="Runs every block once with each batch cut to one item, to check quality before paying for the lot"
              className="flex h-[52px] shrink-0 flex-col items-center justify-center rounded-full border border-ink/10 px-4 text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold"><FlaskConical className="h-3.5 w-3.5" />Test With 1</span>
              <span className="text-[10px] tabular-nums text-ink-500">{creditsPill(test?.credits ?? 0, test?.unpriced)}</span>
            </button>
          )}
          {/* The label says what the press does and the line under it what it
              costs — two lines, so neither is ever truncated to fit the other. */}
          <button
            type="button"
            onClick={() => onRun(button.again ? { fresh: true } : {})}
            className="glass-fill glass-fill-soft flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full border border-white/15 bg-flow-500 px-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110"
          >
            <Play className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="truncate text-sm font-bold tracking-tight">{button.label}</span>
              {!active && next > 0 && (
                <span className="flex items-center gap-1 text-[10.5px] font-medium text-white/80">
                  <Coins className="h-2.5 w-2.5" />
                  {creditsPill(next, button.unpriced)}{button.again ? ' · new takes' : ''}
                </span>
              )}
            </span>
          </button>
          {active && run && <StopButton flowId={run.flowId} />}
        </div>
      </div>
    </div>
  )
}
