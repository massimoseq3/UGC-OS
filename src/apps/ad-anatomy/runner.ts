// The Ad Analyzer runner: an ad (a video or an image file) → a breakdown in
// `adAnatomyHistory`. The drop zone and the Outliers handoff analyze through
// it, and Flow's Ad Analyzer block will call the same functions — see
// utils/blockRunner.ts.
//
// The history row IS the in-flight record here, as it always has been: it is
// written 'analyzing' before anything is sent, the module-level queue
// (services/analysisQueue.ts) runs the job and writes the result onto it, and
// a reload re-attaches through the row's taskId. So `start` writes the row and
// queues it, and `finish` waits for the queue to settle that row.

import type { AdAnatomyHistoryItem } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'
import { replayRun } from '../../stores/recordingStore'
import { saveAsset } from '../../utils/assetStore'
import { FriendlyError, humanizeError } from '../../utils/friendlyError'
import { refuseWhileRecording, withProvenance, type BlockRunner } from '../../utils/blockRunner'
import { enqueueAnalysis } from './services/analysisQueue'
import { estimateAnalysisCredits } from './services/analysisCost'

export interface AdAnalysisInput {
  file: File
  // How long the ad runs, when it's known — it's what the call is priced on.
  durationSeconds?: number
}

export interface AdAnalysisTask {
  rowId: string
}

// Resolves with the row once the queue has written its result, and rejects
// with the row's own friendly error when it failed — or when the member
// deleted it mid-run.
function waitForAnalysis(rowId: string, signal?: AbortSignal): Promise<AdAnatomyHistoryItem> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    const settle = (): boolean => {
      const row = useBankStore.getState().getAdAnatomyHistoryById(rowId)
      if (!row) {
        reject(new FriendlyError('That analysis was deleted before it finished.'))
      } else if (row.status === 'complete') {
        resolve(row)
      } else if (row.status === 'error') {
        reject(new FriendlyError(row.errorMessage || 'Analysis failed.'))
      } else {
        return false
      }
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
      return true
    }
    const onAbort = () => {
      unsubscribe()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (settle()) return
    unsubscribe = useBankStore.subscribe(() => { settle() })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export const adAnalysisRunner = {
  estimate(input) {
    return estimateAnalysisCredits(input.durationSeconds ?? Number.NaN)
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    const { file } = input
    // The source ad is local-only: kept in IndexedDB for playback, never
    // mirrored to R2, and evicted by the Ad Analyzer's 14-day sweep.
    const uploadedRef = await saveAsset(file, file.type, { skipCloud: true })
    const row = withProvenance<AdAnatomyHistoryItem>({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: 'analyzing',
      adTitle: '',
      fileName: file.name,
      mediaKind: file.type.startsWith('image/') ? 'image' : 'video',
      uploadedRef,
    }, ctx?.provenance)
    await useBankStore.getState().addAdAnatomyHistory(row)
    enqueueAnalysis(row.id, file)
    return { rowId: row.id }
  },

  // Waits on the row; it never re-attaches a poll itself. A row left
  // 'analyzing' by an earlier page load is resumed by whoever owns it — the
  // Ad Analyzer's mount pass for its own rows.
  finish(task, ctx?) {
    return waitForAnalysis(task.rowId, ctx?.signal)
  },

  replay(_input, opts?) {
    return replayRun({ rows: () => useBankStore.getState().adAnatomyHistory, prefix: 'ad', extraMs: opts?.extraMs })
  },

  describeError(err) {
    return humanizeError(err, 'Analysis failed.')
  },
} satisfies BlockRunner<AdAnalysisInput, AdAnalysisTask, AdAnatomyHistoryItem>
