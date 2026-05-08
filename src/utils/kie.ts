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

      // Read the full response body so we can always surface *something* meaningful.
      // kie.ai usually returns JSON like { code, msg, ... }, but on misrouted requests
      // (404s, gateway errors) the body may be HTML, plain text, or empty. We try JSON
      // first for the common case, then fall back to raw text, so the user never sees
      // "kie.ai error (404):" with a blank message.
      const rawText = await res.text().catch(() => '')
      let parsed: Record<string, unknown> | null = null
      try { parsed = rawText ? JSON.parse(rawText) : null } catch { /* not JSON */ }

      const errObj = parsed && typeof parsed.error === 'object' && parsed.error !== null
        ? parsed.error as Record<string, unknown>
        : null
      const fromJson =
        (parsed?.msg as string | undefined) ??
        (parsed?.message as string | undefined) ??
        (typeof parsed?.error === 'string' ? parsed.error as string : undefined) ??
        (errObj?.message as string | undefined)

      const truncated = rawText.length > 400 ? rawText.slice(0, 400) + '…' : rawText
      const msg =
        fromJson?.trim() ||
        truncated.trim() ||
        res.statusText ||
        `${url} returned no response body`

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

// Generic image-gen call. Body shape varies per model — use `buildImageInput`
// from src/utils/models.ts to construct the right body for the chosen model.
export async function kieImageGenerate(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>,
  opts: RunTaskOptions = {},
): Promise<string[]> {
  const record = await runTask(apiKey, modelId, input, opts)
  return parseResult(record).resultUrls
}

// Download a generated URL and return base64 + mimeType for local persistence.
export async function downloadAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download generated asset (${res.status}).`)
  const blob = await res.blob()
  const mimeType = blob.type || 'image/png'
  const buffer = await blob.arrayBuffer()
  // Avoid `String.fromCharCode(...new Uint8Array(...))` which blows the call
  // stack on large buffers — chunk it.
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 32_768
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return { base64: btoa(binary), mimeType }
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

// ── Veo generate (custom endpoint) ──────────────────────────────
//
// Veo 3.1 family uses POST /api/v1/veo/generate (NOT /jobs/createTask).
// Returns a taskId; poll /api/v1/veo/record-info to check status.
// Different envelope, same shape philosophy as the standard recordInfo.

interface VeoCreateData {
  taskId: string
}

interface VeoRecordData {
  taskId: string
  successFlag?: number   // 0 = pending, 1 = success, 2/3 = failed (varies)
  state?: TaskState
  resultUrls?: string[]
  resultJson?: string
  errorMessage?: string
  errorCode?: string
}

export async function kieVeoGenerate(
  apiKey: string,
  body: Record<string, unknown>,
  opts: RunTaskOptions = {},
): Promise<string[]> {
  const { signal, pollIntervalMs = POLL_INTERVAL_MS, maxPollAttempts = MAX_POLL_ATTEMPTS, onProgress } = opts

  // 1) Create the task.
  const createRes = await fetchWithRetry(
    'https://api.kie.ai/api/v1/veo/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    { signal },
  )
  const createJson = (await createRes.json()) as KieEnvelope<VeoCreateData>
  if (createJson.code !== 200) throw new Error(friendlyHttpError(createJson.code, createJson.msg))
  const taskId = createJson.data.taskId

  // 2) Poll until success / fail.
  for (let i = 0; i < maxPollAttempts; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise((r) => setTimeout(r, pollIntervalMs))

    let record: VeoRecordData
    try {
      const res = await fetchWithRetry(
        `https://api.kie.ai/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        { signal, timeoutMs: POLL_TIMEOUT_MS },
      )
      const env = (await res.json()) as KieEnvelope<VeoRecordData>
      if (env.code !== 200) {
        // Transient — keep going unless caller aborted
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        continue
      }
      record = env.data
    } catch (err) {
      if (signal?.aborted) throw err
      continue
    }

    onProgress?.(0, record.state ?? 'generating')

    // Veo's state semantics: successFlag 1 = done; resultUrls or
    // resultJson hold the output. errorMessage indicates failure.
    if (record.successFlag === 1 || record.state === 'success') {
      const urls =
        record.resultUrls ??
        (record.resultJson ? (JSON.parse(record.resultJson) as { resultUrls?: string[] }).resultUrls ?? [] : [])
      if (urls.length === 0) throw new Error('Veo returned no result URLs.')
      return urls
    }
    if (record.errorMessage || record.state === 'fail') {
      throw new Error(friendlyTaskError(record.errorCode ?? '', record.errorMessage ?? 'Veo generation failed.'))
    }
  }

  throw new Error('Veo generation timed out after 5 minutes.')
}

// ── File upload (kie.ai-hosted, 3 day retention) ───────────────
//
// Image and video models on kie.ai expect publicly accessible URLs in their
// reference-image fields (input_urls, first_frame_url, etc.). This helper
// uploads a base64 / data URI to kie's hosted storage and returns the public
// downloadUrl. Note: uploaded files are deleted after 3 days, so always
// download generated outputs and save them as local assets.

export interface UploadedFile {
  fileName: string
  filePath: string
  downloadUrl: string
  fileSize: number
  mimeType: string
}

export async function kieUploadBase64(
  apiKey: string,
  base64Data: string,
  uploadPath: string = 'ugc-lab',
  fileName?: string,
): Promise<UploadedFile> {
  const res = await fetchWithRetry(
    'https://api.kie.ai/api/file-base64-upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ base64Data, uploadPath, fileName }),
    },
    {},
  )
  const json = (await res.json()) as KieEnvelope<UploadedFile>
  if (json.code !== 200) throw new Error(friendlyHttpError(json.code, json.msg))
  return json.data
}

// Convert any image source (data URI, http(s) URL) to a kie-hosted public URL.
// Pure http(s) URLs pass through; data URIs get uploaded.
export async function ensureHostedUrl(apiKey: string, source: string): Promise<string> {
  if (source.startsWith('http://') || source.startsWith('https://')) return source
  if (source.startsWith('data:')) {
    const uploaded = await kieUploadBase64(apiKey, source)
    return uploaded.downloadUrl
  }
  throw new Error(`Cannot host image source — unsupported format: ${source.slice(0, 64)}`)
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
