// Usage-ledger helpers for the Dashboard: day keys, time-saved assumptions,
// and the streak/savings roll-up computed from `usageDays` (see UsageDay in
// stores/types.ts). The ledger itself is written by bankStore.recordUsage.

import type { UsageDay, UsageKind } from '../stores/types'

const DAY_MS = 86_400_000

/** Local-calendar day key ('2026-07-09') for a timestamp. */
export function usageDayId(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Midnight (local) of the day a 'YYYY-MM-DD' key names. */
export function usageDayStart(id: string): number {
  const [y, m, d] = id.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// Estimated minutes of manual work one generation replaces, per kind. These
// are deliberately conservative "if you produced this asset the traditional
// way" figures — shooting a b-roll clip, writing a script from scratch,
// recording VO takes — not render-time comparisons. Tune here.
export const MINUTES_SAVED_PER_GEN: Record<UsageKind, number> = {
  video: 45,      // shoot one UGC b-roll clip: setup, takes, transfer, trim
  image: 15,      // stage + shoot + pick one usable still
  voice: 15,      // record, retake, and clean up a VO line
  music: 30,      // hunt down + license a usable track
  script: 45,     // write an ad script (a run yields up to 3 variations)
  character: 20,  // source/casting a creator photo you're allowed to use
  analysis: 25,   // manually transcribe + break down a reference ad
}

// On top of the per-kind figure: the tool-hopping tax the unified workspace
// removes. Without shared banks, each generation means re-uploading the
// product/character refs into another tab, re-writing context, and moving the
// output between tools — a few minutes of switching cost per asset.
export const TASK_SWITCH_MINUTES_PER_GEN = 4

export const ALL_USAGE_KINDS: UsageKind[] = ['video', 'image', 'voice', 'script', 'character', 'analysis', 'music']

export interface UsageMetrics {
  totalGenerations: number
  countsByKind: Record<UsageKind, number>
  minutesSaved: number
  creditsSpent: number
  /** Estimated USD actually spent via kie.ai. */
  kieUsd: number
  /** Estimated USD the same generations would cost on official provider APIs. */
  officialUsd: number
  /** officialUsd − kieUsd, floored at 0. */
  usdSaved: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  /** Day key of the earliest activity, or null when the ledger is empty. */
  firstActiveDay: string | null
  /** Rolling last-7-days slice (including today) — the "this week" deltas. */
  minutesSavedLast7d: number
  usdSavedLast7d: number
}

function dayTotal(day: UsageDay): number {
  return Object.values(day.counts).reduce((sum, n) => sum + (n ?? 0), 0)
}

export function computeUsageMetrics(days: UsageDay[], creditsToUsd: (credits: number) => number): UsageMetrics {
  const countsByKind = Object.fromEntries(ALL_USAGE_KINDS.map((k) => [k, 0])) as Record<UsageKind, number>
  let minutesSaved = 0
  let creditsSpent = 0
  let officialUsd = 0
  let totalGenerations = 0
  let minutesSavedLast7d = 0
  let usdSavedLast7d = 0

  // Rolling window: today plus the six days before it, by local day key.
  const weekStart = usageDayStart(usageDayId(Date.now())) - 6 * DAY_MS

  const activeIds: number[] = []
  for (const day of days) {
    if (dayTotal(day) === 0) continue
    const dayStart = usageDayStart(day.id)
    activeIds.push(dayStart)
    creditsSpent += day.credits
    officialUsd += day.officialUsd
    const inWindow = dayStart >= weekStart
    if (inWindow) usdSavedLast7d += Math.max(0, day.officialUsd - creditsToUsd(day.credits))
    for (const [kind, n] of Object.entries(day.counts) as Array<[UsageKind, number | undefined]>) {
      const count = n ?? 0
      const minutes = ((MINUTES_SAVED_PER_GEN[kind] ?? 0) + TASK_SWITCH_MINUTES_PER_GEN) * count
      countsByKind[kind] = (countsByKind[kind] ?? 0) + count
      minutesSaved += minutes
      if (inWindow) minutesSavedLast7d += minutes
      totalGenerations += count
    }
  }
  activeIds.sort((a, b) => a - b)

  // Longest run of consecutive calendar days, and the current run. The current
  // streak stays alive through "today has no activity yet" — it only breaks
  // once a full day passes with nothing generated.
  let longestStreak = 0
  let run = 0
  let prev: number | null = null
  for (const ts of activeIds) {
    run = prev !== null && ts - prev === DAY_MS ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    prev = ts
  }
  const today = usageDayStart(usageDayId(Date.now()))
  const last = activeIds[activeIds.length - 1]
  const currentStreak = last === today || last === today - DAY_MS ? run : 0

  const kieUsd = creditsToUsd(creditsSpent)
  return {
    totalGenerations,
    countsByKind,
    minutesSaved,
    creditsSpent,
    kieUsd,
    officialUsd,
    usdSaved: Math.max(0, officialUsd - kieUsd),
    activeDays: activeIds.length,
    currentStreak,
    longestStreak,
    firstActiveDay: activeIds.length ? usageDayId(activeIds[0]) : null,
    minutesSavedLast7d,
    usdSavedLast7d,
  }
}
