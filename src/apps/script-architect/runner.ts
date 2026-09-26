// The Scripts runner: a source ad or a brief → takes in `scriptHistory`.
// Scripts' Generate calls it, and Flow's Scripts block will call the same
// functions — see utils/blockRunner.ts.
//
// A run is several chat calls at once, and `start` does the whole job — it
// resolves with the takes — while `finish` only writes the row. Where the
// writer model has a job route each call is a kie TASK (services/
// scriptCalls.ts), and `start`'s `hooks.onTaskId` hands every taskId out the
// moment it exists, so the caller can persist it and `resumeScriptRun` can
// pick the run back up after a reload. A model with no job route is streamed
// and a reload still loses that run; the caller hears about no taskId for it.

import type {
  EditableProductContext,
  GenerateScriptInput,
  GeneratedScript,
  HookCategoryChoice,
  HookCount,
  RemixLength,
  ScriptMode,
  VariationCount,
  WriteFormat,
  WriteLength,
  WriteStyle,
} from './types'
import { generateScript } from './services/generateScript'
import { liveCalls, resumedCalls, type ScriptSlot, type TaskHooks } from './services/scriptCalls'
import type { Provenance, ScriptHistoryItem } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'
import { resolveScriptModel } from '../../stores/settingsStore'
import { replayRun } from '../../stores/recordingStore'
import { humanizeError } from '../../utils/friendlyError'
import { refuseWhileRecording, withProvenance, type BlockRunner, type RunContext } from '../../utils/blockRunner'

// Write New's brief is optional: an empty one hands the model creative
// license rather than blocking generation (avoids decision paralysis for
// members who don't know what to write).
const OPEN_BRIEF = "I'm open to seeing what you can come up with."

export interface ScriptRunInput {
  // The id the finished history row takes. Scripts mints it before the call:
  // it names the in-progress card in History and the row the takes land in,
  // so the card never changes identity under the member watching it.
  id?: string
  // The pipeline, already resolved — a detected scene blueprint is
  // 'reverse-engineer' unless the member forced a plain remix.
  mode: ScriptMode
  // The remix or blueprint source. Unused by Write New.
  source: string
  // Write New's brief, exactly as typed (an empty one runs as an open brief).
  brief: string
  writeStyle: WriteStyle
  writeFormat: WriteFormat
  writeLength: WriteLength
  // 'default' keeps the source ad's own length.
  remixLength: RemixLength
  hookCategory: HookCategoryChoice
  hookCount: HookCount
  variationCount: VariationCount
  productId: string | null
  productName?: string
  productContext: EditableProductContext | null
  additionalContext: string
}

// A finished run waiting for its row: the inputs the row restores the left
// panel from, and what came back.
export interface ScriptTask {
  id: string
  input: ScriptRunInput
  result: GeneratedScript
  provenance?: Provenance
}

// What the service is handed for a run's inputs. Shared by a live start and a
// resume, so a resumed run rebuilds exactly the plan the live one fired.
function serviceInput(input: ScriptRunInput): GenerateScriptInput {
  return {
    mode: input.mode,
    // Route the source into the field the resolved pipeline reads.
    winningTranscript: input.mode === 'remix' ? input.source : '',
    reversePrompt: input.mode === 'reverse-engineer' ? input.source : '',
    brief: input.mode === 'write' && !input.brief.trim() ? OPEN_BRIEF : input.brief,
    writeStyle: input.writeStyle,
    writeFormat: input.writeFormat,
    writeLength: input.writeLength,
    // Omitted is what tells the remix to keep the source ad's own length.
    remixLength: input.remixLength === 'default' ? undefined : input.remixLength,
    hookCategory: input.hookCategory,
    hookCount: input.hookCount,
    variationCount: input.variationCount,
    productId: input.productId,
    productName: input.productName,
    productContext: input.productContext,
    additionalContext: input.additionalContext,
  }
}

/**
 * Pick up a run whose calls are already kie tasks — started by an earlier page
 * load, or left behind by a poll that ran out of time — and wait for it to
 * finish. Nothing is submitted: a slot with no task (it was streamed, or its
 * task died) is simply missing from the takes, and the run only fails when
 * every take is. The caller writes the row with `scriptRunner.finish` as usual.
 */
export async function resumeScriptRun(
  input: ScriptRunInput,
  taskIds: Partial<Record<ScriptSlot, string>>,
  ctx?: Pick<RunContext, 'provenance'>,
  hooks?: TaskHooks,
): Promise<ScriptTask> {
  const result = await generateScript(serviceInput(input), resumedCalls(taskIds, hooks))
  return { id: input.id ?? crypto.randomUUID(), input, result, provenance: ctx?.provenance }
}

export const scriptRunner = {
  // A script is billed on tokens it hasn't written yet, and the Generate
  // button prints no price for it; neither does this.
  estimate() {
    return null
  },

  // `hooks` is Scripts' own third argument, not part of the shared runner
  // contract: it is how a caller that can persist a taskId hears about one.
  // Flow's block passes none, so its runs poll a task but can't resume it.
  async start(input: ScriptRunInput, ctx?: RunContext, hooks?: TaskHooks) {
    refuseWhileRecording()
    const result = await generateScript(serviceInput(input), liveCalls(resolveScriptModel('script-architect'), hooks))
    return { id: input.id ?? crypto.randomUUID(), input, result, provenance: ctx?.provenance }
  },

  // Everything the left panel needs to be put back from this row is on it,
  // as typed — the raw brief, not the open-brief stand-in; 'default', not an
  // omitted length.
  async finish(task) {
    const { input, result } = task
    const row = withProvenance<ScriptHistoryItem>({
      id: task.id,
      mode: input.mode,
      variations: result.variations,
      inputSummary: (input.mode === 'write' ? input.brief : input.source).slice(0, 200),
      linkedProductId: input.productId ?? undefined,
      productName: input.productName,
      winningTranscript: input.mode === 'remix' ? input.source : '',
      reversePrompt: input.mode === 'reverse-engineer' ? input.source : '',
      additionalContext: input.additionalContext,
      brief: input.brief,
      writeStyle: input.writeStyle,
      writeFormat: input.writeFormat,
      writeLength: input.writeLength,
      remixLength: input.remixLength,
      hookCategory: input.hookCategory,
      hookCount: input.hookCount,
      variationCount: input.variationCount,
      remixAngles: result.angles,
      voiceProfile: result.voiceProfile,
      createdAt: Date.now(),
    }, task.provenance)
    await useBankStore.getState().addScriptHistory(row)
    return row
  },

  replay(_input, opts?) {
    return replayRun({ rows: () => useBankStore.getState().scriptHistory, prefix: 'script', extraMs: opts?.extraMs })
  },

  describeError(err) {
    return humanizeError(err, 'Script generation failed. Check your API key and try again.')
  },
} satisfies BlockRunner<ScriptRunInput, ScriptTask, ScriptHistoryItem>
