// The Scripts runner: a source ad or a brief → takes in `scriptHistory`.
// Scripts' Generate calls it, and Flow's Scripts block will call the same
// functions — see utils/blockRunner.ts.
//
// Unlike the media runners there is no task to resume: a script is a set of
// streamed chat calls with no kie taskId behind them, so `start` does the
// whole job and `finish` only writes the row. A reload mid-write loses the
// run, as it always has.

import type {
  EditableProductContext,
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
import type { Provenance, ScriptHistoryItem } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'
import { replayRun } from '../../stores/recordingStore'
import { humanizeError } from '../../utils/friendlyError'
import { refuseWhileRecording, withProvenance, type BlockRunner } from '../../utils/blockRunner'

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

export const scriptRunner = {
  // A script is billed on tokens it hasn't written yet, and the Generate
  // button prints no price for it; neither does this.
  estimate() {
    return null
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    const result = await generateScript({
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
    })
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
