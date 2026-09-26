import { afterEach, describe, expect, it, vi } from 'vitest'
import { kieChatCompletions, TruncatedResponseError } from './kie'
import { CHAT_MODEL_DEFAULT, CHAT_MODEL_STRONG, getChatTarget } from './models'

// kie answers chat errors inside an HTTP 200, so every reply here is a 200 and
// the body alone says whether the call worked — which also keeps
// fetchWithRetry's own retries (and their backoff sleeps) out of the test.
function reply(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
const ok = (text: string, finish = 'stop') =>
  reply({ choices: [{ message: { content: text }, finish_reason: finish }] })
const envelope = (code: number) => reply({ code, msg: `upstream said ${code}` })

// Queues one reply per endpoint and records which endpoints were hit, in order.
function stubKie(byEndpoint: Record<string, () => Response>) {
  const hits: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url).pathname
    hits.push(path)
    return byEndpoint[path]()
  }))
  return hits
}

const PRIMARY = '/gemini-3-8-flash-openai/v1/chat/completions'
const FALLBACK = '/gemini-3-5-flash-openai/v1/chat/completions'
const messages = [{ role: 'user' as const, content: 'hi' }]

afterEach(() => vi.unstubAllGlobals())

describe('the chat fallback', () => {
  // The Gemini retry rides the STRONG role (the Ad Analyzer's video read);
  // the default role moved to DeepSeek V4.1 Flash, which carries none.
  it('points the strong chat model at Gemini 3.5 Flash', () => {
    const target = getChatTarget(CHAT_MODEL_STRONG)
    expect(target.endpoint).toBe(PRIMARY)
    expect(target.fallback?.endpoint).toBe(FALLBACK)
    expect(target.fallback?.fallback).toBeUndefined()
  })

  it('leaves the default chat model with no fallback', () => {
    expect(getChatTarget(CHAT_MODEL_DEFAULT).fallback).toBeUndefined()
  })

  it('answers from the primary when it works, without touching the fallback', async () => {
    const hits = stubKie({ [PRIMARY]: () => ok('from 3.8'), [FALLBACK]: () => ok('from 3.5') })
    await expect(kieChatCompletions('k', getChatTarget(CHAT_MODEL_STRONG), messages)).resolves.toBe('from 3.8')
    expect(hits).toEqual([PRIMARY])
  })

  it('retries once on the fallback when the primary fails', async () => {
    const hits = stubKie({ [PRIMARY]: () => envelope(500), [FALLBACK]: () => ok('from 3.5') })
    await expect(kieChatCompletions('k', getChatTarget(CHAT_MODEL_STRONG), messages)).resolves.toBe('from 3.5')
    expect(hits).toEqual([PRIMARY, FALLBACK])
  })

  it("surfaces the primary's error when both fail", async () => {
    stubKie({ [PRIMARY]: () => envelope(500), [FALLBACK]: () => envelope(503) })
    await expect(kieChatCompletions('k', getChatTarget(CHAT_MODEL_STRONG), messages)).rejects.toThrow('upstream said 500')
  })

  it('does not fall back on a key or balance problem', async () => {
    const hits = stubKie({ [PRIMARY]: () => envelope(402), [FALLBACK]: () => ok('from 3.5') })
    await expect(kieChatCompletions('k', getChatTarget(CHAT_MODEL_STRONG), messages)).rejects.toThrow('upstream said 402')
    expect(hits).toEqual([PRIMARY])
  })

  it('does not fall back on a truncated answer', async () => {
    const hits = stubKie({ [PRIMARY]: () => ok('half a', 'length'), [FALLBACK]: () => ok('from 3.5') })
    await expect(kieChatCompletions('k', getChatTarget(CHAT_MODEL_STRONG), messages)).rejects.toBeInstanceOf(TruncatedResponseError)
    expect(hits).toEqual([PRIMARY])
  })

  it('leaves a model with no fallback alone', async () => {
    const hits = stubKie({ [FALLBACK]: () => envelope(500) })
    await expect(kieChatCompletions('k', getChatTarget('gemini-3-5-flash'), messages)).rejects.toThrow()
    expect(hits).toEqual([FALLBACK])
  })
})
