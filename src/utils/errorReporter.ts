// Error reporting — tells the operator when something breaks for a member, so
// a bug reaches Admin → Errors without anyone having to write in or the
// operator having to run into it themselves.
//
// Three sources, one outbox:
//
//   crash  — AppErrorBoundary caught a pane falling over (reportCrash)
//   error  — window `error` / `unhandledrejection`: code that threw with
//            nothing to catch it
//   failed — every failure a member is SHOWN, heard through humanizeError's
//            listener, minus the rules marked `member` (no key, out of credits,
//            the content filter), which are the member's situation, not a bug
//
// What keeps it quiet and cheap:
//
//   • It never touches the UI and never throws. A reporter that could break
//     the page it is reporting on would be worse than none.
//   • Reports coalesce by fingerprint (utils/errorReport.ts): the same bug a
//     thousand times is one entry with a count, locally and in Postgres.
//   • Capture writes a per-user localStorage outbox, synchronously for a crash
//     (the member's next move is Reload, which would take an in-memory queue
//     with it) and on a short timer otherwise. Sending happens in the
//     background a few seconds later, in batches, with backoff — the same
//     local-first, eventually-sent shape as cloudSync's outbox.
//   • The outbox is keyed by user id and only ever sent while that same user
//     is signed in, so a shared browser can't file one member's errors under
//     the next member's name. Sign-out purges it (authStore's residue list).
//
// It does NOT report: local-only builds (nowhere to send), `vite dev` (the
// operator's own half-written code), Recording Mode (its fakes fail on
// purpose), or a member who switched it off in Settings → Account.

import { FriendlyError, onErrorShown, type ShownError } from './friendlyError'
import { BUILD_ID, isStaleChunkError } from './appVersion'
import { buildReport, isNoise, mergeReport, subtractSent, type ErrorReport, type ReportInput } from './errorReport'
import { ensureFreshSession, getSupabase, isCloudEnabled } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useErrorReportStore } from '../stores/errorReportStore'
import { isRecordingActive } from '../stores/recordingStore'

const OUTBOX_PREFIX = 'ugc-lab:error-outbox:'
// Distinct errors held for one member at once. Past this, a NEW error is
// dropped until the outbox drains.
const OUTBOX_MAX = 30
// Distinct errors one page load may report. A session that has thrown forty
// different things is broken in a way the first forty describe.
const SESSION_MAX = 40
// Reports per request. report_errors reads at most 25.
const BATCH = 20
// A burst (a batch of four generations failing together) goes out as one call.
const SEND_DELAY_MS = 5_000
// Stay out of the boot path: hydrate, the landing app and the orphan sweep all
// want the network first.
const BOOT_SEND_DELAY_MS = 10_000
const PERSIST_DELAY_MS = 500
const MAX_BACKOFF_MS = 10 * 60_000
// How many app opens the breadcrumb trail keeps.
const TRAIL_MAX = 6

const pageLoadedAt = Date.now()
const trail: Array<{ at: number; app: string }> = []
// Captured but not yet written to localStorage, per user id.
let pending = new Map<string, ErrorReport[]>()
const sessionFingerprints = new Set<string>()
// The same thrown object can be translated twice (a runner humanizes it, its
// caller humanizes the result again) or thrown on after being shown. The first
// report wins.
const seenErrors = new WeakSet<object>()
// Sentences already reported as what a member was shown. A caller that wraps
// one in a FriendlyError and throws it on (the Ad Analyzer's runner does) is
// passing the same failure along, not reporting a second one.
const shownSentences = new Set<string>()

let started = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let sendTimer: ReturnType<typeof setTimeout> | null = null
let sending = false
let backoffMs = 0
// report_errors isn't there (0027 hasn't run). Stop asking for this page load;
// the outbox keeps its reports for the next one.
let unavailable = false

function outboxKey(userId: string): string {
  return `${OUTBOX_PREFIX}${userId}`
}

function readOutbox(userId: string): ErrorReport[] {
  try {
    const raw = localStorage.getItem(outboxKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ErrorReport[]) : []
  } catch {
    return []
  }
}

function writeOutbox(userId: string, box: ErrorReport[]): void {
  try {
    if (box.length === 0) localStorage.removeItem(outboxKey(userId))
    else localStorage.setItem(outboxKey(userId), JSON.stringify(box))
  } catch (e) {
    // A full disk costs us this report, never the member anything.
    console.warn('[errorReports] could not save the outbox', e)
  }
}

// Fold whatever is pending into localStorage. Read-merge-write rather than
// overwrite, so a second tab's reports in the same outbox aren't clobbered.
function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (pending.size === 0) return
  const batches = pending
  pending = new Map()
  for (const [userId, reports] of batches) {
    let box = readOutbox(userId)
    for (const report of reports) box = mergeReport(box, report, OUTBOX_MAX)
    writeOutbox(userId, box)
  }
}

function schedulePersist(): void {
  if (!persistTimer) persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS)
}

function scheduleSend(delayMs: number): void {
  if (sendTimer || unavailable) return
  sendTimer = setTimeout(() => {
    sendTimer = null
    void send()
  }, delayMs)
}

function reportingAllowed(): boolean {
  return isCloudEnabled() && !import.meta.env.DEV && useErrorReportStore.getState().enabled
}

// The member's own keys, so `scrub` can take them out of any message that
// happens to echo one back.
function secrets(): string[] {
  const { kieApiKey, scrapeCreatorsKey } = useSettingsStore.getState()
  return [kieApiKey, scrapeCreatorsKey].map((k) => k.trim()).filter(Boolean)
}

function browserContext(now: number) {
  return {
    path: window.location.pathname.slice(0, 120),
    browser: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    online: navigator.onLine,
    session_s: Math.round((now - pageLoadedAt) / 1000),
    trail: trail.map((t): [string, number] => [t.app, Math.max(0, Math.round((now - t.at) / 1000))]),
  }
}

function capture(input: ReportInput): void {
  try {
    if (!reportingAllowed() || isRecordingActive()) return
    const userId = useAuthStore.getState().user?.id
    if (!userId) return

    const now = Date.now()
    const report = buildReport(input, {
      appId: useAppStore.getState().activeApp,
      buildId: BUILD_ID,
      secrets: secrets(),
      context: browserContext(now),
    })
    if (!sessionFingerprints.has(report.fingerprint)) {
      if (sessionFingerprints.size >= SESSION_MAX) return
      sessionFingerprints.add(report.fingerprint)
    }

    pending.set(userId, mergeReport(pending.get(userId) ?? [], report, OUTBOX_MAX))
    if (input.kind === 'crash') persistNow()
    else schedulePersist()
    scheduleSend(SEND_DELAY_MS)
  } catch (e) {
    console.warn('[errorReports] capture failed', e)
  }
}

// First report of a thrown object wins; a primitive can't be tracked and is
// simply reported.
function firstSighting(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true
  if (seenErrors.has(err)) return false
  seenErrors.add(err)
  return true
}

function describe(err: unknown): { name: string | null; message: string; stack: string | null } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack ?? null }
  if (typeof err === 'string') return { name: null, message: err, stack: null }
  if (err === undefined || err === null) return { name: null, message: '', stack: null }
  try {
    return { name: null, message: JSON.stringify(err).slice(0, 1000), stack: null }
  } catch {
    return { name: null, message: String(err), stack: null }
  }
}

function onShown({ err, shown, fallback, member }: ShownError): void {
  if (member || !firstSighting(err)) return
  if (err instanceof FriendlyError && shownSentences.has(err.message)) return
  if (shownSentences.size < 200) shownSentences.add(shown)
  const { name, message, stack } = describe(err)
  capture({ kind: 'failed', name, message: message || shown, stack, shown, operation: fallback })
}

function onWindowError(event: ErrorEvent): void {
  const err: unknown = event.error
  const described = err === undefined || err === null
    ? { name: null, message: event.message ?? '', stack: event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : null }
    : describe(err)
  if (isNoise(described.name, described.message, described.stack) || isStaleChunkError(err ?? described.message)) return
  if (!firstSighting(err)) return
  capture({ kind: 'error', ...described })
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason
  const described = describe(reason)
  if (isNoise(described.name, described.message, described.stack) || isStaleChunkError(reason)) return
  if (!firstSighting(reason)) return
  capture({ kind: 'error', ...described })
}

// Every way in goes through this. A throw from inside an `error` listener is
// itself dispatched as an uncaught error — straight back into this file — so
// nothing here may escape, however unlikely.
function guard<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    try {
      fn(...args)
    } catch (e) {
      console.warn('[errorReports] listener failed', e)
    }
  }
}

/**
 * An app pane (or the whole workspace) fell over. Called by AppErrorBoundary.
 * A stale chunk is a deploy landing under an open tab, not a bug — the
 * boundary already handles it — so it is not reported.
 */
export const reportCrash = guard((error: unknown, componentStack?: string | null): void => {
  if (isStaleChunkError(error) || !firstSighting(error)) return
  capture({ kind: 'crash', ...describe(error), componentStack: componentStack ?? null })
})

// PostgREST's "no such function" (PGRST202), or Postgres's own (42883).
function isMissingFunction(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string }
  return code === 'PGRST202' || code === '42883' || /could not find the function|function .* does not exist/i.test(message ?? '')
}

async function send(): Promise<void> {
  if (sending || unavailable || !reportingAllowed()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return
  persistNow()
  const box = readOutbox(userId)
  if (box.length === 0) return

  const batch = box.slice(0, BATCH)
  sending = true
  try {
    await ensureFreshSession()
    // Signed out, or someone else signed in, while the session was checked.
    if (useAuthStore.getState().user?.id !== userId) return
    const { error } = await getSupabase().rpc('report_errors', { reports: batch })
    if (error) throw error
    writeOutbox(userId, subtractSent(readOutbox(userId), batch))
    backoffMs = 0
    if (box.length > batch.length) scheduleSend(2_000)
  } catch (e) {
    if (isMissingFunction(e)) {
      unavailable = true
      console.warn('[errorReports] report_errors is missing. Run supabase/migrations/0027_error_reports.sql.')
      return
    }
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : 30_000, MAX_BACKOFF_MS)
    console.warn(`[errorReports] send failed, retrying in ${Math.round(backoffMs / 1000)}s`, e)
    scheduleSend(backoffMs)
  } finally {
    sending = false
  }
}

function pushTrail(app: string): void {
  trail.push({ at: Date.now(), app })
  if (trail.length > TRAIL_MAX) trail.shift()
}

/**
 * Install the listeners. Once per page load, from main.tsx — before the first
 * render, so an error thrown while the app boots is heard too. Idempotent.
 */
export function startErrorReporting(): void {
  if (started || typeof window === 'undefined') return
  started = true

  window.addEventListener('error', guard(onWindowError))
  window.addEventListener('unhandledrejection', guard(onRejection))
  onErrorShown(guard(onShown))

  // The breadcrumb trail: which apps the member went through on the way to
  // the error, and how long ago.
  let previousApp = useAppStore.getState().activeApp
  if (previousApp) pushTrail(previousApp)
  useAppStore.subscribe((s) => {
    if (s.activeApp === previousApp) return
    previousApp = s.activeApp
    if (previousApp) pushTrail(previousApp)
  })

  // Whatever a signed-in member's last visit left in the outbox goes out once
  // they are back — including the crash that made them press Reload.
  let previousUser = useAuthStore.getState().user?.id ?? null
  if (previousUser) scheduleSend(BOOT_SEND_DELAY_MS)
  useAuthStore.subscribe((s) => {
    const next = s.user?.id ?? null
    if (next === previousUser) return
    previousUser = next
    if (next) scheduleSend(BOOT_SEND_DELAY_MS)
  })

  // Switched off in Settings: drop what's waiting, not just what comes next.
  useErrorReportStore.subscribe((s) => {
    if (s.enabled) return
    pending = new Map()
    const userId = useAuthStore.getState().user?.id
    if (userId) writeOutbox(userId, [])
  })

  // Leaving is the last chance to get pending reports onto disk.
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow()
  })
}
