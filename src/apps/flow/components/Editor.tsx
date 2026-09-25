// A flow open for editing: the canvas, the whole width of the window, under a
// 57px header band that carries the run controls. A block's settings open in
// its app's own window over the canvas (BlockWindow) — the same panels a
// member already knows from the app itself, plus what only a flow has.

import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useFlowStore } from '../store/flowStore'
import { useFlowRunStore, isRunActive, startRun, PLAN_DEPS, type StartResult } from '../run/runtime'
import { planFlow } from '../engine/plan'
import { knownGraph } from '../store/blocks'
import { useFlowPlans, creditsLabel } from '../hooks/useFlowPlan'
import { useAppStore } from '../../../stores/appStore'
import { useCreditsStore } from '../../../stores/creditsStore'
import { isRecordingActive } from '../../../stores/recordingStore'
import RailOverlay from '../../../components/RailOverlay'
import { useHistoryRailOpen } from '../../../hooks/useHistoryRailOpen'
import Modal from '../../../components/Modal'
import Canvas from './Canvas'
import EditorHeader from './EditorHeader'
import BlockWindow from './window/BlockWindow'
import ReviewModal from './ReviewModal'
import RunHistory from './RunHistory'
import RunView from './RunView'
import TemplateUpdateBar from './TemplateUpdateBar'
import { titleOf } from '../engine/catalog'
import { useIsDesktop } from '../../../hooks/useBreakpoint'

// Past either, Run asks first and shows what it'll spend.
export const CONFIRM_CREDITS = 500
export const CONFIRM_GENERATIONS = 20

export interface RunRequest {
  test?: boolean
  only?: string
  // Run Again: everything made afresh, for new takes of a finished flow.
  fresh?: boolean
}

export default function Editor({ flowId }: { flowId: string }) {
  const doc = useFlowStore((s) => s.docs[flowId])
  const openFlow = useFlowStore((s) => s.openFlow)
  const windowId = useFlowStore((s) => s.windowId)
  const closeWindow = useFlowStore((s) => s.closeWindow)
  const run = useFlowRunStore((s) => s.runs[flowId])
  const log = useFlowRunStore((s) => s.log[flowId])
  const addToast = useAppStore((s) => s.addToast)
  const balance = useCreditsStore((s) => s.balance)
  const refreshBalance = useCreditsStore((s) => s.refresh)
  const { plan, test, again } = useFlowPlans(doc)
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
    if (isRecordingActive()) {
      go(req)
      return
    }
    // Run Block is priced off its own plan: every run of the block made
    // again, plus whatever it reads from that isn't made yet.
    const p = req.test ? test
      : req.only || req.fresh ? planFlow(knownGraph(doc), doc.outputs, PLAN_DEPS, { only: req.only, fresh: req.fresh })
      : plan
    const credits = p?.credits ?? 0
    const generations = p?.generations ?? 0
    if (balance !== null && credits > balance) {
      addToast(`This run needs ${creditsLabel(credits)} and your kie.ai balance is ${Math.floor(balance).toLocaleString('en-US')}. Top up at kie.ai first, or run less.`, 'error')
      return
    }
    // Run Again always asks: it pays for things that are already made.
    if (req.fresh || credits >= CONFIRM_CREDITS || generations >= CONFIRM_GENERATIONS) {
      const lines = (p?.planned ?? [])
        .map((id) => ({ label: titleOf(doc.blocks.find((b) => b.id === id)!), credits: p?.blocks[id]?.credits ?? 0 }))
        .filter((l) => l.credits > 0)
      setConfirm({ req, credits, generations, lines })
      return
    }
    go(req)
  }

  const reviewBlock = reviewId ? doc.blocks.find((b) => b.id === reviewId) : undefined
  const windowBlock = windowId ? doc.blocks.find((b) => b.id === windowId && !b.suggested) : undefined

  return (
    <ReactFlowProvider>
      <div className="relative flex h-full flex-col">
        {view === 'run' ? (
          <RunView flowId={flowId} doc={doc} plan={plan} test={test} again={again} run={run} balance={balance} onRun={requestRun} onEdit={() => setView('edit')} onBack={() => openFlow(null)} />
        ) : (
          <>
            <EditorHeader
              flowId={flowId}
              doc={doc}
              plan={plan}
              test={test}
              again={again}
              run={run}
              balance={balance}
              onRun={requestRun}
              view={view}
              onView={setView}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen(!historyOpen)}
              runCount={log?.length}
            />
            <TemplateUpdateBar doc={doc} />
            {/* `relative` is what the history rail positions against, and
                `overflow-hidden` keeps its slide from widening the shell. */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              <Canvas
                flowId={flowId}
                doc={doc}
                plan={plan}
                run={run}
                onReview={setReviewing}
                onRunBlock={(id) => requestRun({ only: id })}
                // The canvas's own keys stand down while anything is open over it.
                keysActive={!windowBlock && !reviewBlock && !confirm && !historyOpen}
              />
              <RailOverlay open={historyOpen} onClose={() => setHistoryOpen(false)}>
                <RunHistory flowId={flowId} onDone={() => setHistoryOpen(false)} />
              </RailOverlay>
            </div>
          </>
        )}
      </div>

      {view === 'edit' && windowBlock && (
        <BlockWindow
          key={windowBlock.id}
          flowId={flowId}
          doc={doc}
          block={windowBlock}
          plan={plan}
          run={run}
          onRun={requestRun}
          onReview={setReviewing}
          onClose={closeWindow}
        />
      )}

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
        title={confirm?.req.test ? 'Run the Test?' : confirm?.req.fresh ? 'Make Everything Again?' : 'Run This Flow?'}
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
            {confirm.req.fresh && (
              <p className="text-ink-200">Nothing has changed, so every block makes new takes from the same settings. What the last run made stays in each app's history.</p>
            )}
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
