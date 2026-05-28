// Module-level analysis queue. Survives React unmounts (so a user switching
// to another app mid-bulk doesn't kill the in-flight requests), but does NOT
// survive a page refresh — kie.ai's chat-completions endpoint is a single
// streaming HTTP request that can't be resumed. AdAnatomy's mount-time
// reconciler flips any orphaned 'analyzing' rows to 'error'.

import { analyzeAd } from './analyzeAd'
import { captureFirstFrame } from '../utils/captureFirstFrame'
import { saveAsset, deleteAsset } from '../../../utils/assetStore'
import { useBankStore } from '../../../stores/bankStore'

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

// Enqueue an analysis. The history row should already be in the bank with
// status 'analyzing' and `uploadedRef` pointing at the source asset. The
// queue handles: first-frame capture → kie.ai call → bank updates → source
// asset cleanup.
export function enqueueAnalysis(historyId: string, file: File): void {
  queue.push(async () => {
    const { updateAdAnatomyHistory, getAdAnatomyHistoryById } = useBankStore.getState()

    // Bail if the user deleted the row before we got a slot.
    if (!getAdAnatomyHistoryById(historyId)) return

    // Best-effort thumbnail capture. Never blocks the analysis.
    try {
      const frame = await captureFirstFrame(file)
      const thumbnailRef = await saveAsset(frame, frame.type || 'image/jpeg')
      // Only stamp the thumbnail if the row is still around.
      if (getAdAnatomyHistoryById(historyId)) {
        await updateAdAnatomyHistory(historyId, { thumbnailRef })
      } else {
        // Row was deleted while we were capturing — clean up the orphan.
        deleteAsset(thumbnailRef).catch(() => {})
      }
    } catch (e) {
      console.warn('[ad-anatomy] thumbnail capture failed', e)
    }

    // The analysis itself.
    try {
      const analysis = await analyzeAd(file)

      // Check again — the user may have deleted while we were waiting.
      const current = getAdAnatomyHistoryById(historyId)
      if (!current) return

      const adTitle = analysis.adTitle?.trim() || deriveFallbackTitle(file.name)
      await updateAdAnatomyHistory(historyId, {
        status: 'complete',
        adTitle,
        result: analysis,
        uploadedRef: undefined,
      })
      // Drop the source asset — we've fulfilled the "we don't keep the
      // ad" promise from here on out.
      if (current.uploadedRef) {
        deleteAsset(current.uploadedRef).catch(() => {})
      }
    } catch (err) {
      const current = getAdAnatomyHistoryById(historyId)
      if (!current) return
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed.'
      await updateAdAnatomyHistory(historyId, {
        status: 'error',
        errorMessage,
        uploadedRef: undefined,
      })
      if (current.uploadedRef) {
        deleteAsset(current.uploadedRef).catch(() => {})
      }
    }
  })
  pump()
}

// Exposed for debugging / verification only. The cap is otherwise opaque.
export function _debugRunningCount(): number {
  return running
}
