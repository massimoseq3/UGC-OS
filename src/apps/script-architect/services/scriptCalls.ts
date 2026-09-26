// How a Scripts call reaches kie — as a JOB wherever the writer model has a job
// route, so a run survives a page reload.
//
// A run is several chat calls at once (a take per variation, plus the remix
// voice brief), and they used to be streamed completions: a request that dies
// with the page, after kie has already billed for the tokens. kie's task
// transport (createTask → recordInfo) hands back a taskId instead, which the
// caller persists (`onTaskId`) so the poll can be re-attached on the next load
// — the shape B-Roll's storyboard has run on since August 2026
// (broll-studio/services/storyboardRun.ts), and the one the root CLAUDE.md
// prescribes for a chat call that must survive a reload.
//
// A model with no job route 400s at createTask and is STREAMED instead, exactly
// as before. That run is honest but unresumable: nothing is persisted for it,
// so a reload reports it lost rather than leaving it writing forever. The
// console says which path ran.
//
// The run functions in generateScript.ts never see any of this. Each takes a
// `ChatFn` — messages in, the model's text out — and the caller decides what
// stands behind it: a live call (`liveCalls`), or the poll of a task an earlier
// page load already started (`resumedCalls`). Resuming therefore rebuilds the
// same plan and post-processes the answer with the same code a live run does;
// only the network half differs.

import {
  createTask,
  pollTask,
  extractChatTaskText,
  chatTaskHitTokenLimit,
  kieChatCompletions,
  isPollTimeout,
  TruncatedResponseError,
  CHAT_POLL_ATTEMPTS,
  LONG_CHAT_TIMEOUT_MS,
  type ChatMessage,
} from '../../../utils/kie'
import { getChatTarget, getModel } from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { FriendlyError } from '../../../utils/friendlyError'

export type ChatFn = (messages: ChatMessage[]) => Promise<string>

// One call of a run. `take:N` is the Nth take (a hooks pack and a scene
// rewrite are a single `take:0`); `voice` is the remix run's voice brief.
export type ScriptSlot = `take:${number}` | 'voice'

export const takeSlot = (take: number): ScriptSlot => `take:${take}`

// What stands behind every call of one run.
export interface ScriptCalls {
  chatFor(slot: ScriptSlot): ChatFn
}

export interface TaskHooks {
  // A call is running as a kie job. Awaited BEFORE the poll starts: that write
  // is the entire resume story, and the window it closes is the one where a
  // reload lands seconds after the press. Never called for a streamed call.
  onTaskId?: (slot: ScriptSlot, taskId: string) => unknown
  // A held task will never answer — kie failed it, or what it answered can't be
  // used. Dropped, so a Retry re-runs that call instead of resuming a dead one.
  // A poll that merely ran out of time is NOT dead: kie may still finish it.
  onTaskDead?: (slot: ScriptSlot) => void
}

// kie's job route names a model by its own slug: `chatSlug` where the registry
// carries one, else the registry id. A model with no job route simply 400s,
// which is the fallback path — nothing to configure, and nothing to keep in
// step. Same rule as B-Roll's storyboard.
function chatTaskModel(modelId: string): string {
  return getModel(modelId)?.chatSlug ?? modelId
}

// The taskId, or null when this model has to be streamed instead.
async function startChatTask(apiKey: string, modelId: string, messages: ChatMessage[]): Promise<string | null> {
  const taskModel = chatTaskModel(modelId)
  try {
    const taskId = await createTask(apiKey, taskModel, { messages, stream: false })
    if (!taskId) {
      console.warn('[scripts] createTask returned no taskId, streaming instead')
      return null
    }
    console.info(`[scripts] running as kie task ${taskId} (${taskModel}) — survives a reload`)
    return taskId
  } catch (err) {
    console.warn(`[scripts] no job route for ${taskModel}, streaming instead (this run will not survive a reload)`, err)
    return null
  }
}

// The finished task's text, held to the streaming transport's two rules: an
// answer cut off at the token limit throws `TruncatedResponseError` (a half
// script must never land as a whole one), and an unreadable record throws with
// the raw payload, since that's the only way a new result shape gets found.
async function pollChatTaskText(taskId: string): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId, { maxPollAttempts: CHAT_POLL_ATTEMPTS })
  const text = extractChatTaskText(record)
  if (!text) {
    throw new Error(`Script task ${taskId} succeeded but no text could be extracted. Raw resultJson: ${record.resultJson?.slice(0, 400)}`)
  }
  if (chatTaskHitTokenLimit(record)) throw new TruncatedResponseError(text)
  return text
}

async function pollSlot(slot: ScriptSlot, taskId: string, hooks: TaskHooks): Promise<string> {
  try {
    return await pollChatTaskText(taskId)
  } catch (err) {
    if (!isPollTimeout(err)) hooks.onTaskDead?.(slot)
    throw err
  }
}

/**
 * A live run on `modelId`. The FIRST call of the run asks kie whether the model
 * takes jobs at all; the rest wait for that answer rather than each firing a
 * createTask that 400s, which on a ten-take batch was ten rejected requests
 * queued through the submit gate ahead of the ten real ones.
 */
export function liveCalls(modelId: string, hooks: TaskHooks = {}): ScriptCalls {
  // Read up front so a missing key fails the run once, before any call starts.
  const apiKey = useSettingsStore.getState().getKieApiKey()
  let jobsRoute: Promise<boolean> | null = null
  return {
    chatFor: (slot) => async (messages) => {
      let taskId: string | null = null
      if (!jobsRoute) {
        const probe = startChatTask(apiKey, modelId, messages)
        jobsRoute = probe.then((id) => id !== null)
        taskId = await probe
      } else if (await jobsRoute) {
        taskId = await startChatTask(apiKey, modelId, messages)
      }
      if (taskId) {
        await hooks.onTaskId?.(slot, taskId)
        return pollSlot(slot, taskId, hooks)
      }
      return kieChatCompletions(apiKey, getChatTarget(modelId), messages, { timeoutMs: LONG_CHAT_TIMEOUT_MS })
    },
  }
}

// What a call a reload can't get back reports. It only ever shows when EVERY
// take was lost; one lost take out of three just lands the other two.
export const LOST_IN_RELOAD_MESSAGE =
  "This script was being written when the page reloaded, and the model writing it can't be picked back up. Generate it again."

/**
 * A run an earlier page load (or a failed poll) left holding kie tasks. Every
 * call polls its slot's task; a slot with none was streamed and is gone.
 */
export function resumedCalls(taskIds: Partial<Record<ScriptSlot, string>>, hooks: TaskHooks = {}): ScriptCalls {
  return {
    chatFor: (slot) => () => {
      const taskId = taskIds[slot]
      if (!taskId) return Promise.reject(new FriendlyError(LOST_IN_RELOAD_MESSAGE))
      return pollSlot(slot, taskId, hooks)
    },
  }
}
