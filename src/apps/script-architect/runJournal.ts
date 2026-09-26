// The Scripts runs still being written, kept where a reload can find them.
//
// A run is an in-progress card in History from the press (see PendingScriptRun
// in types.ts), but that card lived in memory only, so a refresh mid-write
// dropped the run without a word — kie finished the takes and billed for them,
// and nothing ever collected them. Each run is now journalled at the press with
// everything needed to finish it: the card, the inputs its row restores the
// panel from, its lineage, and — as each call reaches kie — the taskId writing
// it (`services/scriptCalls.ts`). Opening Scripts after a reload re-attaches the
// polls, and the takes land in the same card as if nothing had happened.
//
// Why a journal and not the History row itself, which is what B-Roll's
// storyboard does: a Scripts row is FINISHED work by contract. It carries no
// status field, it counts into the usage ledger the moment it is added, and
// Flow and the Dashboard both read `scriptHistory` as finished takes — a row
// with none in it would be a blank card in each. The journal keeps that
// contract whole; the row is still written once, when the takes land.
//
// localStorage, synchronously, because the taskId write is the entire resume
// story and a reload can land a second after the press. Under the draft prefix
// on purpose: the auth store wipes every `ai-ugc-lab:draft*` key when the
// signed-in member changes, so one member's run can never land in the next
// member's History on a shared browser.

import type { Provenance } from '../../stores/types'
import type { PendingScriptRun } from './types'
import type { ScriptRunInput } from './runner'
// Type-only: the journal is read on mount and in tests, and the transport
// module pulls the whole kie client and the stores in behind it.
import type { ScriptSlot } from './services/scriptCalls'

const KEY = 'ai-ugc-lab:draft:script-architect:runs-in-flight'

// kie keeps a task's result for 3 days. A run older than that has nothing left
// to collect, so it is dropped rather than polled.
export const RESUMABLE_TTL_MS = 3 * 24 * 60 * 60 * 1000

export interface JournaledRun {
  run: PendingScriptRun
  input: ScriptRunInput
  provenance?: Provenance
  // Slot → the kie task writing it. A slot missing here was streamed (the
  // writer model has no job route) or its task died, and a reload can't get it
  // back. A run with no TAKE left here is unresumable.
  taskIds: Partial<Record<ScriptSlot, string>>
}

function isEntry(v: unknown): v is JournaledRun {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<JournaledRun>
  return !!e.run?.id && typeof e.run.startedAt === 'number' && !!e.input && typeof e.taskIds === 'object'
}

function read(): JournaledRun[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

// A failed write (quota, a private window) costs only the resume: the run still
// writes and lands in this tab, exactly as every run did before the journal.
function write(entries: JournaledRun[]): void {
  try {
    if (entries.length > 0) localStorage.setItem(KEY, JSON.stringify(entries))
    else localStorage.removeItem(KEY)
  } catch {
    /* see above */
  }
}

/** Every journalled run, newest first. */
export function journaledRuns(): JournaledRun[] {
  return read()
}

export function journalRun(entry: JournaledRun): void {
  write([entry, ...read().filter((e) => e.run.id !== entry.run.id)])
}

export function journalTaskId(runId: string, slot: ScriptSlot, taskId: string): void {
  write(read().map((e) => (e.run.id === runId ? { ...e, taskIds: { ...e.taskIds, [slot]: taskId } } : e)))
}

export function unjournalTask(runId: string, slot: ScriptSlot): void {
  write(read().map((e) => {
    if (e.run.id !== runId) return e
    const taskIds = { ...e.taskIds }
    delete taskIds[slot]
    return { ...e, taskIds }
  }))
}

/** Drops the run. False when it was already gone — another tab landed it. */
export function unjournalRun(runId: string): boolean {
  const entries = read()
  const next = entries.filter((e) => e.run.id !== runId)
  if (next.length === entries.length) return false
  write(next)
  return true
}

export function isJournaled(runId: string): boolean {
  return read().some((e) => e.run.id === runId)
}

/** Whether any take of the run is still a kie task something can wait on. */
export function hasLiveTakes(entry: Pick<JournaledRun, 'taskIds'>): boolean {
  return Object.entries(entry.taskIds).some(([slot, taskId]) => slot.startsWith('take:') && !!taskId)
}

// The runs this tab is driving right now. Module-level so a StrictMode
// double-mount, or the mount-time resume meeting a run this tab fired a moment
// earlier, can't poll one run twice and write its row twice.
const claimed = new Set<string>()

export function claimRun(runId: string): boolean {
  if (claimed.has(runId)) return false
  claimed.add(runId)
  return true
}

export function releaseRun(runId: string): void {
  claimed.delete(runId)
}

// Being driven by this page already — by an earlier mount of Scripts, say, if
// its error boundary remounted the app mid-write. That drive lands the run.
export function isClaimed(runId: string): boolean {
  return claimed.has(runId)
}
