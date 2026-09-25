// How Was This Made and Save as Flow: one window, two views of the same walk
// back through a result's parents. How shows the chain as a member reads it;
// Save lays it out as blocks, the product and character as fields, and
// creates the flow without running anything.

import { useState } from 'react'
import { Workflow } from 'lucide-react'
import type { FlowPlan } from '../engine/plan'
import { planFlow } from '../engine/plan'
import { titleOf } from '../engine/catalog'
import { PLAN_DEPS } from '../run/runtime'
import { useFlowStore } from '../store/flowStore'
import { shapeBlocks } from '../store/blocks'
import { creditsLabel } from '../hooks/useFlowPlan'
import { flowFromLineage } from '../lineage/saveAsFlow'
import { MADE_BANKS, PICKED_BANKS, startOf, traceLineage, type LineageBanks, type Trace } from '../lineage/trace'
import { faceOf } from '../lineage/faces'
import { useBankStore } from '../../../stores/bankStore'
import type { Lineage, Provenance } from '../../../stores/types'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { formatRelative } from '../../../utils/history'
import Modal from '../../../components/Modal'
import SegmentedToggle from '../../../components/SegmentedToggle'
import { GlassTile } from '../../../components/AppGlassTile'
import PlanChips from './PlanChips'

export default function LineageModal() {
  const lineage = useFlowStore((s) => s.lineage)
  const close = useFlowStore((s) => s.closeLineage)
  if (!lineage) return null
  return lineage.view === 'how'
    ? <HowView key={`how:${lineage.ref.bank}:${lineage.ref.id}`} target={lineage.ref} onClose={close} />
    : <SaveView key={`save:${lineage.ref.bank}:${lineage.ref.id}`} target={lineage.ref} onClose={close} />
}

// ── How Was This Made ──────────────────────────────────────────────────────

function HowView({ target, onClose }: { target: Lineage; onClose: () => void }) {
  const banks = useBankStore((s) => s) as unknown as LineageBanks
  const flows = useBankStore((s) => s.flows)
  const openLineage = useFlowStore((s) => s.openLineage)
  const openFlow = useFlowStore((s) => s.openFlow)
  const setView = useFlowStore((s) => s.setView)
  const trace = traceLineage(target, banks)
  const root = trace.nodes[trace.root]
  const madeIn = root?.row && !PICKED_BANKS.has(root.bank) ? (root.row as Provenance).flowId : undefined
  const flow = madeIn ? flows.find((f) => f.id === madeIn) : undefined
  const canSave = (MADE_BANKS as readonly string[]).includes(target.bank) && !!root?.row

  return (
    <Modal
      open
      onClose={onClose}
      title="How This Was Made"
      size="medium"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Close</button>
          {canSave && (
            <button
              type="button"
              onClick={() => openLineage(target, 'save')}
              className="glass-fill glass-fill-soft flex items-center gap-2 rounded-full border border-white/15 bg-flow-500 px-5 py-2 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110"
            >
              <Workflow className="h-4 w-4" />
              Save as Flow
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        {!root?.row ? (
          <p className="text-sm text-ink-400">That result isn't in your history any more.</p>
        ) : (
          <>
            {madeIn && (
              <div className="flex items-center gap-3 rounded-2xl border border-flow-500/25 bg-flow-500/[0.05] px-4 py-3">
                <GlassTile icon={Workflow} accent="#0891B2" size={28} />
                <p className="min-w-0 flex-1 text-[12.5px] text-ink-200">
                  {flow ? <>Made by your flow <span className="font-semibold">{flow.name}</span>.</> : "Made in a flow you've since deleted."}
                </p>
                {flow && (
                  <button
                    type="button"
                    onClick={() => {
                      openFlow(flow.id)
                      setView('edit')
                      onClose()
                    }}
                    className="shrink-0 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
                  >
                    Open Flow
                  </button>
                )}
              </div>
            )}
            <LineageTree trace={trace} />
          </>
        )}
      </div>
    </Modal>
  )
}

// The result on top, and under each row what it was made from. A row seen
// twice — the product under both the script and the B-Roll — shows its own
// parents only the first time.
function LineageTree({ trace }: { trace: Trace }) {
  const shown = new Set<string>()
  const walk = (key: string, path: string[]): React.ReactNode => {
    const node = trace.nodes[key]
    if (!node) return null
    const first = !shown.has(key)
    shown.add(key)
    const parents = first ? node.parents.filter((p) => !path.includes(p) && trace.nodes[p]) : []
    return (
      <div key={`${path.join('>')}>${key}`} className="flex flex-col gap-2">
        <LineageRow node={node} again={!first} />
        {parents.length > 0 && (
          <div className="ml-4 flex flex-col gap-2 border-l border-ink/10 pl-4">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-500">Made From</span>
            {parents.map((p) => walk(p, [...path, key]))}
          </div>
        )}
      </div>
    )
  }
  const root = trace.nodes[trace.root]
  return (
    <div className="flex flex-col gap-2">
      {walk(trace.root, [])}
      {root && root.parents.length === 0 && (
        <p className="px-1 text-[12px] text-ink-500">Nothing it was made from was recorded. Anything made from here on keeps its sources.</p>
      )}
    </div>
  )
}

function LineageRow({ node, again }: { node: Trace['nodes'][string]; again: boolean }) {
  const face = faceOf(node)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-ink/[0.02] px-3 py-2.5">
      {face.thumb ? <Thumb refId={face.thumb} /> : <GlassTile icon={face.icon} accent={face.accent} size={36} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <span>{face.source}</span>
          {face.when ? <span>· {formatRelative(face.when)}</span> : null}
          {again && <span>· shown above</span>}
        </div>
        <p className={`truncate text-[13px] ${node.row ? 'text-ink-100' : 'italic text-ink-500'}`}>{face.title}</p>
        {face.detail && !again && <p className="truncate text-[11.5px] text-ink-400">{face.detail}</p>}
      </div>
    </div>
  )
}

function Thumb({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url
    ? <img src={thumb.url} alt="" className="h-11 w-9 shrink-0 rounded-lg object-cover" />
    : <div className="h-11 w-9 shrink-0 rounded-lg bg-ink/5" />
}

// ── Save as Flow ───────────────────────────────────────────────────────────

function SaveView({ target, onClose }: { target: Lineage; onClose: () => void }) {
  const banks = useBankStore((s) => s) as unknown as LineageBanks
  const createFlow = useFlowStore((s) => s.createFlow)
  const openFlow = useFlowStore((s) => s.openFlow)
  const setView = useFlowStore((s) => s.setView)
  const [keepScript, setKeepScript] = useState(false)
  const trace = traceLineage(startOf(target, banks), banks)
  const found = !!trace.nodes[trace.root]?.row
  const saved = found ? flowFromLineage(trace, { keepScript }) : null
  // A batch block's slots are what its downstream runs once per, so the
  // price is only right once they're there — the store adds them on create.
  const graph = saved ? { ...saved.graph, blocks: shapeBlocks(saved.graph) } : null
  const plan: FlowPlan | null = graph ? planFlow(graph, {}, PLAN_DEPS) : null
  const fields = graph?.blocks.filter((b) => b.field) ?? []

  const create = () => {
    if (!saved || !graph) return
    const id = createFlow({ name: saved.name, graph })
    openFlow(id)
    setView('edit')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Save as Flow"
      subtitle="Flow traced what made this and laid it out as blocks, with the settings each step used."
      size="medium"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Not Now</button>
          <button
            type="button"
            onClick={create}
            disabled={!saved?.graph.blocks.length}
            className="glass-fill glass-fill-soft rounded-full border border-white/15 bg-flow-500 px-5 py-2 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110 disabled:opacity-40"
          >
            Create Flow
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        {!saved ? (
          <p className="text-sm text-ink-400">That result isn't in your history any more.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-ink-100">{saved.name}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-ink-400">{creditsLabel(plan?.creditsAll ?? 0, plan?.unpriced)} a run</span>
            </div>
            <PlanChips blocks={graph?.blocks ?? []} plan={plan} />
            {saved.madeScript && (
              <div className="flex flex-col gap-1.5">
                <SegmentedToggle
                  options={[{ value: 'write', label: 'Write a New Script Each Run' }, { value: 'keep', label: 'Keep This Script' }]}
                  value={keepScript ? 'keep' : 'write'}
                  onChange={(v) => setKeepScript(v === 'keep')}
                  accent="flow"
                />
                <p className="px-1 text-[11.5px] text-ink-500">
                  {keepScript
                    ? 'The script stays word for word, so every run reads the same lines.'
                    : 'Scripts writes a fresh one each run, with the same settings, for whichever product you pick.'}
                </p>
              </div>
            )}
            {fields.length > 0 && (
              <div className="flex flex-col gap-1 rounded-2xl border border-ink/5 bg-ink/[0.02] p-3">
                <span className="px-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-500">Picked Each Run</span>
                {fields.map((b) => (
                  <p key={b.id} className="px-1 text-[12.5px] text-ink-200">
                    {titleOf(b)}
                    {b.pick ? <span className="text-ink-500"> · yours stays as the example</span> : <span className="text-amber-400/90"> · pick one before running</span>}
                  </p>
                ))}
              </div>
            )}
            {saved.notes.map((n) => <p key={n} className="text-[11.5px] leading-relaxed text-amber-400/90">{n}</p>)}
            <p className="text-[11.5px] text-ink-500">Creating the flow runs nothing. It opens on the canvas, ready to change or run.</p>
          </>
        )}
      </div>
    </Modal>
  )
}
