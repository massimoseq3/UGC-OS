// A flow open for editing: the selected block's own panel on the left (or,
// with nothing selected, the flow's — its run fields, its estimate and Run),
// and the canvas on the right under a 57px header band.

import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft, Layers, Share2, Workflow } from 'lucide-react'
import { useFlowStore } from '../store/flowStore'
import { useFlowRunStore, isRunActive, startRun, type StartResult } from '../run/runtime'
import { useFlowPlans, creditsLabel } from '../hooks/useFlowPlan'
import { useAppStore } from '../../../stores/appStore'
import { useCreditsStore } from '../../../stores/creditsStore'
import { isRecordingActive } from '../../../stores/recordingStore'
import MobilePaneTabs from '../../../components/MobilePaneTabs'
import { paneClass } from '../../../components/paneClass'
import RailOverlay from '../../../components/RailOverlay'
import HistoryRailToggle from '../../../components/HistoryRailToggle'
import { useHistoryRailOpen } from '../../../hooks/useHistoryRailOpen'
import Modal from '../../../components/Modal'
import Canvas from './Canvas'
import FlowPanel from './panels/FlowPanel'
import BlockPanel from './panels/BlockPanel'
import ReviewModal from './ReviewModal'
import RunHistory from './RunHistory'
import RunView from './RunView'
import PinButton from './PinButton'
import TemplateUpdateBar from './TemplateUpdateBar'
import { titleOf } from '../engine/catalog'
import { exportTemplate } from '../templates/io'
import SegmentedToggle from '../../../components/SegmentedToggle'
import { useIsDesktop } from '../../../hooks/useBreakpoint'

// Past either, Run asks first and shows what it'll spend.
export const CONFIRM_CREDITS = 500
export const CONFIRM_GENERATIONS = 20

export interface RunRequest {
  test?: boolean
  only?: string
}

export default function Editor({ flowId }: { flowId: string }) {
  const doc = useFlowStore((s) => s.docs[flowId])
  const selection = useFlowStore((s) => s.selection)
  const openFlow = useFlowStore((s) => s.openFlow)
  const renameFlow = useFlowStore((s) => s.renameFlow)
  const run = useFlowRunStore((s) => s.runs[flowId])
  const log = useFlowRunStore((s) => s.log[flowId])
  const addToast = useAppStore((s) => s.addToast)
  const balance = useCreditsStore((s) => s.balance)
  const refreshBalance = useCreditsStore((s) => s.refresh)
  const { plan, test } = useFlowPlans(doc)
  const [pane, setPane] = useState<'canvas' | 'panel'>('canvas')
  const storedView = useFlowStore((s) => s.view)
  const setView = useFlowStore((s) => s.setView)
  // Phones get Run View: editing the canvas stays on a computer.
  const isDesktop = useIsDesktop()
  const view = isDesktop ? storedView : 'run'
  const [historyOpen, setHistoryOpen] = useHistoryRailOpen()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [confirm, setConfirm] = useState<{ req: RunRequest; credits: number; generations: number; lines: Array<{ label: string; credits: number }> } | null>(null)

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  // A block that stops for review opens its window, once — Review Later
  // leaves it waiting on the block.
  const pendingReview = run?.reviews.find((id) => !dismissed.includes(id)) ?? null
  const reviewId = reviewing ?? pendingReview

  if (!doc) return null
  const selected = selection.length === 1 ? doc.blocks.find((b) => b.id === selection[0]) : undefined
  const active = isRunActive(run)

  const go = (req: RunRequest): StartResult => {
    const result = startRun(flowId, req)
    if (!result.ok) addToast(result.reason, 'error')
    return result
  }

  // Run Flow, Test With 1 and Run Block all come through here: nothing is
  // billed before the plan is priced, the balance is checked, and a big run
  // is confirmed.
  const requestRun = (req: RunRequest) => {
    if (active) {
      addToast('This flow is already running. It finishes on its own, or press Stop.', 'info')
      return
    }
    const p = req.test ? test : req.only ? null : plan
    if (isRecordingActive()) {
      go(req)
      return
    }
    // Run Block is priced off its own plan.
    const priced = p ?? (plan ? { ...plan, credits: plan.blocks[req.only!]?.creditsAll ?? 0, generations: plan.blocks[req.only!]?.instances.length ?? 0 } : null)
    const credits = priced?.credits ?? 0
    const generations = priced?.generations ?? 0
    if (balance !== null && credits > balance) {
      addToast(`This run needs ${creditsLabel(credits)} and your kie.ai balance is ${Math.floor(balance).toLocaleString('en-US')}. Top up at kie.ai first, or run less.`, 'error')
      return
    }
    if (credits >= CONFIRM_CREDITS || generations >= CONFIRM_GENERATIONS) {
      const lines = (p?.planned ?? (req.only ? [req.only] : []))
        .map((id) => ({ label: titleOf(doc.blocks.find((b) => b.id === id)!), credits: req.only ? credits : p?.blocks[id]?.credits ?? 0 }))
        .filter((l) => l.credits > 0)
      setConfirm({ req, credits, generations, lines })
      return
    }
    go(req)
  }

  const reviewBlock = reviewId ? doc.blocks.find((b) => b.id === reviewId) : undefined

  return (
    <ReactFlowProvider>
      <div className="relative flex h-full flex-col">
        {view === 'run' ? (
          <RunView flowId={flowId} doc={doc} plan={plan} test={test} run={run} balance={balance} onRun={requestRun} onEdit={() => setView('edit')} onBack={() => openFlow(null)} />
        ) : (
        <>
        <MobilePaneTabs
          options={[
            { value: 'canvas', label: 'Canvas', icon: Workflow },
            { value: 'panel', label: selected ? titleOf(selected) : 'Run', icon: Layers },
          ]}
          value={pane}
          onChange={setPane}
          accent="flow"
        />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className={paneClass(pane === 'panel', 'md:w-[400px] md:shrink-0 md:border-r md:border-ink/5')}>
            {selected ? (
              <BlockPanel key={selected.id} flowId={flowId} block={selected} doc={doc} plan={plan} run={run} onRun={requestRun} />
            ) : (
              <FlowPanel flowId={flowId} doc={doc} plan={plan} test={test} run={run} balance={balance} onRun={requestRun} />
            )}
          </div>

          <div className={paneClass(pane === 'canvas', 'md:flex-1 md:overflow-hidden')}>
            <div className="relative flex min-h-0 flex-1 md:overflow-hidden">
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex h-[57px] shrink-0 items-center gap-2 border-b border-ink/5 px-5">
                  <button
                    type="button"
                    onClick={() => openFlow(null)}
                    title="All Flows"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <input
                    value={doc.name}
                    onChange={(e) => renameFlow(flowId, e.target.value)}
                    className="min-w-0 max-w-[260px] flex-1 rounded-full bg-transparent px-2 py-1 text-sm font-semibold tracking-tight text-ink-100 outline-none hover:bg-ink/[0.04] focus:bg-ink/[0.06]"
                    aria-label="Flow Name"
                  />
                  <SegmentedToggle
                    options={[{ value: 'edit', label: 'Edit' }, { value: 'run', label: 'Run' }]}
                    value={view}
                    onChange={setView}
                    fitContent
                    dense
                    accent="flow"
                  />
                  <div className="ml-auto flex items-center gap-2">
                    <PinButton flowId={flowId} pinned={!!doc.pinned} />
                    <button
                      type="button"
                      onClick={() => void exportTemplate(doc)}
                      title="Share · downloads this flow as a template file. Your product and character become fields for whoever imports it."
                      className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Share</span>
                    </button>
                    <HistoryRailToggle open={historyOpen} onToggle={() => setHistoryOpen(!historyOpen)} label="runs" count={log?.length} />
                  </div>
                </div>
                <TemplateUpdateBar doc={doc} />
                <Canvas flowId={flowId} doc={doc} plan={plan} run={run} onReview={setReviewing} onRunBlock={(id) => requestRun({ only: id })} />
              </div>
              <RailOverlay open={historyOpen} onClose={() => setHistoryOpen(false)}>
                <RunHistory flowId={flowId} onDone={() => setHistoryOpen(false)} />
              </RailOverlay>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {reviewBlock && run && (
        <ReviewModal
          flowId={flowId}
          block={reviewBlock}
          run={run}
          doc={doc}
          onLater={() => {
            setDismissed((d) => [...d, reviewBlock.id])
            setReviewing(null)
          }}
          onDone={() => setReviewing(null)}
        />
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.req.test ? 'Run the Test?' : 'Run This Flow?'}
        footer={confirm && (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="rounded-full px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Not Now</button>
            <button
              type="button"
              onClick={() => {
                const req = confirm.req
                setConfirm(null)
                go(req)
              }}
              className="glass-fill glass-fill-soft rounded-full border border-white/15 bg-flow-500 px-5 py-2 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110"
            >
              Run · {confirm ? creditsLabel(confirm.credits) : ''}
            </button>
          </div>
        )}
      >
        {confirm && (
          <div className="flex flex-col gap-3 text-sm text-ink-300">
            <p>
              This run makes {confirm.generations} {confirm.generations === 1 ? 'generation' : 'generations'} for {creditsLabel(confirm.credits)}.
              {balance !== null && ` Your kie.ai balance is ${Math.floor(balance).toLocaleString('en-US')} credits.`}
            </p>
            <div className="flex flex-col divide-y divide-ink/5 rounded-2xl border border-ink/5">
              {confirm.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 text-[13px]">
                  <span className="text-ink-200">{l.label}</span>
                  <span className="tabular-nums text-ink-400">{creditsLabel(l.credits)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-500">Runs while UGC OS is open. Close the tab and it picks up where it left off next time.</p>
          </div>
        )}
      </Modal>
    </ReactFlowProvider>
  )
}
