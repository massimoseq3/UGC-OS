// Module-level analysis queue. Survives React unmounts (so a user switching
// to another app mid-bulk doesn't kill the in-flight requests). With the
// createTask transport, jobs can also survive a page refresh — the taskId is
// persisted on the history row and `resumeAnalysisTask` re-attaches a poll.
// Rows that fall back to the streaming transport still can't be resumed; the
// mount-time reconciler flips those to 'error'.

import {
  startAnalysisTask,
  pollAnalysisTask,
  streamAnalysisFallback,
} from './analyzeAd'
import { captureFirstFrame } from '../utils/captureFirstFrame'
import { saveAsset, deleteAsset } from '../../../utils/assetStore'
// `deleteAsset` is still used by applyFailure below.
import { useBankStore } from '../../../stores/bankStore'
import type { AnalysisResult } from '../types'

const MAX_CONCURRENT = 5

let running = 0
const queue: Array<() => Promise<void>> = []

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!
    running++
    job().finally(() => {
      running--
      pump()
    })
  }
}

function deriveFallbackTitle(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const cleaned = stem.replace(/[_-]+/g, ' ').trim()
  return cleaned || 'Untitled ad'
}

async function applySuccess(historyId: string, analysis: AnalysisResult, fileName: string) {
  const { updateAdAnatomyHistory, getAdAnatomyHistoryById } = useBankStore.getState()
  const current = getAdAnatomyHistoryById(historyId)
  if (!current) return // row was deleted while we were polling
  const adTitle = analysis.adTitle?.trim() || deriveFallbackTitle(fileName)
  // Keep `uploadedRef` so the results view can play back the source. It's
  // local-only (saveAsset is called with skipCloud), and a mount-time TTL
  // sweep in AdAnatomy.tsx evicts it after 14 days.
  await updateAdAnatomyHistory(historyId, {
    status: 'complete',
    adTitle,
    result: analysis,
    taskId: undefined,
  })
}

async function applyFailure(historyId: string, err: unknown) {
  const { updateAdAnatomyHistory, getAdAnatomyHistoryById } = useBankStore.getState()
  const current = getAdAnatomyHistoryById(historyId)
  if (!current) return
  const errorMessage = err instanceof Error ? err.message : 'Analysis failed.'
  await updateAdAnatomyHistory(historyId, {
    status: 'error',
    errorMessage,
    uploadedRef: undefined,
    taskId: undefined,
  })
  if (current.uploadedRef) {
    deleteAsset(current.uploadedRef).catch(() => {})
  }
}

// Enqueue a new analysis. History row should already be in the bank with
// status: 'analyzing' and uploadedRef pointing at the source asset.
export function enqueueAnalysis(historyId: string, file: File): void {
  queue.push(async () => {
    const { updateAdAnatomyHistory, getAdAnatomyHistoryById } = useBankStore.getState()

    // Bail if the user deleted the row before we got a slot.
    if (!getAdAnatomyHistoryById(historyId)) return

    // Best-effort thumbnail capture — never blocks the analysis.
    try {
      const frame = await captureFirstFrame(file)
      const thumbnailRef = await saveAsset(frame, frame.type || 'image/jpeg')
      if (getAdAnatomyHistoryById(historyId)) {
        await updateAdAnatomyHistory(historyId, { thumbnailRef })
      } else {
        deleteAsset(thumbnailRef).catch(() => {})
      }
    } catch (e) {
      console.warn('[ad-anatomy] thumbnail capture failed', e)
    }

    // Try the createTask transport first; if kie's chat endpoint doesn't
    // support it for this model, fall back to streaming.
    try {
      const outcome = await startAnalysisTask(file)
      if (!getAdAnatomyHistoryById(historyId)) return

      if (outcome.kind === 'task') {
        await updateAdAnatomyHistory(historyId, { taskId: outcome.taskId })
        const analysis = await pollAnalysisTask(outcome.taskId)
        await applySuccess(historyId, analysis, file.name)
      } else {
        // Streaming fallback — can't resume across refresh.
        const analysis = await streamAnalysisFallback(file)
        await applySuccess(historyId, analysis, file.name)
      }
    } catch (err) {
      await applyFailure(historyId, err)
    }
  })
  pump()
}

// Resume polling for a row whose taskId we already have. Used by the mount-
// time reconciler after a refresh. No thumbnail capture, no source file.
export function resumeAnalysisTask(historyId: string, taskId: string, fileName: string): void {
  queue.push(async () => {
    const { getAdAnatomyHistoryById } = useBankStore.getState()
    if (!getAdAnatomyHistoryById(historyId)) return
    try {
      const analysis = await pollAnalysisTask(taskId)
      await applySuccess(historyId, analysis, fileName)
    } catch (err) {
      await applyFailure(historyId, err)
    }
  })
  pump()
}

// Exposed for debugging / verification only.
export function _debugRunningCount(): number {
  return running
}
