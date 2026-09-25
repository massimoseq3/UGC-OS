// Fake media for the kie.ai stub, generated once into ./assets and reused.
//
//   assets/img/<n>.png      9:16 stills (720x1280), numbered, one hue each — what
//                           every image model "returns" (stills, portraits, Playground)
//   assets/vid/<n>.webm     3s 360x640 VP8 clips with a moving dot + "Clip #n" —
//                           what every video model "returns". WebM, not MP4: the
//                           Playwright Chromium build has no H.264 decoder, and the
//                           app's probeVideoBlob() rejects a clip the <video> element
//                           can't decode. Served as video/webm under a .mp4 URL.
//   assets/aud/<n>.wav      ~3s 24kHz mono tone "speech" — what TTS / Suno "return"
//   assets/product.png      a drawn amber dropper bottle ("GlowSerum Vitamin C")
//   assets/character.png    a drawn portrait ("Maya") for the seeded Character
//   assets/avatar.png       small square avatar for ScrapeCreators authors
//
// Images and video frames are drawn with the browser's canvas (no PIL here);
// frames are piped as JPEGs into Playwright's own ffmpeg (VP8 + WebM only).
//
// Delete ./assets to regenerate.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = path.join(HERE, 'assets')
export const CHROME = findChrome()
// Paths match the Claude Code cloud container; set these to run elsewhere.
const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'

export const IMAGE_COUNT = 8
export const VIDEO_COUNT = 4
export const AUDIO_COUNT = 3

const HUES = [
  ['#FF8A5B', '#C2185B'], ['#4FACFE', '#0052D4'], ['#43E97B', '#11998E'], ['#F7971E', '#FF4E50'],
  ['#A18CD1', '#5B247A'], ['#F6D365', '#E0851A'], ['#30CFD0', '#330867'], ['#FDA085', '#8E2DE2'],
]

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const root = '/opt/pw-browsers'
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort() : []
  for (const d of dirs.reverse()) {
    const p = path.join(root, d, 'chrome-linux', 'chrome')
    if (fs.existsSync(p)) return p
  }
  return '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
}

function wav({ seconds = 3, rate = 24000, base = 180 } = {}) {
  // A "speaking" tone: syllable-shaped bursts of a vowel-ish harmonic stack, so
  // the app's audio scrubber shows something that moves.
  const n = Math.floor(seconds * rate)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const syllable = Math.max(0, Math.sin(Math.PI * ((t * 4.2) % 1))) ** 1.5
    const pitch = base * (1 + 0.08 * Math.sin(t * 2.1))
    const s = (Math.sin(2 * Math.PI * pitch * t) + 0.5 * Math.sin(4 * Math.PI * pitch * t) + 0.25 * Math.sin(6 * Math.PI * pitch * t)) / 1.75
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.05)
    data.writeInt16LE(Math.round(s * syllable * fade * 0.55 * 32767), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

// Everything drawn in the page lives in this one function (serialised into it).
function drawKit() {
  window.__draw = {
    still(n, from, to, w = 720, h = 1280, sub = 'stub still · kie.ai fake') {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, from); grad.addColorStop(1, to)
      g.fillStyle = grad; g.fillRect(0, 0, w, h)
      // soft shapes so it reads as a "photo" rather than a flat card
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.03})`
        g.beginPath(); g.arc((w * ((i * 37 + n * 13) % 100)) / 100, (h * ((i * 53 + n * 29) % 100)) / 100, w * (0.12 + (i % 4) * 0.06), 0, Math.PI * 2); g.fill()
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h * 0.78, w, h * 0.22)
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.95)'
      g.font = `700 ${Math.round(w * 0.32)}px sans-serif`; g.fillText(`#${n}`, w / 2, h * 0.42)
      g.font = `600 ${Math.round(w * 0.05)}px sans-serif`; g.fillText(sub, w / 2, h * 0.86)
      return c
    },
    product() {
      const w = 1024, h = 1024
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d')
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#FFE8D6'); bg.addColorStop(1, '#F9C9A5')
      g.fillStyle = bg; g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(512, 900, 230, 40, 0, 0, Math.PI * 2); g.fill()
      // bottle body
      const body = g.createLinearGradient(330, 0, 700, 0); body.addColorStop(0, '#A8570F'); body.addColorStop(0.45, '#E08A2E'); body.addColorStop(1, '#8A4308')
      g.fillStyle = body; g.beginPath(); g.roundRect(330, 360, 364, 540, 60); g.fill()
      g.fillStyle = body; g.fillRect(430, 300, 164, 80)
      // dropper
      g.fillStyle = '#1E1E1E'; g.beginPath(); g.roundRect(415, 200, 194, 110, 20); g.fill()
      g.fillStyle = '#2B2B2B'; g.beginPath(); g.roundRect(465, 90, 94, 130, 40); g.fill()
      // label
      g.fillStyle = '#FFF8EE'; g.beginPath(); g.roundRect(360, 500, 304, 300, 18); g.fill()
      g.textAlign = 'center'; g.fillStyle = '#C2410C'; g.font = '700 64px sans-serif'; g.fillText('GLOW', 512, 585)
      g.fillStyle = '#7C2D12'; g.font = '600 40px sans-serif'; g.fillText('SERUM', 512, 635)
      g.fillStyle = '#9A3412'; g.font = '500 30px sans-serif'; g.fillText('Vitamin C 20%', 512, 700)
      g.font = '400 24px sans-serif'; g.fillText('30 ml · 1 fl oz', 512, 750)
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(360, 380, 26, 480)
      return c
    },
    portrait() {
      const w = 720, h = 1280
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d')
      const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#F3E7E9'); bg.addColorStop(1, '#C9B6E4')
      g.fillStyle = bg; g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(470, 120, 180, 420) // window
      // shoulders / sweater
      g.fillStyle = '#EDE0C8'; g.beginPath(); g.ellipse(360, 1180, 330, 300, 0, Math.PI, 0); g.fill()
      // neck
      g.fillStyle = '#C98E6B'; g.fillRect(315, 760, 90, 140)
      // hair back
      g.fillStyle = '#3B2417'; g.beginPath(); g.ellipse(360, 600, 210, 290, 0, 0, Math.PI * 2); g.fill()
      // face
      g.fillStyle = '#D9A07E'; g.beginPath(); g.ellipse(360, 580, 150, 190, 0, 0, Math.PI * 2); g.fill()
      // fringe
      g.fillStyle = '#3B2417'; g.beginPath(); g.ellipse(360, 440, 170, 90, 0, Math.PI, 0); g.fill()
      // eyes, brows, mouth
      g.fillStyle = '#2A1A12'; g.beginPath(); g.ellipse(305, 575, 14, 9, 0, 0, Math.PI * 2); g.ellipse(415, 575, 14, 9, 0, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#2A1A12'; g.lineWidth = 7; g.beginPath(); g.moveTo(280, 540); g.lineTo(330, 535); g.moveTo(390, 535); g.lineTo(440, 540); g.stroke()
      g.strokeStyle = '#A5423F'; g.lineWidth = 8; g.beginPath(); g.arc(360, 660, 45, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke()
      g.textAlign = 'center'; g.fillStyle = 'rgba(40,20,60,0.75)'; g.font = '600 44px sans-serif'; g.fillText('Maya · stub character', 360, 1230)
      return c
    },
    avatar(n, from, to) {
      const c = document.createElement('canvas'); c.width = 200; c.height = 200
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, 200, 200); grad.addColorStop(0, from); grad.addColorStop(1, to)
      g.fillStyle = grad; g.fillRect(0, 0, 200, 200)
      g.fillStyle = 'white'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 90px sans-serif'; g.fillText(String.fromCharCode(64 + n), 100, 105)
      return c
    },
    frame(n, i, total, from, to, w = 360, h = 640) {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, from); grad.addColorStop(1, to)
      g.fillStyle = grad; g.fillRect(0, 0, w, h)
      const t = i / total
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(w * (0.15 + 0.7 * t), h * (0.35 + 0.1 * Math.sin(t * Math.PI * 2)), 34, 0, Math.PI * 2); g.fill()
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'white'
      g.font = '700 64px sans-serif'; g.fillText(`Clip #${n}`, w / 2, h * 0.6)
      g.font = '500 22px sans-serif'; g.fillText(`stub video · 00:0${Math.floor((i / total) * 3)}`, w / 2, h * 0.68)
      return c
    },
  }
}

async function canvasBytes(page, expr, type = 'image/png', quality) {
  const b64 = await page.evaluate(async ([expr, type, quality]) => {
    const c = new Function(`return ${expr}`)()
    return c.toDataURL(type, quality).split(',')[1]
  }, [expr, type, quality])
  return Buffer.from(b64, 'base64')
}

function encodeWebm(jpegs, out, fps = 12) {
  // Frames go through a temp file rather than stdin: Playwright's trimmed
  // ffmpeg build closed the pipe early (EPIPE) when fed on stdin.
  const tmp = `${out}.mjpeg`
  fs.writeFileSync(tmp, Buffer.concat(jpegs))
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-y', '-nostdin', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', tmp, '-c:v', 'libvpx', '-b:v', '600k', '-pix_fmt', 'yuv420p', '-f', 'webm', out])
    let err = ''
    ff.stderr.on('data', (d) => { err += d })
    ff.on('close', (code) => {
      fs.rmSync(tmp, { force: true })
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))
    })
  })
}

function complete() {
  const need = [
    ...Array.from({ length: IMAGE_COUNT }, (_, i) => `img/${i + 1}.png`),
    ...Array.from({ length: VIDEO_COUNT }, (_, i) => `vid/${i + 1}.webm`),
    ...Array.from({ length: AUDIO_COUNT }, (_, i) => `aud/${i + 1}.wav`),
    'product.png', 'character.png', 'avatar.png',
  ]
  return need.every((f) => fs.existsSync(path.join(ASSET_DIR, f)))
}

export async function ensureAssets({ force = false } = {}) {
  if (!force && complete()) return ASSET_DIR
  for (const d of ['img', 'vid', 'aud']) fs.mkdirSync(path.join(ASSET_DIR, d), { recursive: true })
  for (let i = 1; i <= AUDIO_COUNT; i++) fs.writeFileSync(path.join(ASSET_DIR, `aud/${i}.wav`), wav({ seconds: 3 + i * 0.5, base: 150 + i * 30 }))

  const browser = await chromium.launch({ executablePath: CHROME })
  try {
    const page = await browser.newPage()
    await page.setContent('<html><body></body></html>')
    await page.evaluate(`(${drawKit.toString()})()`)
    for (let i = 1; i <= IMAGE_COUNT; i++) {
      const [a, b] = HUES[(i - 1) % HUES.length]
      fs.writeFileSync(path.join(ASSET_DIR, `img/${i}.png`), await canvasBytes(page, `window.__draw.still(${i}, '${a}', '${b}')`))
    }
    fs.writeFileSync(path.join(ASSET_DIR, 'product.png'), await canvasBytes(page, 'window.__draw.product()'))
    fs.writeFileSync(path.join(ASSET_DIR, 'character.png'), await canvasBytes(page, 'window.__draw.portrait()'))
    fs.writeFileSync(path.join(ASSET_DIR, 'avatar.png'), await canvasBytes(page, `window.__draw.avatar(3, '#FF8A5B', '#C2185B')`))
    const FRAMES = 36
    for (let n = 1; n <= VIDEO_COUNT; n++) {
      const [a, b] = HUES[(n + 2) % HUES.length]
      const jpegs = []
      for (let i = 0; i < FRAMES; i++) jpegs.push(await canvasBytes(page, `window.__draw.frame(${n}, ${i}, ${FRAMES}, '${a}', '${b}')`, 'image/jpeg', 0.85))
      await encodeWebm(jpegs, path.join(ASSET_DIR, `vid/${n}.webm`))
    }
  } finally {
    await browser.close()
  }
  return ASSET_DIR
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = await ensureAssets({ force: process.argv.includes('--force') })
  console.log('assets ready in', dir)
  for (const d of ['img', 'vid', 'aud']) console.log(d, fs.readdirSync(path.join(dir, d)).map((f) => `${f}:${fs.statSync(path.join(dir, d, f)).size}`).join(' '))
}
