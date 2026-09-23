// The Characters runner: a form profile (or an edit instruction on an existing
// portrait) → a character in `characterHistory`. The form's Generate, the
// gallery's Make Sheet and the edit modal all launch through it, and Flow's
// Characters block will call the same functions — see utils/blockRunner.ts.

import type { CharacterProfile, InFlightCharacterGen, LaunchGenOptions } from './types'
import { createEmptyProfile, flattenDna, profileFromFlat } from './types'
import {
  startCharacterTask,
  startCharacterEditTask,
  finishCharacterTask,
  resolveImageToImageModel,
} from './services/generateCharacter'
import { analyzeImage } from './services/analyzeImage'
import type { CharacterHistoryItem } from '../../stores/types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import { replayWait, revealNext } from '../../stores/recordingStore'
import { estimateCredits, getDefaultModel, type AspectRatio } from '../../utils/models'
import { humanizeError } from '../../utils/friendlyError'
import { lineageOf, refuseWhileRecording, withProvenance, type BlockRunner } from '../../utils/blockRunner'

export type CharacterRunInput = LaunchGenOptions & {
  // The id the finished history row takes. Characters passes its in-flight
  // tile's id, so anything anchored to the tile (the editor opened by clicking
  // it) resolves to the finished row the moment it lands. Minted when absent.
  id?: string
  // The image model to draw with. Absent means the app's own pick; a Flow
  // block will carry its own. An edit, or a sheet off a reference portrait,
  // swaps it for an image-to-image sibling either way.
  modelId?: string
}

// A submitted character: the persisted in-flight entry minus its start time,
// with the taskId it now has. `modelId` is the model that actually runs,
// after any image-to-image swap, so the row names the right one.
export type CharacterTask = Omit<InFlightCharacterGen, 'startedAt' | 'taskId'> & { taskId: string }

// The image model a run draws with, before and after the reference swap.
export function characterModelFor(input: Pick<CharacterRunInput, 'modelId' | 'edit' | 'referenceUrl'>): string {
  const configured = input.modelId
    ?? useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
    ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
    ?? 'unknown'
  return input.edit || input.referenceUrl ? resolveImageToImageModel(configured) : configured
}

// A reference photo → the whole form, read by a vision model. It has no task
// and writes no history row — the reference library keeps the result — so it
// sits beside the runner rather than inside it.
export async function extractCharacterProfile(file: File): Promise<CharacterProfile> {
  return profileFromFlat(flattenDna(await analyzeImage(file)))
}

export const characterRunner = {
  // One image; the Generate bar multiplies by the batch count.
  estimate(input) {
    return estimateCredits(characterModelFor(input), { imageCount: 1, resolution: input.resolution })
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    const signal = ctx?.signal
    const started = input.edit
      ? await startCharacterEditTask({
          prompt: input.edit.instruction,
          baseImageRef: input.edit.baseImageRef,
          referenceRefs: input.edit.referenceUrls,
          aspectRatio: input.aspect as AspectRatio,
          resolution: input.resolution,
          modelIdOverride: input.modelId,
          signal,
        })
      : await startCharacterTask(
          input.profile,
          input.modelId,
          input.resolution,
          signal,
          input.kind,
          input.aspect,
          input.referenceUrl,
          { direction: input.direction, extraReferenceUrls: input.extraReferenceUrls },
        )
    return {
      id: input.id ?? crypto.randomUUID(),
      taskId: started.taskId,
      modelId: started.modelId,
      aspectRatio: input.aspect,
      resolution: input.resolution,
      kind: input.kind,
      profile: input.profile,
      lineageId: input.lineageId,
      styleName: input.styleName,
      batchId: input.batchId,
      batchIndex: input.batchIndex,
      provenance: { parents: lineageOf(ctx?.provenance?.parents, input.parents) },
    }
  },

  async finish(task, ctx?) {
    const assetId = await finishCharacterTask(task.taskId, task.modelId, ctx?.signal)
    const row = withProvenance<CharacterHistoryItem>({
      // The GENERATION's id, not a fresh one — see CharacterRunInput.id.
      id: task.id,
      imageRef: assetId,
      profile: (task.profile as CharacterProfile | undefined) ?? createEmptyProfile(),
      modelId: task.modelId,
      aspectRatio: task.aspectRatio,
      resolution: task.resolution,
      kind: task.kind ?? 'portrait',
      // Derived gens (edit modal) rejoin their source's lineage strip.
      lineageId: task.lineageId,
      styleName: task.styleName,
      // Carried onto the finished row so a batch stays one group on the
      // Single stage after its members stop being in-flight entries.
      batchId: task.batchId,
      batchIndex: task.batchIndex,
      createdAt: Date.now(),
    }, task.provenance)
    await useBankStore.getState().addCharacterHistory(row)
    return row
  },

  // A cancel during the wait reveals nothing — the tile's Cancel works on a
  // fake run exactly as on a real one.
  async replay(_input, opts?) {
    await replayWait(opts?.extraMs)
    if (opts?.signal?.aborted) return null
    return revealNext(useBankStore.getState().characterHistory, 'character')
  },

  describeError(err) {
    return humanizeError(err, 'Image generation failed. Check your API key and try again.')
  },
} satisfies BlockRunner<CharacterRunInput, CharacterTask, CharacterHistoryItem>
