// Picking a Flow run back up after a reload, from the app shell — so a run
// resumes whichever app the page lands on, not only once Flow is opened.
//
// This file is imported by App.tsx and stays in the startup bundle, so it
// imports nothing: it reads the run store's one localStorage key and, only
// when a run was left going, fetches Flow's chunk to resume it.

const RUNS_KEY = 'ai-ugc-lab:draft:flow:runs'

export function hasFlowRunsToResume(): boolean {
  try {
    const raw = localStorage.getItem(RUNS_KEY)
    if (!raw) return false
    const runs = JSON.parse(raw) as Record<string, { status?: string }>
    return Object.values(runs).some((r) => r?.status === 'running')
  } catch {
    return false
  }
}

export function resumeFlowRuns(): void {
  void import('./run/runtime').then((m) => m.resumeRuns())
}
