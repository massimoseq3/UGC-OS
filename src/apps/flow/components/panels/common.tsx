// The parts every block's panel shares: the header band, where its result
// comes from, what's wired into it, Pause for Review, Show as a Field, and
// Run Block at the foot.

import { useState, type ReactNode } from 'react'
import { AlertCircle, Coins, Play, Square, X } from 'lucide-react'
import type { BlockSource, FlowBlock, FlowDoc } from '../../types'
import type { FlowPlan } from '../../engine/plan'
import { insOf, isRunnable, KINDS, sourceOf, titleOf, TYPE_META } from '../../engine/catalog'
import { acceptsLabel, blockById, outputLabel, wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import { stopRun, blockStatusLine, type LiveRun } from '../../run/runtime'
import { creditsPill } from '../../hooks/useFlowPlan'
import { blockAccent, blockIcon } from '../blockMeta'
import { GlassTile } from '../../../../components/AppGlassTile'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import Switch from '../../../../components/Switch'
import Spinner from '../../../../components/Spinner'
import type { RunRequest } from '../Editor'

export function BlockHeader({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  return (
    <div className="flex h-[57px] shrink-0 items-center gap-2.5 border-b border-ink/5 px-5">
      <GlassTile icon={blockIcon(block)} accent={blockAccent(block)} size={26} />
      <input
        value={block.label ?? ''}
        placeholder={titleOf({ ...block, label: undefined })}
        onChange={(e) => patchBlock(block.id, { label: e.target.value || undefined }, { coalesce: `label:${block.id}` })}
        className="min-w-0 flex-1 rounded-full bg-transparent px-2 py-1 text-sm font-semibold tracking-tight text-ink-100 outline-none placeholder:text-ink-100 hover:bg-ink/[0.04] focus:bg-ink/[0.06]"
        aria-label="Block Name"
      />
    </div>
  )
}

const SOURCE_LABEL: Record<BlockSource, string> = { generate: 'Generate', bank: 'From Bank', history: 'From History' }

export function SourceToggle({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const sources = KINDS[block.kind].sources
  if (sources.length < 2) return null
  const current = sourceOf(block) ?? sources[0]
  return (
    <SegmentedToggle
      options={sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
      value={current}
      onChange={(next) => patchBlock(block.id, { source: next, pick: undefined })}
      accent="flow"
    />
  )
}

// What's wired into each input, with a × to cut it.
export function InputsCard({ block, doc }: { block: FlowBlock; doc: FlowDoc }) {
  const removeWire = useFlowStore((s) => s.removeWire)
  const ins = insOf(block)
  if (!ins.length) return null
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-ink/5 bg-ink/[0.02] p-2">
      {ins.map((p) => {
        const wires = wiresInto(doc, block.id, p.key)
        return (
          <div key={p.key} className="flex min-h-[32px] flex-wrap items-center gap-1.5 px-2 py-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_META[p.type].color }} />
            <span className="text-[12px] font-medium text-ink-200">{p.label}</span>
            {p.required && !wires.length && <span className="text-[11px] text-red-400/90">Required</span>}
            <span className="ml-auto flex flex-wrap justify-end gap-1">
              {wires.length === 0 && <span className="text-[11px] text-ink-500" title={`Takes ${acceptsLabel(p.type)}`}>Not wired</span>}
              {wires.map((w) => {
                const from = blockById(doc, w.from)
                return (
                  <span key={w.id} className="flex items-center gap-1 rounded-full bg-ink/[0.05] py-0.5 pl-2.5 pr-1 text-[11px] text-ink-300">
                    From {from ? outputLabel(from, w.fromPort) : 'a block'}
                    <button type="button" onClick={() => removeWire(w.id)} className="flex h-4 w-4 items-center justify-center rounded-full text-ink-500 hover:bg-ink/10 hover:text-ink-100" title="Cut This Wire">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                )
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-ink/5 bg-ink/[0.02] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink-200">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} accent="flow" size="sm" />
    </div>
  )
}

const REVIEW_HINT: Partial<Record<FlowBlock['kind'], string>> = {
  scripts: 'When it finishes, tick the hooks to keep. Only those run on.',
  characters: 'When it finishes, pick the faces to keep.',
  voice: 'When it finishes, keep the takes you like.',
  broll: 'After the stills, pick which get animated, before any clip is paid for.',
  playground: 'When it finishes, keep the ones you like.',
}

export function FlowToggles({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const reviewable = KINDS[block.kind].reviewable && sourceOf(block) === 'generate'
  const fieldable = block.kind === 'bank' || block.kind === 'image' || block.kind === 'text' || (KINDS[block.kind].runnable && sourceOf(block) === 'bank')
  return (
    <>
      {reviewable && (
        <ToggleRow
          label="Pause for Review"
          hint={REVIEW_HINT[block.kind]}
          checked={!!block.review}
          onChange={(next) => patchBlock(block.id, { review: next || undefined })}
        />
      )}
      {fieldable && (
        <ToggleRow
          label="Show as a Field in Run"
          hint="Whoever runs this flow picks their own. Yours stays as the example."
          checked={!!block.field}
          onChange={(next) => patchBlock(block.id, { field: next || undefined })}
        />
      )}
    </>
  )
}

// The foot of a runnable block's panel: Run Block, priced.
export function RunBar({
  block,
  plan,
  run,
  onRun,
  label,
}: {
  block: FlowBlock
  plan: FlowPlan | null
  run: LiveRun | undefined
  onRun: (req: RunRequest) => void
  label?: string
}) {
  if (!isRunnable(block)) return null
  const bp = plan?.blocks[block.id]
  const active = run?.status === 'running'
  const state = active ? run.blocks[block.id] : undefined
  const blocked = bp?.blocked
  const credits = bp?.creditsAll ?? 0
  return (
    <div className="shrink-0 border-t border-ink/5 px-5 pb-3 pt-3">
      {blocked && (
        <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-amber-400/90">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {blocked}
        </p>
      )}
      {state && (
        <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-flow-300">
          {state.status === 'running' && <Spinner className="h-3 w-3" />}
          {blockStatusLine(state)}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRun({ only: block.id })}
          className="glass-fill glass-fill-soft flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-flow-500 px-5 py-3.5 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110"
        >
          <Play className="h-4 w-4" strokeWidth={2.5} />
          <span>{active ? 'Running' : label ?? 'Run Block'}</span>
          {!active && credits > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
              <Coins className="h-3 w-3" />
              {creditsPill(credits, bp?.unpriced)}
            </span>
          )}
        </button>
        {active && <StopButton flowId={run.flowId} />}
      </div>
    </div>
  )
}

export function StopButton({ flowId }: { flowId: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true)
          setTimeout(() => setArmed(false), 3000)
          return
        }
        stopRun(flowId)
      }}
      title="Stop · kie.ai finishes anything already sent, and running again picks those up without paying twice"
      className={`flex h-[50px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors ${armed ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-ink/10 text-ink-300 hover:border-ink/20 hover:text-ink-100'}`}
    >
      <Square className="h-3 w-3" />
      {armed ? 'Stop?' : 'Stop'}
    </button>
  )
}

export function PanelSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 px-5 pb-2 pt-4">{children}</div>
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">{children}</p>
}
