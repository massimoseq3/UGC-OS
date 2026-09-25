// A fake kie.ai (and ScrapeCreators, and the media CDNs) for driving UGC OS in
// Playwright for free.
//
//   import { installStub } from './stub.mjs'
//   const stub = await installStub(pageOrContext, { pollsBeforeSuccess: 0 })
//   ...
//   console.log(stub.summary())
//
// Everything that leaves localhost is intercepted with `route()`. Nothing is
// passed through to the real network: an outbound request no handler knows is
// answered 404 and logged as UNHANDLED (see `stub.unhandled`), so a gap shows
// up in the log instead of as a real call.
//
// What it answers (see the HANDLERS table at the bottom):
//   api.kie.ai
//     POST /api/v1/jobs/createTask          → { taskId }   (image / video / tts / chat-as-a-job)
//     GET  /api/v1/jobs/recordInfo          → success after `pollsBeforeSuccess` polls,
//                                             resultJson.resultUrls → fake media below
//     GET  /api/v1/chat/credit              → `credits`
//     POST /api/v1/veo/generate + GET /veo/record-info       (legacy Veo resume path)
//     POST /api/v1/generate + GET /generate/record-info      (Suno music)
//     POST /api/v1/omni/audio/create, /omni/character/create (Gemini Omni ids)
//     POST /<slug>/v1/chat/completions  openai-chat (SSE when stream:true, else JSON)
//     POST /claude/v1/messages          claude-messages
//     POST /<x>/v1/responses            openai-responses
//   kieai.redpandaai.co  POST /api/file-base64-upload (+ stream/url variants) → a fake
//                        hosted URL that serves the uploaded bytes back
//   fake.kie.test        the media: /img/<n>.png, /vid/<n>.mp4 (WebM bytes),
//                        /aud/<n>.wav, /upload/<id>/<name>, /misc/<file>
//   api.scrapecreators.com  TikTok / Meta / Instagram search, details, transcripts
//   fonts.googleapis.com / fonts.gstatic.com  served from assets/fonts if cached
//   any other image      a placeholder PNG (logged)
//
// Chat CONTENT comes from fakeChat.mjs — a table of prompt matchers, one per
// caller, each written to satisfy that caller's parser.
//
// Timing: the app's pollTask waits 1.5s before its first recordInfo and 5s
// between the rest (kie.ts POLL_INTERVAL_MS). With pollsBeforeSuccess = 0
// (default) every generation lands on the first poll, ~1.5s after it was
// created; each extra poll adds 5s.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ensureAssets, IMAGE_COUNT, VIDEO_COUNT, AUDIO_COUNT } from './assets.mjs'
import { answerChat } from './fakeChat.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const FAKE_HOST = 'fake.kie.test'
const FAKE = `https://${FAKE_HOST}`

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '600',
}

// ── Media ──────────────────────────────────────────────────────────────────

function loadMedia(dir) {
  const read = (p) => fs.readFileSync(path.join(dir, p))
  const media = {
    img: Array.from({ length: IMAGE_COUNT }, (_, i) => read(`img/${i + 1}.png`)),
    vid: Array.from({ length: VIDEO_COUNT }, (_, i) => read(`vid/${i + 1}.webm`)),
    aud: Array.from({ length: AUDIO_COUNT }, (_, i) => read(`aud/${i + 1}.wav`)),
    misc: {
      'product.png': read('product.png'),
      'character.png': read('character.png'),
      'avatar.png': read('avatar.png'),
    },
    fonts: new Map(),
  }
  const fontDir = path.join(dir, 'fonts')
  if (fs.existsSync(fontDir)) for (const f of fs.readdirSync(fontDir)) media.fonts.set(f, fs.readFileSync(path.join(fontDir, f)))
  return media
}

// Serve bytes, honouring a single Range (Outliers downloads in ranged windows,
// and <video> elements ask for ranges too).
function serveBytes(route, request, body, contentType) {
  const range = request.headers()['range']
  const m = range && /bytes=(\d+)-(\d*)/.exec(range)
  if (m) {
    const start = Number(m[1])
    if (start >= body.length) {
      return route.fulfill({ status: 416, headers: { ...CORS, 'content-range': `bytes */${body.length}` }, body: '' })
    }
    const end = Math.min(m[2] ? Number(m[2]) : body.length - 1, body.length - 1)
    return route.fulfill({
      status: 206,
      headers: { ...CORS, 'content-type': contentType, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` },
      body: body.subarray(start, end + 1),
    })
  }
  return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': contentType, 'accept-ranges': 'bytes', 'cache-control': 'max-age=3600' }, body })
}

const json = (route, obj, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(obj) })

const ok = (route, data) => json(route, { code: 200, msg: 'success', data })

// ── Chat message normalisation (all transports → one shape) ────────────────

function partText(p) {
  if (!p || typeof p !== 'object') return ''
  if (typeof p.text === 'string') return p.text
  return ''
}

function isImagePart(p) {
  return p && typeof p === 'object' && /image/.test(String(p.type ?? ''))
}

function norm(role, content) {
  if (typeof content === 'string') return { role, text: content, images: 0 }
  const parts = Array.isArray(content) ? content : []
  return { role, text: parts.map(partText).filter(Boolean).join('\n'), images: parts.filter(isImagePart).length }
}

export function normaliseMessages(body, transport) {
  const msgs = []
  if (transport === 'claude-messages' && body.system) msgs.push(norm('system', body.system))
  const list = transport === 'openai-responses' ? body.input : body.messages
  for (const m of Array.isArray(list) ? list : []) msgs.push(norm(m.role, m.content))
  return msgs
}

function chatContext(messages, model, transport) {
  const system = messages.filter((m) => m.role === 'system' || m.role === 'developer').map((m) => m.text).join('\n\n')
  const users = messages.filter((m) => m.role === 'user')
  const user = users[users.length - 1]?.text ?? ''
  const all = messages.map((m) => m.text).join('\n\n')
  return { system, user, all, messages, model, transport }
}

// ── Model → what kind of media a task returns ──────────────────────────────

function taskKind(model, input) {
  if (input && Array.isArray(input.messages)) return 'chat'
  const m = String(model).toLowerCase()
  if (/tts|speech|voice/.test(m)) return 'audio'
  if (/suno|music/.test(m)) return 'audio'
  if (/video|seedance|kling|wan\/|minimax|hailuo|veo|omni|grok-imagine|motion-control|sora|runway|luma/.test(m)) return 'video'
  return 'image'
}

// ── ScrapeCreators fakes ───────────────────────────────────────────────────

const TIKTOK_ADS = [
  { id: '7412000000000000001', handle: 'glowwithmaya', nick: 'Maya | skincare', followers: 18400, views: 2310000, likes: 184000, comments: 2310, shares: 9800, saves: 22100, dur: 23400, desc: 'the serum my derm asked about 😳 #skincare #vitaminc #darkspots #ugc' },
  { id: '7412000000000000002', handle: 'skinbyjess', nick: 'Jess', followers: 52100, views: 1204000, likes: 96400, comments: 1480, shares: 4100, saves: 13900, dur: 31200, desc: 'stop wasting money on orange vitamin c #skintok #serum #fyp' },
  { id: '7412000000000000003', handle: 'deinfluencedaily', nick: 'De-Influence Daily', followers: 9100, views: 870000, likes: 61200, comments: 990, shares: 3300, saves: 8800, dur: 18900, desc: 'de-influencing the $80 serum, this one is $30 #deinfluencing #skincare' },
  { id: '7412000000000000004', handle: 'morningwithtara', nick: 'Tara ☀️', followers: 124000, views: 3480000, likes: 301000, comments: 4200, shares: 15100, saves: 40300, dur: 27500, desc: '90 seconds that replaced my foundation #morningroutine #glowup' },
  { id: '7412000000000000005', handle: 'realskinreviews', nick: 'Real Skin Reviews', followers: 33800, views: 640000, likes: 38900, comments: 740, shares: 1900, saves: 6400, dur: 35100, desc: '3 weeks, no filter, same window light #beforeandafter #vitaminc' },
]

function tiktokItem(a, i) {
  const n = (i % IMAGE_COUNT) + 1
  const v = (i % VIDEO_COUNT) + 1
  return {
    aweme_id: a.id,
    desc: a.desc,
    create_time: Math.floor(Date.now() / 1000) - (i + 2) * 86400 * 3,
    url: `https://www.tiktok.com/@${a.handle}/video/${a.id}`,
    is_ad: i % 2 === 0,
    statistics: { play_count: a.views, digg_count: a.likes, comment_count: a.comments, share_count: a.shares, collect_count: a.saves },
    video: {
      duration: a.dur,
      cover: { url_list: [`${FAKE}/img/${n}.png`] },
      origin_cover: { url_list: [`${FAKE}/img/${n}.png`] },
      play_addr: { url_list: [`${FAKE}/vid/${v}.mp4`] },
      download_no_watermark_addr: { url_list: [`${FAKE}/vid/${v}.mp4`] },
    },
    author: { unique_id: a.handle, nickname: a.nick, follower_count: a.followers, avatar_thumb: { url_list: [`${FAKE}/misc/avatar.png`] } },
  }
}

function metaItem(a, i) {
  const n = (i % IMAGE_COUNT) + 1
  const v = (i % VIDEO_COUNT) + 1
  return {
    ad_archive_id: `9900000000000${i + 1}`,
    page_id: `55500${i}`,
    page_name: ['GlowLab Skincare', 'Brightside Beauty', 'Dermly', 'Sunkissed Co', 'Pure Ritual'][i % 5],
    is_active: true,
    start_date: Math.floor(Date.now() / 1000) - (i + 1) * 86400 * 11,
    total_active_time: (i + 1) * 86400 * 11,
    publisher_platform: ['facebook', 'instagram'],
    url: `https://www.facebook.com/ads/library/?id=9900000000000${i + 1}`,
    snapshot: {
      body: { text: a.desc.replace(/#\w+/g, '').trim() },
      title: 'Fade dark spots in 3 weeks',
      cta_text: 'Shop Now',
      page_name: ['GlowLab Skincare', 'Brightside Beauty', 'Dermly', 'Sunkissed Co', 'Pure Ritual'][i % 5],
      page_profile_picture_url: `${FAKE}/misc/avatar.png`,
      page_like_count: 12000 + i * 3100,
      display_format: 'VIDEO',
      videos: [{ video_hd_url: `${FAKE}/vid/${v}.mp4`, video_sd_url: `${FAKE}/vid/${v}.mp4`, video_preview_image_url: `${FAKE}/img/${n}.png` }],
    },
  }
}

function instagramReel(a, i) {
  const n = (i % IMAGE_COUNT) + 1
  const v = (i % VIDEO_COUNT) + 1
  return {
    id: `31${i}00000000000`,
    shortcode: `CstubReel${i + 1}`,
    url: `https://www.instagram.com/reel/CstubReel${i + 1}/`,
    caption: a.desc,
    thumbnail_src: `${FAKE}/img/${n}.png`,
    display_url: `${FAKE}/img/${n}.png`,
    video_url: `${FAKE}/vid/${v}.mp4`,
    is_video: true,
    video_duration: a.dur / 1000,
    taken_at: new Date(Date.now() - (i + 2) * 86400 * 5 * 1000).toISOString(),
    like_count: a.likes,
    comment_count: a.comments,
    video_play_count: a.views,
    owner: { id: `77${i}`, username: a.handle, full_name: a.nick, profile_pic_url: `${FAKE}/misc/avatar.png`, follower_count: a.followers },
  }
}

const TRANSCRIPT_VTT = `WEBVTT

00:00:00.000 --> 00:00:03.200
Okay I need to talk about the serum that made my dermatologist ask what I changed.

00:00:03.200 --> 00:00:07.000
I have had these dark spots since my twenties and nothing touched them.

00:00:07.000 --> 00:00:11.000
This one is twenty percent vitamin C in a dark bottle so it does not go orange.

00:00:11.000 --> 00:00:14.000
Two drops every morning under sunscreen, that is it.

00:00:14.000 --> 00:00:18.000
Four weeks later, look at my cheek. No filter.

00:00:18.000 --> 00:00:21.000
It is on sale right now, the link is below, go.
`

// ── installStub ────────────────────────────────────────────────────────────

/**
 * @param target  a Playwright Page or BrowserContext (anything with .route)
 * @param opts
 *   pollsBeforeSuccess  recordInfo answers 'generating' this many times first (default 0)
 *   minTaskMs           and never succeeds sooner than this after createTask (default 0)
 *   chatDelayMs         latency added to every chat completion (default 300)
 *   credits             kie balance (default 50000)
 *   scrapeCredits       ScrapeCreators credits_remaining (default 4321)
 *   failTask(info)      return a string to fail that task with that failMsg
 *                       (info = { kind, model, input, taskId }); default never
 *   verbose             log every intercepted call and every poll
 *   quiet               log only UNHANDLED requests and handler errors
 *   log                 logger (default console.log with a [stub] prefix)
 */
export async function installStub(target, opts = {}) {
  const {
    pollsBeforeSuccess = 0,
    minTaskMs = 0,
    chatDelayMs = 300,
    credits = 50000,
    scrapeCredits = 4321,
    failTask = () => null,
    verbose = false,
    quiet = false,
    log: userLog,
  } = opts
  const always = userLog ?? ((...a) => console.log('[stub]', ...a))
  // `quiet` keeps only UNHANDLED and handler errors; `verbose` adds every
  // call and every poll.
  const log = quiet ? () => {} : always
  const media = loadMedia(await ensureAssets())

  const tasks = new Map()
  const uploads = new Map()
  const counters = { image: 0, video: 0, audio: 0 }
  const stats = { createTask: {}, recordInfo: 0, chat: {}, uploads: 0, media: 0, scrape: {}, fonts: 0, placeholders: 0, other: {} }
  const unhandled = []
  const calls = []
  const bump = (bucket, key) => { bucket[key] = (bucket[key] ?? 0) + 1 }

  const nextUrl = (kind) => {
    const n = counters[kind]++
    if (kind === 'image') return `${FAKE}/img/${(n % IMAGE_COUNT) + 1}.png`
    if (kind === 'video') return `${FAKE}/vid/${(n % VIDEO_COUNT) + 1}.mp4`
    return `${FAKE}/aud/${(n % AUDIO_COUNT) + 1}.wav`
  }

  const newTaskId = (kind) => `stub-${kind}-${crypto.randomBytes(6).toString('hex')}`

  function createStubTask(model, input, source = 'jobs') {
    const kind = taskKind(model, input)
    const taskId = newTaskId(kind)
    const task = { taskId, model, kind, input, source, createdAt: Date.now(), polls: 0 }
    if (kind === 'chat') {
      const ctx = chatContext(normaliseMessages(input, 'openai-chat'), model, 'jobs')
      const { name, text } = answerChat(ctx)
      task.responder = name
      task.text = text
      bump(stats.chat, `${name} (job)`)
    } else {
      task.url = nextUrl(kind)
    }
    task.failMsg = failTask({ kind, model, input, taskId }) || null
    tasks.set(taskId, task)
    bump(stats.createTask, `${kind}:${model}`)
    log(`createTask ${kind} ${model} → ${taskId}${task.responder ? ` [${task.responder}]` : ''}${task.failMsg ? ' (will FAIL)' : ''}`)
    return task
  }

  // A task this stub never created (a handle persisted by an earlier browser
  // session): rebuild a plausible media result from the id's kind prefix.
  function adoptTask(taskId) {
    const kind = /^stub-(image|video|audio)-/.exec(taskId)?.[1]
    if (!kind) return null
    const task = { taskId, model: 'unknown', kind, input: {}, createdAt: 0, polls: pollsBeforeSuccess, url: nextUrl(kind) }
    tasks.set(taskId, task)
    return task
  }

  function record(task) {
    const done = task.polls >= pollsBeforeSuccess && Date.now() - task.createdAt >= minTaskMs
    task.polls++
    const now = Date.now()
    let resultJson = ''
    if (done && !task.failMsg) {
      resultJson = task.kind === 'chat'
        ? JSON.stringify({ id: `chatcmpl-${task.taskId}`, object: 'chat.completion', model: task.model, choices: [{ index: 0, message: { role: 'assistant', content: task.text }, finish_reason: 'stop' }] })
        : JSON.stringify({ resultUrls: [task.url] })
    }
    return {
      taskId: task.taskId,
      model: task.model,
      state: done ? (task.failMsg ? 'fail' : 'success') : 'generating',
      param: JSON.stringify({ model: task.model }).slice(0, 200),
      resultJson,
      failCode: done && task.failMsg ? '500' : '',
      failMsg: done && task.failMsg ? task.failMsg : '',
      costTime: done ? now - task.createdAt : 0,
      completeTime: done ? now : 0,
      createTime: task.createdAt,
      updateTime: now,
      progress: done ? 100 : Math.min(90, 30 * task.polls),
    }
  }

  // ── kie chat ────────────────────────────────────────────────────────────

  async function chat(route, request, transport) {
    const body = request.postDataJSON() ?? {}
    const url = new URL(request.url())
    const model = transport === 'openai-chat' ? url.pathname.split('/')[1] : body.model
    const ctx = chatContext(normaliseMessages(body, transport), model, transport)
    const { name, text } = answerChat(ctx)
    bump(stats.chat, name)
    log(`chat ${transport} ${model} → [${name}] ${text.length} chars`)
    if (chatDelayMs) await new Promise((r) => setTimeout(r, chatDelayMs))

    if (transport === 'claude-messages') {
      return json(route, { id: `msg_stub_${Date.now()}`, type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: text.length / 4 } })
    }
    if (transport === 'openai-responses') {
      return json(route, { id: `resp_stub_${Date.now()}`, object: 'response', status: 'completed', model, output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] })
    }
    if (body.stream) {
      const chunks = []
      for (let i = 0; i < text.length; i += 160) chunks.push(text.slice(i, i + 160))
      const events = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`)
      events.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`, 'data: [DONE]\n\n')
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: events.join('') })
    }
    return json(route, { id: `chatcmpl-stub`, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] })
  }

  // ── Hosts ───────────────────────────────────────────────────────────────

  async function kieApi(route, request, url) {
    const p = url.pathname
    const method = request.method()
    if (p === '/api/v1/jobs/createTask' && method === 'POST') {
      const body = request.postDataJSON() ?? {}
      const task = createStubTask(body.model, body.input)
      return ok(route, { taskId: task.taskId })
    }
    if (p === '/api/v1/jobs/recordInfo') {
      stats.recordInfo++
      const id = url.searchParams.get('taskId')
      const task = tasks.get(id) ?? adoptTask(id)
      if (!task) return json(route, { code: 422, msg: `recordInfo: task ${id} not found (stub)`, data: null })
      const rec = record(task)
      if (verbose || rec.state === 'fail') log(`recordInfo ${id} → ${rec.state}`)
      return ok(route, rec)
    }
    if (p === '/api/v1/chat/credit') return ok(route, credits)

    // Legacy Veo (only resumed, never created by the current registry).
    if (p === '/api/v1/veo/generate') return ok(route, { taskId: createStubTask('veo3_fast', {}, 'veo').taskId })
    if (p === '/api/v1/veo/record-info') {
      const task = tasks.get(url.searchParams.get('taskId')) ?? adoptTask(url.searchParams.get('taskId')) ?? createStubTask('veo3_fast', {}, 'veo')
      return ok(route, { taskId: task.taskId, successFlag: 1, state: 'success', response: { resultUrls: [task.url ?? nextUrl('video')], resolution: '720p' } })
    }
    // Suno
    if (p === '/api/v1/generate' && method === 'POST') {
      const body = request.postDataJSON() ?? {}
      const task = createStubTask(body.model ?? 'suno', { prompt: body.prompt }, 'suno')
      task.kind = 'audio'
      task.url ??= nextUrl('audio')
      return ok(route, { taskId: task.taskId })
    }
    if (p === '/api/v1/generate/record-info') {
      const id = url.searchParams.get('taskId')
      const task = tasks.get(id) ?? { taskId: id, url: nextUrl('audio') }
      return ok(route, {
        taskId: id,
        status: 'SUCCESS',
        response: {
          sunoData: [
            { id: `${id}-a`, audioUrl: task.url, imageUrl: `${FAKE}/img/6.png`, title: 'Morning Glow (stub)', tags: 'lofi, pop', duration: 3.5 },
            { id: `${id}-b`, audioUrl: nextUrl('audio'), imageUrl: `${FAKE}/img/7.png`, title: 'Morning Glow v2 (stub)', tags: 'lofi, pop', duration: 4 },
          ],
        },
      })
    }
    // Gemini Omni persistent ids
    if (p === '/api/v1/omni/audio/create') return ok(route, { kieAudioId: `stub-audio-id-${crypto.randomBytes(4).toString('hex')}`, name: 'Stub Voice' })
    if (p === '/api/v1/omni/character/create') return ok(route, { characterId: `stub-char-id-${crypto.randomBytes(4).toString('hex')}`, characterName: 'Stub Character' })

    // Chat transports
    if (p.endsWith('/v1/chat/completions')) return chat(route, request, 'openai-chat')
    if (p === '/claude/v1/messages') return chat(route, request, 'claude-messages')
    if (p.endsWith('/v1/responses')) return chat(route, request, 'openai-responses')
    return null
  }

  function storeUpload(bytes, mime, fileName) {
    const id = crypto.randomBytes(6).toString('hex')
    const name = (fileName || `file.${(mime.split('/')[1] || 'bin').split(';')[0]}`).replace(/[^\w.-]/g, '_')
    uploads.set(id, { bytes, mime })
    stats.uploads++
    return { fileName: name, filePath: `ugc-lab/${name}`, downloadUrl: `${FAKE}/upload/${id}/${name}`, fileSize: bytes.length, mimeType: mime }
  }

  async function uploadHost(route, request, url) {
    const p = url.pathname
    if (p === '/api/file-base64-upload') {
      const body = request.postDataJSON() ?? {}
      const raw = String(body.base64Data ?? '')
      const m = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(raw)
      const mime = m?.[1] || 'application/octet-stream'
      const bytes = Buffer.from(m ? m[2] : raw, 'base64')
      const data = storeUpload(bytes, mime, body.fileName)
      log(`upload base64 ${mime} ${bytes.length}B → ${data.downloadUrl}`)
      return ok(route, data)
    }
    if (p === '/api/file-stream-upload') {
      const buf = request.postDataBuffer() ?? Buffer.alloc(0)
      return ok(route, storeUpload(buf, 'application/octet-stream', 'stream.bin'))
    }
    if (p === '/api/file-url-upload') {
      const body = request.postDataJSON() ?? {}
      return ok(route, { fileName: 'remote', filePath: 'ugc-lab/remote', downloadUrl: body.fileUrl ?? `${FAKE}/img/1.png`, fileSize: 0, mimeType: 'application/octet-stream' })
    }
    return null
  }

  async function fakeMedia(route, request, url) {
    const [, kind, a, b] = url.pathname.split('/')
    stats.media++
    const n = (s) => Math.max(1, parseInt(s, 10) || 1)
    if (kind === 'img') return serveBytes(route, request, media.img[(n(a) - 1) % IMAGE_COUNT], 'image/png')
    if (kind === 'vid') return serveBytes(route, request, media.vid[(n(a) - 1) % VIDEO_COUNT], 'video/webm')
    if (kind === 'aud') return serveBytes(route, request, media.aud[(n(a) - 1) % AUDIO_COUNT], 'audio/wav')
    if (kind === 'misc' && media.misc[a]) return serveBytes(route, request, media.misc[a], 'image/png')
    if (kind === 'upload' && uploads.has(a)) {
      const u = uploads.get(a)
      return serveBytes(route, request, u.bytes, u.mime)
    }
    void b
    return json(route, { error: 'stub media not found' }, 404)
  }

  async function scrapeCreators(route, request, url) {
    const p = url.pathname
    bump(stats.scrape, p)
    log(`scrapecreators ${p}${url.search}`)
    const base = { success: true, credits_remaining: scrapeCredits }
    if (p === '/v1/tiktok/search/keyword') return json(route, { ...base, search_item_list: TIKTOK_ADS.map(tiktokItem), cursor: TIKTOK_ADS.length })
    if (p === '/v1/facebook/adLibrary/search/ads') return json(route, { ...base, searchResults: TIKTOK_ADS.map(metaItem), cursor: null })
    if (p === '/v2/instagram/reels/search') return json(route, { ...base, reels: TIKTOK_ADS.map(instagramReel) })
    if (p === '/v2/tiktok/video') {
      const id = url.searchParams.get('video_id') ?? /video\/(\d+)/.exec(url.searchParams.get('url') ?? '')?.[1]
      const i = Math.max(0, TIKTOK_ADS.findIndex((a) => a.id === id))
      return json(route, { ...base, aweme_detail: tiktokItem(TIKTOK_ADS[i], i) })
    }
    if (p === '/v1/facebook/adLibrary/ad') return json(route, { ...base, ...metaItem(TIKTOK_ADS[0], 0) })
    if (p === '/v1/instagram/post') return json(route, { ...base, data: { xdt_shortcode_media: { video_url: `${FAKE}/vid/1.mp4`, display_url: `${FAKE}/img/1.png`, thumbnail_src: `${FAKE}/img/1.png`, video_duration: 23.4, is_video: true } } })
    if (p === '/v1/instagram/profile') {
      return json(route, { ...base, data: { user: { id: '770', username: url.searchParams.get('handle') ?? 'glowwithmaya', full_name: 'Maya | skincare', biography: 'skincare that actually works', profile_pic_url: `${FAKE}/misc/avatar.png`, edge_followed_by: { count: 18400 }, edge_follow: { count: 310 }, edge_owner_to_timeline_media: { count: 212 } } } })
    }
    if (p === '/v1/instagram/user/reels') {
      return json(route, { ...base, items: TIKTOK_ADS.map((a, i) => ({ media: { ...instagramReel(a, i), code: `CstubReel${i + 1}`, pk: `31${i}00000000000`, play_count: a.views, image_versions2: { candidates: [{ url: `${FAKE}/img/${(i % IMAGE_COUNT) + 1}.png` }] }, video_versions: [{ url: `${FAKE}/vid/${(i % VIDEO_COUNT) + 1}.mp4` }] } })), paging_info: { more_available: false } })
    }
    if (p === '/v1/tiktok/video/transcript') return json(route, { ...base, transcript: TRANSCRIPT_VTT })
    if (p === '/v1/facebook/adLibrary/ad/transcript') return json(route, { ...base, data: { transcript: TRANSCRIPT_VTT, transcript_available: true } })
    if (p === '/v2/instagram/media/transcript') return json(route, { ...base, transcripts: [{ id: '1', shortcode: 'CstubReel1', text: TRANSCRIPT_VTT.replace(/^WEBVTT\s+/, '').replace(/^\d\d:.*$/gm, '').replace(/\n{2,}/g, '\n').trim() }] })
    return json(route, { success: false, message: `stub: no fake for ${p}` }, 404)
  }

  async function fonts(route, request, url) {
    stats.fonts++
    if (url.hostname === 'fonts.googleapis.com') {
      const css = media.fonts.get('fonts.css')?.toString('utf8') ?? ''
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/css' }, body: css })
    }
    const file = url.pathname.replace(/^\//, '').replace(/\//g, '_')
    const bytes = media.fonts.get(file)
    if (bytes) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'font/woff2', 'cache-control': 'max-age=86400' }, body: bytes })
    return route.fulfill({ status: 404, headers: CORS, body: '' })
  }

  const HANDLERS = [
    { host: 'api.kie.ai', fn: kieApi },
    { host: 'kieai.redpandaai.co', fn: uploadHost },
    { host: FAKE_HOST, fn: fakeMedia },
    { host: 'api.scrapecreators.com', fn: scrapeCreators },
    { host: 'fonts.googleapis.com', fn: fonts },
    { host: 'fonts.gstatic.com', fn: fonts },
  ]

  const isLocal = (u) => u.protocol === 'data:' || u.protocol === 'blob:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)

  await target.route((u) => !isLocal(u), async (route, request) => {
    const url = new URL(request.url())
    const method = request.method()
    calls.push({ at: Date.now(), method, url: request.url().slice(0, 200) })
    try {
      if (method === 'OPTIONS') return await route.fulfill({ status: 204, headers: CORS, body: '' })
      const h = HANDLERS.find((x) => x.host === url.hostname)
      if (h) {
        if (verbose) log(method, url.hostname + url.pathname)
        const done = await h.fn(route, request, url)
        if (done !== null) return
      }
      // Unknown host (or a path the handler doesn't know).
      if (request.resourceType() === 'image') {
        stats.placeholders++
        if (!stats.other[url.hostname]) log(`placeholder images for ${url.hostname} (logged once per host)`)
        bump(stats.other, url.hostname)
        return await serveBytes(route, request, media.img[0], 'image/png')
      }
      unhandled.push(`${method} ${request.url()}`)
      always(`UNHANDLED ${method} ${request.url()}`)
      return await json(route, { code: 404, msg: 'stub: unhandled request', url: request.url() }, 404)
    } catch (err) {
      always(`handler error for ${method} ${request.url()}: ${err?.stack ?? err}`)
      try { await json(route, { code: 500, msg: `stub error: ${err?.message ?? err}` }, 500) } catch { /* route already handled */ }
    }
  })

  return {
    tasks,
    uploads,
    stats,
    unhandled,
    calls,
    summary() {
      const lines = []
      lines.push(`outbound calls intercepted: ${calls.length}`)
      lines.push(`createTask: ${JSON.stringify(stats.createTask)}`)
      lines.push(`recordInfo polls: ${stats.recordInfo}`)
      lines.push(`chat responders: ${JSON.stringify(stats.chat)}`)
      lines.push(`uploads: ${stats.uploads}, media served: ${stats.media}, fonts: ${stats.fonts}, placeholder images: ${stats.placeholders}`)
      if (Object.keys(stats.scrape).length) lines.push(`scrapecreators: ${JSON.stringify(stats.scrape)}`)
      lines.push(`UNHANDLED: ${unhandled.length ? `\n  ${unhandled.join('\n  ')}` : 'none'}`)
      return lines.join('\n')
    },
  }
}

export { HERE as STUB_DIR }
