// The pure half of error reporting: what a report looks like, how it is
// scrubbed, how two reports of the same bug come to share one fingerprint, and
// how the outbox coalesces them. No stores, no network — utils/errorReporter.ts
// is the wiring, and the tests exercise this file directly.

import { DEBUG_TAIL } from './friendlyError'

/**
 * `crash`  — a pane fell over (AppErrorBoundary)
 * `error`  — an uncaught exception or unhandled rejection
 * `failed` — a failure a member was shown (humanizeError)
 */
export type ErrorKind = 'crash' | 'error' | 'failed'

/** Everything the admin sees besides the error itself. All optional: a report
 * from a stripped-down environment is still worth having. */
export interface ReportContext {
  /** The error's constructor name — TypeError, FriendlyError, … */
  name?: string
  path?: string
  browser?: string
  viewport?: string
  online?: boolean
  /** Seconds since the page loaded. "Broke 3s in" and "broke after two hours"
   * are different bugs. */
  session_s?: number
  /** The last few apps the member opened, oldest first, as [appId, seconds
   * before the error]. */
  trail?: Array<[string, number]>
  component_stack?: string
}

/** One outbox entry — and, field for field, one element of the array
 * `report_errors` (migration 0027) takes. */
export interface ErrorReport {
  fingerprint: string
  kind: ErrorKind
  app_id: string | null
  message: string
  shown: string | null
  operation: string | null
  stack: string | null
  context: ReportContext
  build_id: string
  count: number
}

export interface ReportInput {
  kind: ErrorKind
  name: string | null
  message: string
  stack: string | null
  shown?: string | null
  operation?: string | null
  componentStack?: string | null
}

// Mirrors the caps in report_errors, which is where they are enforced. Capping
// here as well keeps the outbox — localStorage, shared with the sync outbox —
// from carrying text the server would throw away.
const CAP = { message: 1000, shown: 400, operation: 160, stack: 4000, componentStack: 1500, browser: 300 }

// The server accepts up to four digits per report (see report_errors). A
// runaway loop doesn't need counting past that: "9999+" says it.
export const MAX_COUNT = 9999

/**
 * Remove what must never leave the browser: the member's own API keys (passed
 * in as `secrets`, matched literally wherever they appear), bearer tokens,
 * JWTs, signed-URL queries (an R2 presign's query IS its credential) and
 * inline base64 media. Keeps everything that says what went wrong.
 */
export function scrub(text: string, secrets: readonly string[] = []): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join('[key]')
  }
  return out
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]')
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{16,}/gi, 'data:[…]')
    .replace(/(https?:\/\/[^\s?#"'<>]+)\?[^\s"'<>)]*/gi, '$1?[…]')
    .replace(/\b(api[_-]?key|apikey|token|secret|password|signature)(\s*[=:]\s*)["']?[^\s"'&,;]+/gi, '$1$2[redacted]')
}

function cap(text: string | null | undefined, max: number): string | null {
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * The message with everything that varies between two occurrences of the same
 * bug taken out: debug tails, URLs, ids, and numbers other than HTTP statuses
 * (a 422 and a 500 are different failures; a taskId is not a different bug).
 */
export function normalizeMessage(message: string): string {
  const cut = message.search(DEBUG_TAIL)
  return (cut === -1 ? message : message.slice(0, cut))
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    // An alphanumeric run with a digit in it — task ids, hashes, asset ids.
    .replace(/\b(?=[A-Za-z_-]*\d)(?=\d*[A-Za-z_-])[A-Za-z0-9_-]{10,}\b/g, '<id>')
    // A callback rather than a lookbehind, which Safari before 16.4 can't
    // even parse — and a regex this module can't parse takes the app with it.
    .replace(/\d+(?:\.\d+)?/g, (num: string, offset: number, text: string) => {
      const before = text[offset - 1] ?? ''
      const after = text[offset + num.length] ?? ''
      // Part of a word (`v2`, `h264`): leave it.
      if (/[A-Za-z_]/.test(before)) return num
      // A standalone HTTP status (`422 at`, `(500)`), not `500ms`.
      if (/^[1-5]\d\d$/.test(num) && !/[A-Za-z]/.test(after)) return num
      return '#'
    })
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 300)
}

/**
 * The chunk the first stack frame points into, minus its content hash —
 * `Playground-Bx7a9Qe1.js:1:2345` → `Playground`. Stable across deploys, which
 * a function name (minified) or a line number is not, and it's what keeps two
 * different bugs with the same generic message ("Cannot read properties of
 * undefined") in two apps from landing in one group.
 */
export function topSource(stack: string | null): string {
  if (!stack) return ''
  const match = stack.match(/\/([A-Za-z0-9_.]+?)(?:-[A-Za-z0-9_-]{8})?\.(?:m?js|tsx?)(?:\?[^:\s)]*)?:\d+/)
  return match ? match[1] : ''
}

// cyrb53: a small, well-distributed 53-bit string hash. Not cryptographic, and
// doesn't need to be — it only has to make collisions between two different
// bugs vanishingly rare.
export function hash53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * Two reports share a fingerprint when they are the same bug. The app the
 * member happened to be in is deliberately NOT part of it: a background
 * generation fails wherever the member has wandered off to, and splitting
 * that one failure per app would scatter it across the list.
 */
export function fingerprintOf(input: Pick<ReportInput, 'kind' | 'name' | 'message' | 'stack' | 'operation'>): string {
  const where = input.kind === 'failed' ? (input.operation ?? '') : topSource(input.stack)
  return hash53([input.kind, input.name ?? '', where, normalizeMessage(input.message)].join('|'))
}

// Things browsers and extensions throw that no change to this app can fix.
const NOISE: RegExp[] = [
  /resizeobserver loop/i,
  /^script error\.?$/i,
  /\babort(?:ed)?error\b/i,
  /\bthe (?:operation|user|request) (?:was )?abort/i,
  /\bsignal is aborted\b/i,
]

/** True for an uncaught error that isn't ours: browser quirks, cancelled
 * requests, and anything thrown from inside a browser extension. */
export function isNoise(name: string | null, message: string, stack: string | null): boolean {
  if (name === 'AbortError') return true
  if (NOISE.some((re) => re.test(message))) return true
  // An extension's frames on top of the stack — it threw, not us.
  if (stack && /(?:chrome|moz|safari|safari-web)-extension:\/\//.test(stack.split('\n').slice(0, 3).join('\n'))) return true
  return false
}

export interface ReportEnv {
  appId: string | null
  buildId: string
  secrets: readonly string[]
  context: Omit<ReportContext, 'name' | 'component_stack'>
}

/** Turn a captured error into the outbox entry that describes it. */
export function buildReport(input: ReportInput, env: ReportEnv): ErrorReport {
  const clean = (text: string | null | undefined, max: number) => cap(text ? scrub(text, env.secrets) : null, max)
  const message = clean(input.message, CAP.message) ?? '(no message)'
  const context: ReportContext = { ...env.context }
  if (input.name) context.name = input.name.slice(0, 80)
  const componentStack = clean(input.componentStack, CAP.componentStack)
  if (componentStack) context.component_stack = componentStack
  if (context.browser) context.browser = context.browser.slice(0, CAP.browser)
  return {
    // From the scrubbed message, so a secret can't even reach the hash input.
    fingerprint: fingerprintOf({ ...input, message }),
    kind: input.kind,
    app_id: env.appId,
    message,
    shown: clean(input.shown, CAP.shown),
    operation: clean(input.operation, CAP.operation),
    stack: clean(input.stack, CAP.stack),
    context,
    build_id: env.buildId,
    count: 1,
  }
}

/**
 * Fold a report into an outbox. A fingerprint already there takes the new
 * sample and adds the counts; a new one is appended while there is room, and
 * dropped once the outbox holds `max` — the first errors of a bad session are
 * the ones worth keeping, not whatever a runaway throws last.
 */
export function mergeReport(box: readonly ErrorReport[], report: ErrorReport, max: number): ErrorReport[] {
  const i = box.findIndex((r) => r.fingerprint === report.fingerprint)
  if (i === -1) return box.length >= max ? [...box] : [...box, report]
  const next = [...box]
  next[i] = { ...report, count: Math.min(MAX_COUNT, box[i].count + report.count) }
  return next
}

/**
 * What is left of an outbox once `sent` has been delivered. Counts are
 * subtracted rather than entries deleted, so occurrences that landed while the
 * request was in flight survive to the next send instead of vanishing with it.
 */
export function subtractSent(box: readonly ErrorReport[], sent: readonly ErrorReport[]): ErrorReport[] {
  const out: ErrorReport[] = []
  for (const r of box) {
    const s = sent.find((x) => x.fingerprint === r.fingerprint)
    if (!s) {
      out.push(r)
      continue
    }
    const left = r.count - s.count
    if (left > 0) out.push({ ...r, count: left })
  }
  return out
}
