import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimRun,
  hasLiveTakes,
  isClaimed,
  isJournaled,
  journalRun,
  journalTaskId,
  journaledRuns,
  releaseRun,
  unjournalRun,
  unjournalTask,
  type JournaledRun,
} from './runJournal'

// The tests run in node, so the journal gets a Map where the browser's
// localStorage would be.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  })
})
afterEach(() => vi.unstubAllGlobals())

function entry(id: string): JournaledRun {
  return {
    run: {
      id,
      mode: 'write',
      writeStyle: 'pas',
      writeFormat: 'script',
      hookCategory: 'auto',
      hookCount: 10,
      variationCount: 3,
      inputSummary: 'a brief',
      startedAt: 1,
    },
    input: {
      id,
      mode: 'write',
      source: '',
      brief: 'a brief',
      writeStyle: 'pas',
      writeFormat: 'script',
      writeLength: 15,
      remixLength: 'default',
      hookCategory: 'auto',
      hookCount: 10,
      variationCount: 3,
      productId: null,
      productContext: null,
      additionalContext: '',
    },
    taskIds: {},
  }
}

describe('the Scripts run journal', () => {
  it('holds a run from the press, newest first, and gives the taskIds back', () => {
    journalRun(entry('a'))
    journalRun(entry('b'))
    journalTaskId('a', 'take:0', 'task-a0')
    journalTaskId('a', 'voice', 'task-av')
    const runs = journaledRuns()
    expect(runs.map((e) => e.run.id)).toEqual(['b', 'a'])
    expect(runs[1].taskIds).toEqual({ 'take:0': 'task-a0', voice: 'task-av' })
  })

  it('calls a run resumable only while one of its TAKES is a task', () => {
    expect(hasLiveTakes({ taskIds: {} })).toBe(false)
    // The voice brief alone lands no script — it rides beside the takes.
    expect(hasLiveTakes({ taskIds: { voice: 'task-v' } })).toBe(false)
    expect(hasLiveTakes({ taskIds: { 'take:2': 'task-2' } })).toBe(true)
  })

  it('drops a dead task without touching the rest of the run', () => {
    journalRun(entry('a'))
    journalTaskId('a', 'take:0', 't0')
    journalTaskId('a', 'take:1', 't1')
    unjournalTask('a', 'take:0')
    expect(journaledRuns()[0].taskIds).toEqual({ 'take:1': 't1' })
  })

  it('says whether the run was still there when it is dropped — the two-tab guard', () => {
    journalRun(entry('a'))
    expect(isJournaled('a')).toBe(true)
    expect(unjournalRun('a')).toBe(true)
    expect(unjournalRun('a')).toBe(false)
    expect(isJournaled('a')).toBe(false)
  })

  it('reads a corrupt journal as empty rather than throwing on mount', () => {
    localStorage.setItem('ai-ugc-lab:draft:script-architect:runs-in-flight', '{not json')
    expect(journaledRuns()).toEqual([])
    localStorage.setItem('ai-ugc-lab:draft:script-architect:runs-in-flight', JSON.stringify([{ nope: 1 }, entry('ok')]))
    expect(journaledRuns().map((e) => e.run.id)).toEqual(['ok'])
  })

  it('lets one run be driven once per page', () => {
    expect(claimRun('x')).toBe(true)
    expect(claimRun('x')).toBe(false)
    expect(isClaimed('x')).toBe(true)
    releaseRun('x')
    expect(isClaimed('x')).toBe(false)
    expect(claimRun('x')).toBe(true)
    releaseRun('x')
  })
})
