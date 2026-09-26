// Higgsfield API client — the second generation provider, for the models kie
// doesn't carry (Higgsfield's own Soul family).
//
//   POST https://api.higgsfield.ai/<model path>        { ...params }  -> { request_id, status }
//   GET  https://api.higgsfield.ai/requests/<id>/status               -> { status, images?, video?, error? }
//   POST https://api.higgsfield.ai/estimate/<model path> { ...params } -> { credits, usd }
//
// Docs: https://docs.higgsfield.ai/docs/llms.txt (shared lifecycle, errors,
// limits) and each model's own llms.txt under dash.higgsfield.ai/models/.
//
// The BROWSER calls it directly, like kie and ScrapeCreators: the API answers
// CORS preflights for any origin (checked 2026-09-24), so the member's key
// never touches our servers. Higgsfield's docs say "keep credentials
// server-side" — that is advice for a company shipping ITS OWN secret inside
// an app. Here each member pastes their own key into their own browser, which
// is the same trust model as the kie key.
//
// Three ways this differs from kie, each handled below:
//   - The key is a pair, sent as `Authorization: Key KEY_ID:KEY_SECRET`.
//   - The limit is CONCURRENCY, not a request rate: a submit past the account's
//     cap comes back 400 "Maximum number of concurrent requests (N) has been
//     reached" and is NOT created. New accounts get 2. So a rejected submit
//     waits and tries again (see higgsfieldSubmit) instead of failing a batch.
//   - A generation POST is never retried after an ambiguous failure: the API
//     takes no idempotency key, so a resend after a dropped connection could
//     bill twice. Status reads retry freely.

import { FriendlyError } from './friendlyError'
import { PollTimeoutError } from './kie'

const BASE_URL = 'https://api.higgsfield.ai'

const REQUEST_TIMEOUT_MS = 60_000
const STATUS_TIMEOUT_MS = 30_000

// Higgsfield's recommended poll: start at 2s, grow to 10s, add jitter.
const POLL_START_MS = 2_000
const POLL_MAX_MS = 10_000
export const HIGGSFIELD_IMAGE_POLL_MINUTES = 10

// How long a submit waits in total for a concurrency slot before giving up.
// A 4-image batch on a new account's cap of 2 waits for the first pair to
// finish — a minute or two for Soul — so ten minutes is a hang-breaker, not a
// budget anyone should reach.
const CONCURRENCY_WAIT_MAX_MS = 10 * 60_000
const CONCURRENCY_RETRY_MS = 5_000

// ── Errors ──────────────────────────────────────────────────────

// Every message starts "Higgsfield" so friendlyError's Higgsfield rules can
// claim it before the kie rules see a 401 or 403 and send the member off to
// fix the wrong key. Same reason ScrapeCreatorsError is prefixed.
export class HiggsfieldHttpError extends Error {
  readonly status: number
  constructor(status: number, detail: string, endpoint: string) {
    // The endpoint rides behind `endpoint=` so humanizeError's DEBUG_TAIL cuts
    // it off: a status path holds a request UUID, and a stray "401" inside
    // one would otherwise read as a bad key.
    super(`Higgsfield ${status}: ${detail} endpoint=${endpoint}`)
    this.name = 'HiggsfieldHttpError'
    this.status = status
  }
}

// A submit rejected because the account is at its concurrency cap. The request
// was not created, so it is safe to send again.
function isConcurrencyLimit(err: unknown): boolean {
  return err instanceof HiggsfieldHttpError && err.status === 400 && /concurrent/i.test(err.message)
}

// Statuses a status read can't recover from by waiting: bad key, no credits,
// unknown request id.
const TERMINAL_READ_STATUS = new Set([401, 403, 404])

// FastAPI's error envelope: `detail` is a string, or a list of validation
// errors each carrying a `msg`.
function readDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown }
    const d = parsed.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d)) {
      return d
        .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg: unknown }).msg) : JSON.stringify(e)))
        .join('; ')
    }
  } catch { /* not JSON */ }
  const trimmed = body.trim()
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed || 'no response body'
}

// The pasted key must be the `KEY_ID:KEY_SECRET` pair Higgsfield's console
// hands out. Checked here so a half-pasted key fails with a sentence rather
// than a 401 the member has to decode.
function authHeader(apiKey: string): string {
  const key = apiKey.trim()
  if (!/^[^:\s]+:[^:\s]+$/.test(key)) {
    throw new FriendlyError(
      'That Higgsfield key is incomplete. Paste it as KEY_ID:KEY_SECRET, both halves from the Higgsfield console, joined by a colon.',
    )
  }
  return `Key ${key}`
}

// One request with the headers AND the body read under a single deadline.
// fetch() settles at the headers, so a timer that stops there leaves a stalled
// body pending forever; reading the text inside the same controller closes that.
async function request<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | undefined,
  opts: { signal?: AbortSignal; timeoutMs: number },
): Promise<T> {
  const { signal, timeoutMs } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const endpoint = `${method} ${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  let res: Response
  let text: string
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: authHeader(apiKey),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    text = await res.text()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) throw err
      throw new Error(`Higgsfield request timed out. endpoint=${endpoint}`)
    }
    if (err instanceof TypeError) throw new Error(`Higgsfield connection failed. endpoint=${endpoint}`)
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (!res.ok) throw new HiggsfieldHttpError(res.status, readDetail(text), endpoint)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Higgsfield sent a response we couldn't read. endpoint=${endpoint} body=${text.slice(0, 200)}`)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Generation ──────────────────────────────────────────────────

export type HiggsfieldStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'

export interface HiggsfieldRequest {
  request_id: string
  status: HiggsfieldStatus
  error?: string | null
  images?: Array<{ url: string }>
  video?: { url: string }
}

// Create a generation and return its request id. Persist the id before doing
// anything else with it: it is the only handle a reload can resume from.
//
// A submit refused for concurrency waits for a slot and goes again — the
// request never existed, so nothing can bill twice. Anything else, including a
// dropped connection, surfaces at once.
export async function higgsfieldSubmit(
  apiKey: string,
  modelPath: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const startedAt = Date.now()
  for (;;) {
    try {
      const res = await request<HiggsfieldRequest>(apiKey, 'POST', `/${modelPath}`, input, {
        signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
      })
      if (!res.request_id) {
        throw new Error(`Higgsfield accepted the request but sent no request id. body=${JSON.stringify(res).slice(0, 200)}`)
      }
      return res.request_id
    } catch (err) {
      if (!isConcurrencyLimit(err) || Date.now() - startedAt > CONCURRENCY_WAIT_MAX_MS) throw err
      await sleep(CONCURRENCY_RETRY_MS + Math.random() * 1_000, signal)
    }
  }
}

export function getHiggsfieldRequest(apiKey: string, requestId: string, signal?: AbortSignal): Promise<HiggsfieldRequest> {
  return request<HiggsfieldRequest>(
    apiKey,
    'GET',
    `/requests/${encodeURIComponent(requestId)}/status`,
    undefined,
    { signal, timeoutMs: STATUS_TIMEOUT_MS },
  )
}

// Poll a request to a terminal state. Returns the completed request; throws on
// failed / nsfw / canceled, and PollTimeoutError when the budget runs out with
// the request still going — the same error kie's poller throws, so a caller's
// "keep the id and resume later" branch works for both providers.
export async function pollHiggsfield(
  apiKey: string,
  requestId: string,
  opts: { signal?: AbortSignal; maxMinutes?: number } = {},
): Promise<HiggsfieldRequest> {
  const { signal, maxMinutes = HIGGSFIELD_IMAGE_POLL_MINUTES } = opts
  const deadline = Date.now() + maxMinutes * 60_000
  let delay = POLL_START_MS
  let blindStreak = 0
  while (Date.now() < deadline) {
    await sleep(delay + Math.random() * 500, signal)
    delay = Math.min(delay * 1.5, POLL_MAX_MS)
    let req: HiggsfieldRequest
    try {
      req = await getHiggsfieldRequest(apiKey, requestId, signal)
    } catch (err) {
      if (signal?.aborted) throw err
      if (err instanceof HiggsfieldHttpError && TERMINAL_READ_STATUS.has(err.status)) throw err
      blindStreak++
      continue
    }
    blindStreak = 0
    switch (req.status) {
      case 'completed':
        return req
      case 'failed':
        throw new Error(`Higgsfield generation failed: ${req.error || 'no details returned'}`)
      case 'nsfw':
        // Refunded by Higgsfield, so "nothing was charged" is a fact, not a hope.
        throw new FriendlyError(
          "Higgsfield's content filter blocked this one, so nothing was charged. Reword the prompt and try again.",
        )
      case 'canceled':
        throw new FriendlyError('This generation was canceled on Higgsfield before it started, so nothing was charged.')
    }
  }
  throw new PollTimeoutError(maxMinutes, 'Generation', blindStreak >= 3, 'Higgsfield')
}

export function higgsfieldImageUrls(req: HiggsfieldRequest): string[] {
  return (req.images ?? []).map((i) => i?.url).filter((u): u is string => typeof u === 'string' && u.length > 0)
}

// ── Settings ────────────────────────────────────────────────────

// Prove a key works without spending anything: the estimate endpoint needs a
// valid key and bills nothing. What it returns is the price of one Soul 2
// image on THIS account (any discount applied), which is shown back to them in
// dollars — the same unit the pickers use for every Higgsfield model.
//
// Infra surface: the caller shows the RAW message, not humanizeError copy.
export async function higgsfieldTestConnection(
  apiKey: string,
): Promise<{ ok: true; usd: number | null } | { ok: false; error: string }> {
  try {
    const res = await request<{ usd?: string | number }>(
      apiKey,
      'POST',
      '/estimate/higgsfield-ai/soul/v2/standard',
      { prompt: 'Connection test' },
      { timeoutMs: STATUS_TIMEOUT_MS },
    )
    const usd = Number(res.usd)
    return { ok: true, usd: Number.isFinite(usd) ? usd : null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
