// kie.ai unified API client.
//
// Architecture per https://docs.kie.ai/:
//   POST https://api.kie.ai/api/v1/jobs/createTask  { model, input, callBackUrl? } -> { code, msg, data: { taskId } }
//   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...                       -> { code, msg, data: { state, resultJson, ... } }
//
// All generation tasks are async. We poll recordInfo until state in {success, fail}.

const BASE_URL = 'https://api.kie.ai/api/v1'

const DEFAULT_TIMEOUT_MS = 90_000
const MAX_RETRIES = 3
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504, 455])

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 30_000
const MAX_POLL_ATTEMPTS = 60 // 5 minutes

// ── Types ───────────────────────────────────────────────────────

export type TaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

export interface KieEnvelope<T> {
  code: number
  msg: string
  data: T
}

export interface CreateTaskData {
  taskId: string
}

export interface TaskRecord {
  taskId: string
  model: string
  state: TaskState
  param: string
  resultJson: string
  failCode: string
  failMsg: string
  costTime: number
  completeTime: number
  createTime: number
  updateTime: number
  progress: number
}

export interface RunTaskOptions {
  signal?: AbortSignal
  onProgress?: (progress: number, state: TaskState) => void
  pollIntervalMs?: number
  maxPollAttempts?: number
}

// ── Errors ──────────────────────────────────────────────────────

function friendlyHttpError(status: number, msg: string): string {
  if (status === 401) return 'Invalid or expired kie.ai API key. Open Settings to update.'
  if (status === 402) return 'Insufficient kie.ai credits. Top up your account to continue.'
  if (status === 422) return `Validation error: ${msg}`
  if (status === 429) return 'kie.ai rate limit reached — wait a moment and try again.'
  if (status === 433) return 'API key usage limit exceeded.'
  if (status === 455) return 'kie.ai is undergoing maintenance — try again shortly.'
  if (status >= 500) return `kie.ai server error (${status}). Try again in a moment.`
  return `kie.ai error (${status}): ${msg}`
}

function friendlyTaskError(failCode: string, failMsg: string): string {
  if (!failMsg && !failCode) return 'Generation failed (no details returned).'
  return `Generation failed${failCode ? ` (${failCode})` : ''}: ${failMsg || 'unknown error'}`
}

// ── Retry/timeout fetch ────────────────────────────────────────

function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000 + Math.random() * 500, 10_000)
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  let lastError: Error = new Error('Request failed')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)

      if (res.ok) return res

      const body = await res.json().catch(() => ({}))
      const msg = (body as { msg?: string }).msg ?? res.statusText

      if (RETRYABLE_HTTP.has(res.status) && attempt < MAX_RETRIES) {
        if (res.status === 429) {
          const ra = res.headers.get('Retry-After')
          const waitMs = ra ? parseInt(ra, 10) * 1000 : NaN
          if (!isNaN(waitMs) && waitMs > 0 && waitMs <= 60_000) {
            lastError = new Error(friendlyHttpError(res.status, msg))
            await new Promise(r => setTimeout(r, waitMs))
            continue
          }
        }
        lastError = new Error(friendlyHttpError(res.status, msg))
      } else {
        throw new Error(friendlyHttpError(res.status, msg))
      }
    } catch (err) {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)

      if (err instanceof DOMException && err.name === 'AbortError') {
        if (signal?.aborted) throw err
        throw new Error('Request timed out — kie.ai took too long to respond. Try again.')
      }

      if (err instanceof Error && !(err instanceof TypeError)) throw err

      if (attempt === MAX_RETRIES) {
        throw new Error('Connection failed. Check your internet connection and try again.')
      }
      lastError = err as Error
    }

    await new Promise(r => setTimeout(r, backoffMs(attempt)))
  }

  throw lastError
}

// ── Core API ────────────────────────────────────────────────────

async function authedFetch<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetchWithRetry(
    `${BASE_URL}${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
    },
    options,
  )
  const json = (await res.json()) as KieEnvelope<T>
  if (json.code !== 200) {
    throw new Error(friendlyHttpError(json.code, json.msg))
  }
  return json.data
}

export async function createTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const data = await authedFetch<CreateTaskData>(
    apiKey,
    '/jobs/createTask',
    { method: 'POST', body: JSON.stringify({ model, input }) },
    { signal },
  )
  return data.taskId
}

export async function getTaskRecord(
  apiKey: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<TaskRecord> {
  return authedFetch<TaskRecord>(
    apiKey,
    `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    { signal, timeoutMs: POLL_TIMEOUT_MS },
  )
}

export async function pollTask(
  apiKey: string,
  taskId: string,
  opts: RunTaskOptions = {},
): Promise<TaskRecord> {
  const { signal, onProgress, pollIntervalMs = POLL_INTERVAL_MS, maxPollAttempts = MAX_POLL_ATTEMPTS } = opts

  for (let i = 0; i < maxPollAttempts; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    await new Promise(r => setTimeout(r, pollIntervalMs))

    let record: TaskRecord
    try {
      record = await getTaskRecord(apiKey, taskId, signal)
    } catch (err) {
      // Transient poll error — keep going unless caller aborted
      if (signal?.aborted) throw err
      continue
    }

    onProgress?.(record.progress ?? 0, record.state)

    if (record.state === 'success') return record
    if (record.state === 'fail') {
      throw new Error(friendlyTaskError(record.failCode, record.failMsg))
    }
  }

  throw new Error('Generation timed out after 5 minutes.')
}

export async function runTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  opts: RunTaskOptions = {},
): Promise<TaskRecord> {
  const taskId = await createTask(apiKey, model, input, opts.signal)
  return pollTask(apiKey, taskId, opts)
}

// ── Result parsing ──────────────────────────────────────────────

export interface ParsedResult {
  resultUrls: string[]
  raw: unknown
}

export function parseResult(record: TaskRecord): ParsedResult {
  let parsed: { resultUrls?: string[] } = {}
  try {
    parsed = JSON.parse(record.resultJson || '{}')
  } catch {
    // ignore
  }
  return {
    resultUrls: parsed.resultUrls ?? [],
    raw: parsed,
  }
}

// ── High-level helpers ─────────────────────────────────────────
//
// Each helper wraps runTask + parseResult for a specific task type.
// The exact `input` shape varies per model — see individual model docs
// at https://docs.kie.ai/. Helpers below codify the shapes confirmed
// against kie.ai's docs as of 2026-05-05.

export async function kieImageGenerate(
  apiKey: string,
  modelId: string,
  input: {
    prompt: string
    aspect_ratio?: 'auto' | '1:1' | '9:16' | '16:9' | '4:3' | '3:4'
    resolution?: '1K' | '2K' | '4K'
    referenceImages?: string[]
  },
  opts: RunTaskOptions = {},
): Promise<string[]> {
  const record = await runTask(apiKey, modelId, input as unknown as Record<string, unknown>, opts)
  return parseResult(record).resultUrls
}

export async function kieVideoGenerate(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>,
  opts: RunTaskOptions = {},
): Promise<string[]> {
  const record = await runTask(apiKey, modelId, input, opts)
  return parseResult(record).resultUrls
}

export async function kieChat(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>,
  opts: RunTaskOptions = {},
): Promise<TaskRecord> {
  // Used for chat models that go through the createTask/recordInfo pipeline
  // (rare). Most chat models on kie.ai use the OpenAI-compatible chat
  // completions endpoint instead — see `kieChatCompletions` below.
  return runTask(apiKey, modelId, input, opts)
}

// ── OpenAI-compatible chat completions ─────────────────────────
//
// kie.ai's chat models (Gemini 3 Flash, GPT-5.5, Claude Opus 4, etc.) are
// served at per-model endpoints that mirror the OpenAI chat completions API:
//   POST /<model-slug>/v1/chat/completions
// The endpoint is sync — no taskId polling.

export type ChatRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool'

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: ChatRole
  content: ChatContentPart[] | string
}

export interface ChatCompletionsOptions {
  signal?: AbortSignal
  reasoningEffort?: 'low' | 'high'
  includeThoughts?: boolean
  timeoutMs?: number
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: { role: string; content: string }
    finish_reason?: string
  }>
}

export async function kieChatCompletions(
  apiKey: string,
  endpointPath: string,
  messages: ChatMessage[],
  opts: ChatCompletionsOptions = {},
): Promise<string> {
  const { signal, reasoningEffort = 'low', includeThoughts = false, timeoutMs = 120_000 } = opts

  // kie.ai's chat completions default to streaming (SSE). We request streaming
  // explicitly and accumulate deltas — this is the documented happy path.
  const res = await fetchWithRetry(
    `https://api.kie.ai${endpointPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        messages,
        stream: true,
        include_thoughts: includeThoughts,
        reasoning_effort: reasoningEffort,
      }),
    },
    { signal, timeoutMs },
  )

  // Read the body once as text; dispatch based on content-type / shape.
  const raw = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  const looksLikeSSE = contentType.includes('text/event-stream') || raw.startsWith('data:') || raw.includes('\ndata:')

  if (looksLikeSSE) {
    const text = parseSSEContent(raw)
    if (text.length > 0) return text
    throw new Error(
      `Chat model produced empty SSE stream. First 200 chars: ${raw.slice(0, 200)}`,
    )
  }

  // Plain JSON response
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error(`Chat model returned non-JSON response: ${raw.slice(0, 200)}`)
  }
  const text = (body as ChatCompletionsResponse).choices?.[0]?.message?.content
  if (typeof text === 'string' && text.length > 0) return text

  throw new Error(
    `Empty response from chat model. Response shape: ${JSON.stringify(body).slice(0, 400)}`,
  )
}

function parseSSEContent(raw: string): string {
  let content = ''
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line || !line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string }
          message?: { content?: string }
        }>
      }
      const delta = parsed.choices?.[0]?.delta?.content
      const message = parsed.choices?.[0]?.message?.content
      if (typeof delta === 'string') content += delta
      else if (typeof message === 'string') content += message
    } catch {
      // skip non-JSON event payloads (comments, keepalives)
    }
  }
  return content
}

export async function kieTTS(
  apiKey: string,
  modelId: string,
  input: { text: string; voice?: string; [k: string]: unknown },
  opts: RunTaskOptions = {},
): Promise<string[]> {
  const record = await runTask(apiKey, modelId, input as unknown as Record<string, unknown>, opts)
  return parseResult(record).resultUrls
}

// ── File helpers ────────────────────────────────────────────────

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Failed to read file as data URI.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read error.'))
    reader.readAsDataURL(file)
  })
}

// ── Connection test ─────────────────────────────────────────────
//
// Hits a lightweight account endpoint to verify the API key is valid.
// Used by the SettingsModal "Test connection" button.

export async function kieTestConnection(apiKey: string): Promise<{ ok: true; credits: number } | { ok: false; error: string }> {
  try {
    const credits = await authedFetch<number>(
      apiKey,
      '/chat/credit',
      { method: 'GET' },
      { timeoutMs: 10_000 },
    )
    return { ok: true, credits }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
