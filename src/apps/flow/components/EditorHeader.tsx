// The canvas's header band. The canvas has the window to itself — a block's
// settings open in its app's own window, never in a column beside it — so
// the run controls the flow's column used to carry live here: what the next
// run costs and why (the ▾ beside Run), Test With 1, and Run Flow. What a run
// doesn't need — past runs, Pin to Dock, Export — waits behind the ⋯.

import { useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { AlertCircle, ArrowLeft, ChevronDown, Coins, Download, FlaskConical, Layers, MoreHorizontal, Pin, PinOff, Play, RotateCw } from 'lucide-react'
import type { FlowDoc } from '../types'
import type { FlowPlan } from '../engine/plan'
import { KINDS, titleOf } from '../engine/catalog'
import type { LiveRun } from '../run/runtime'
import { creditsLabel, creditsPill, runButton } from '../hooks/useFlowPlan'
import { useFlowStore } from '../store/flowStore'
import { exportTemplate } from '../templates/io'
import { useRecordingActive } from '../../../stores/recordingStore'
import SegmentedToggle from '../../../components/SegmentedToggle'
import Spinner from '../../../components/Spinner'
import AnchoredPopover from '../../../components/video/AnchoredPopover'
import { MenuItem, MenuSurface, MENU_ROW_HEIGHT } from '../../../components/Menu'
import useCloseOnEscape from '../../../hooks/useCloseOnEscape'
import { KIE_BILLING_URL } from '../../../utils/constants'
import { opensWindow } from './blockMeta'
import { StopButton } from './panels/common'
import type { RunRequest } from './Editor'

export default function EditorHeader({
  flowId,
  doc,
  plan,
  test,
  again,
  run,
  balance,
  onRun,
  view,
  onView,
  onShowRuns,
  runCount,
}: {
  flowId: string
  doc: FlowDoc
  plan: FlowPlan | null
  test: FlowPlan | null
  again: FlowPlan | null
  run: LiveRun | undefined
  balance: number | null
  onRun: (req: RunRequest) => void
  view: 'edit' | 'run'
  onView: (view: 'edit' | 'run') => void
  onShowRuns: () => void
  runCount?: number
}) {
  const openFlow = useFlowStore((s) => s.openFlow)
  const renameFlow = useFlowStore((s) => s.renameFlow)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const active = run?.status === 'running'
  const button = runButton(doc, plan, again, run)
  const next = button.credits
  // Everything that can't hand anything on yet: an app block missing an
  // input, and a field nobody has filled.
  const blocked = doc.blocks.filter((b) => !b.suggested && KINDS[b.kind] && b.kind !== 'note' && plan?.blocks[b.id]?.blocked && plan.blocks[b.id].blocked !== 'Turned off')


  return (
    <div className="relative z-20 flex h-[57px] shrink-0 items-center gap-2 border-b border-ink/5 px-4">
      <button
        type="button"
        onClick={() => openFlow(null)}
        title="All Flows"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      {/* "Canvas", never "Edit": Edit is the Edit app, a dock tile away, and
          every way into this view elsewhere already reads Open Canvas. The
          view's id stays 'edit'. */}
      <SegmentedToggle
        options={[{ value: 'edit', label: 'Canvas' }, { value: 'run', label: 'Run' }]}
        value={view}
        onChange={onView}
        fitContent
        dense
        accent="flow"
      />
      {/* A draft while typing, saved on blur: the store trims a name, so
          saving every keystroke swallowed each space as it was typed. */}
      <input
        value={nameDraft ?? doc.name}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={() => {
          if (nameDraft !== null) renameFlow(flowId, nameDraft)
          setNameDraft(null)
        }}
        className="min-w-0 max-w-[280px] flex-1 rounded-full bg-transparent px-2 py-1 text-sm font-semibold tracking-tight text-ink-100 outline-none hover:bg-ink/[0.04] focus:bg-ink/[0.06]"
        aria-label="Flow Name"
      />

      <div className="relative ml-auto flex shrink-0 items-center gap-2">
        {blocked.length > 0 && !active && (
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-medium text-amber-300 transition-colors hover:border-amber-500/40 light:text-amber-700"
            title="Blocks that can't run yet, and why"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{blocked.length} Need{blocked.length === 1 ? 's' : ''} Attention</span>
            <span className="xl:hidden">{blocked.length}</span>
          </button>
        )}
        <MoreMenu flowId={flowId} doc={doc} runCount={runCount} onShowRuns={onShowRuns} />

        <span className="mx-1 h-6 w-px bg-ink/10" />

        {/* Nothing left to test once a test's been made and nothing changed:
            the button would only say so in a toast. */}
        {!active && !!test?.planned.length && (
          <button
            type="button"
            onClick={() => onRun({ test: true })}
            title="Runs every block once with each batch cut to one item, to check quality before paying for the lot"
            className="flex h-10 items-center gap-1.5 rounded-full border border-ink/10 px-3.5 text-xs font-semibold text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Test With 1</span>
            <span className="font-medium tabular-nums text-ink-500">{creditsPill(test?.credits ?? 0, test?.unpriced)}</span>
          </button>
        )}

        {/* Run Flow, with what it costs riding on it like every Generate, and
            the ▾ that opens where that number comes from. */}
        <div className="glass-fill glass-fill-soft flex h-10 items-stretch overflow-hidden rounded-full border border-white/15 bg-flow-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110">
          <button
            type="button"
            onClick={() => onRun(button.again ? { fresh: true } : {})}
            title={button.again ? 'Nothing has changed. Run Again makes every block afresh, for new takes.' : undefined}
            className="flex items-center gap-2 pl-4 pr-3 text-[13px] font-bold tracking-tight"
          >
            {active ? <Spinner className="h-3.5 w-3.5" /> : button.again ? <RotateCw className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Play className="h-3.5 w-3.5" strokeWidth={2.5} />}
            <span className="whitespace-nowrap">{button.label}</span>
            {!active && next > 0 && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                <Coins className="h-3 w-3" />
                {creditsPill(next, button.unpriced)}
              </span>
            )}
          </button>
          <span className="my-2.5 w-px bg-white/25" />
          <button
            type="button"
            onClick={() => setSummaryOpen(!summaryOpen)}
            aria-label="What This Run Costs"
            title="What this run makes and costs"
            className="flex w-9 items-center justify-center"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {active && run && <StopButton flowId={run.flowId} compact />}

        {summaryOpen && (
          <RunSummary doc={doc} plan={plan} balance={balance} blocked={blocked.map((b) => b.id)} onClose={() => setSummaryOpen(false)} />
        )}
      </div>
    </div>
  )
}

// Past Runs, Pin to Dock and Export, behind one ⋯ (September 2026, Massimo's
// call). The header carried ten controls, and these three are reached for
// now and then rather than on every run; out in the band they crowded what a
// run does need — Back, Canvas | Run, the name, Needs Attention, Test With 1,
// Run Flow and Stop. Export was "Share" until then, but what it does is
// download a file; sharing a template is the gallery's Copy Link.
function MoreMenu({ flowId, doc, runCount, onShowRuns }: { flowId: string; doc: FlowDoc; runCount?: number; onShowRuns: () => void }) {
  const setPinned = useFlowStore((s) => s.setPinned)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  useCloseOnEscape(open, close)
  const pinned = !!doc.pinned
  // Picking a row shuts the menu first, then acts.
  const pick = (act: () => void) => () => {
    close()
    act()
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(!open)}
        title="Past runs, Pin to Dock and Export"
        aria-label="More"
        aria-expanded={open}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${open ? 'border-ink/20 text-ink-100' : 'border-ink/10 text-ink-400 hover:border-ink/20 hover:text-ink-100'}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <AnchoredPopover anchorRef={ref} open={open} onClose={close} width={208} align="end" estimatedHeight={3 * MENU_ROW_HEIGHT + 2}>
        <MenuSurface>
          {/* The stack, as on every history rail's own toggle: the list it
              opens is the same kind of thing. */}
          <MenuItem
            icon={Layers}
            onClick={pick(onShowRuns)}
            trailing={runCount ? (
              <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-ink-200">{runCount}</span>
            ) : undefined}
          >
            Past Runs
          </MenuItem>
          <MenuItem
            icon={pinned ? PinOff : Pin}
            onClick={pick(() => setPinned(flowId, !pinned))}
            title={pinned ? undefined : 'A tile of its own in the dock, opening straight into Run, like an app'}
          >
            {pinned ? 'Unpin From Dock' : 'Pin to Dock'}
          </MenuItem>
          <MenuItem
            icon={Download}
            onClick={pick(() => void exportTemplate(doc))}
            title="Downloads this flow as a .ugcflow file. Your product and character become fields for whoever imports it."
          >
            Export
          </MenuItem>
        </MenuSurface>
      </AnchoredPopover>
    </>
  )
}

// What Run Flow will make and spend, block by block, against the kie.ai
// balance — and what can't run yet, with a way to each.
function RunSummary({
  doc,
  plan,
  balance,
  blocked,
  onClose,
}: {
  doc: FlowDoc
  plan: FlowPlan | null
  balance: number | null
  blocked: string[]
  onClose: () => void
}) {
  const rf = useReactFlow()
  const setSelection = useFlowStore((s) => s.setSelection)
  const openWindow = useFlowStore((s) => s.openWindow)
  const recording = useRecordingActive()
  const next = plan?.credits ?? 0
  const all = plan?.creditsAll ?? 0
  const short = balance !== null && next > balance

  const show = (id: string) => {
    setSelection([id])
    void rf.fitView({ nodes: [{ id }], padding: 0.6, maxZoom: 1, duration: 300 })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-ink/10 bg-surface-2 shadow-xl shadow-black/30">
        <div className="flex items-baseline justify-between px-4 pb-2 pt-3.5">
          <span className="text-[12px] font-medium text-ink-400">Next Run</span>
          <span className="text-[15px] font-semibold tabular-nums text-ink-100">{creditsLabel(next, plan?.unpriced)}</span>
        </div>
        {plan && plan.planned.length > 0 ? (
          <div className="flex max-h-[240px] flex-col overflow-y-auto px-2 pb-2">
            {plan.planned.map((id) => {
              const b = doc.blocks.find((x) => x.id === id)
              const bp = plan.blocks[id]
              if (!b) return null
              return (
                <button key={id} type="button" onClick={() => show(id)} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-ink/[0.05]">
                  <span className="text-ink-300">{titleOf(b)}{bp.runs > 1 ? ` ×${bp.runs}` : ''}</span>
                  <span className="tabular-nums text-ink-500">{creditsLabel(bp.credits, bp.unpriced)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="px-4 pb-3 text-[12px] text-ink-500">Everything is made. Change a block and it runs again.</p>
        )}
        <div className="flex flex-col gap-1 border-t border-ink/5 px-4 py-3">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-ink-500">Whole Flow</span>
            <span className="tabular-nums text-ink-400">{creditsLabel(all)}</span>
          </div>
          {balance !== null && (
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-ink-500">Your Balance</span>
              <span className={`tabular-nums ${short ? 'text-red-400' : 'text-ink-400'}`}>{Math.floor(balance).toLocaleString('en-US')} credits</span>
            </div>
          )}
          {short && (
            <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-red-300 light:text-red-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>More than your balance. <a href={KIE_BILLING_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-ink/30 underline-offset-2 hover:decoration-ink/60">Top up at kie.ai</a>, or Test With 1 first.</span>
            </p>
          )}
        </div>
        {blocked.length > 0 && (
          <div className="flex flex-col border-t border-ink/5 px-2 py-2">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">Needs Attention</p>
            {blocked.map((id) => {
              const b = doc.blocks.find((x) => x.id === id)
              if (!b) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    show(id)
                    if (opensWindow(b)) openWindow(id)
                  }}
                  className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-ink/[0.05]"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  <span><span className="text-ink-200">{titleOf(b)}</span> <span className="text-ink-500">· {plan?.blocks[id]?.blocked}</span></span>
                </button>
              )
            })}
          </div>
        )}
        <p className="border-t border-ink/5 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
          {recording
            ? 'Recording Mode is on: runs replay what you hid, and spend nothing.'
            : "Runs while UGC OS is open. Close the tab and it picks up where it left off. Everything it makes lands in each app's own history."}
        </p>
      </div>
    </>
  )
}
