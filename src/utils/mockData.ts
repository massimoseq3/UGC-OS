// Dev-only demo-data seeder. Behind a subtle, admin-only control in Settings.
// Populates every bank + the history streams (Influencers, Scripts, B-Roll
// Gallery, Playground) with realistic-looking placeholder content so the UI can
// be reviewed without burning kie.ai credits. All generated images are local
// canvas placeholders (gradients + labels) saved as normal assets, so they
// render exactly like real generations.
//
// Every created row's id is recorded in a localStorage manifest so the same
// control can cleanly remove the demo data afterwards.

import { useBankStore } from '../stores/bankStore'
import { useAppStore } from '../stores/appStore'
import { saveAsset } from './assetStore'
import type {
  CharacterHistoryItem,
  ScriptHistoryItem,
  ImageHistoryItem,
} from '../stores/types'

const MANIFEST_KEY = 'ugc-os:mock-data-manifest'

interface Manifest {
  products: string[]
  models: string[]
  scripts: string[]
  voices: string[]
  brolls: string[]
  characterHistory: string[]
  scriptHistory: string[]
  imageHistory: string[]
}

const EMPTY_MANIFEST: Manifest = {
  products: [], models: [], scripts: [], voices: [], brolls: [],
  characterHistory: [], scriptHistory: [], imageHistory: [],
}

export function hasMockData(): boolean {
  try { return !!localStorage.getItem(MANIFEST_KEY) } catch { return false }
}

function readManifest(): Manifest | null {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    if (!raw) return null
    return { ...EMPTY_MANIFEST, ...JSON.parse(raw) }
  } catch { return null }
}

// ── Placeholder image generation ──────────────────────────────────────────

// Draw a gradient card with a centered label (and optional sub-label) and save
// it as a PNG asset. Returns the asset:// ref. Stands in for a real generation.
async function makeImageAsset(opts: {
  w: number; h: number; from: string; to: string; label: string; sub?: string
}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = opts.w
  canvas.height = opts.h
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, opts.w, opts.h)
  grad.addColorStop(0, opts.from)
  grad.addColorStop(1, opts.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, opts.w, opts.h)

  // Subtle vignette so the label reads on any gradient.
  const vign = ctx.createRadialGradient(opts.w / 2, opts.h / 2, opts.w * 0.2, opts.w / 2, opts.h / 2, opts.w * 0.75)
  vign.addColorStop(0, 'rgba(0,0,0,0)')
  vign.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vign
  ctx.fillRect(0, 0, opts.w, opts.h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const base = Math.min(opts.w, opts.h)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = `600 ${Math.round(base * 0.08)}px system-ui, -apple-system, sans-serif`
  wrapText(ctx, opts.label, opts.w / 2, opts.h / 2, opts.w * 0.82, base * 0.1)
  if (opts.sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `400 ${Math.round(base * 0.045)}px system-ui, sans-serif`
    ctx.fillText(opts.sub, opts.w / 2, opts.h / 2 + base * 0.12)
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  return saveAsset(blob, 'image/png')
}

// Minimal centered word-wrap for the label.
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight))
}

// ── Demo content ────────────────────────────────────────────────────────────

const PRODUCTS = [
  { name: 'Glow Lab Vitamin C Serum', from: '#f59e0b', to: '#ea580c', desc: 'A brightening daily serum with 15% vitamin C and hyaluronic acid.', market: 'Women 24–40 into skincare', pain: 'Dull, uneven skin tone; tired of products that do nothing.', usps: 'Visible glow in 7 days. Non-sticky. Fragrance-free.', benefits: 'Brighter, smoother, more even skin.', offer: '20% off your first bottle', cta: 'Shop the glow' },
  { name: 'FocusBand Sleep Tracker', from: '#6366f1', to: '#0ea5e9', desc: 'A featherweight ring that tracks sleep, HRV, and recovery.', market: 'Busy professionals 28–45', pain: 'Waking up exhausted with no idea why.', usps: '7-day battery. Clinical-grade accuracy. No subscription.', benefits: 'Understand and fix your sleep.', offer: 'Free sizing kit', cta: 'Track your sleep' },
  { name: 'CloudNine Memory Pillow', from: '#10b981', to: '#0d9488', desc: 'An adaptive memory-foam pillow that cradles your neck.', market: 'Side & back sleepers with neck pain', pain: 'Neck pain and tossing all night.', usps: 'Cooling gel layer. Adjustable loft. 100-night trial.', benefits: 'Wake up pain-free and rested.', offer: 'Buy one get one 50% off', cta: 'Sleep better tonight' },
]

const INFLUENCERS = [
  { name: 'Maya Chen', from: '#fb7185', to: '#e11d48', profile: { gender: 'Female', age: '27', ethnicity: 'East Asian', bodyType: 'slim', skinTone: 'fair', eyeColor: 'dark brown', hairColor: 'black', hairStyle: 'long straight', clothingStyle: 'casual streetwear', location: 'sunlit apartment', lighting: 'soft natural window light', expression: 'warm smile', shotType: 'medium close-up', cameraDevice: 'shot on iPhone, photorealistic, UGC selfie' } },
  { name: 'Liam Foster', from: '#38bdf8', to: '#2563eb', profile: { gender: 'Male', age: '32', ethnicity: 'Caucasian', bodyType: 'athletic', skinTone: 'medium', eyeColor: 'blue', hairColor: 'light brown', hairStyle: 'short textured', clothingStyle: 'smart casual', location: 'modern kitchen', lighting: 'bright daylight', expression: 'confident grin', shotType: 'medium shot', cameraDevice: 'shot on iPhone, photorealistic, UGC' } },
  { name: 'Sofia Reyes', from: '#a78bfa', to: '#7c3aed', profile: { gender: 'Female', age: '24', ethnicity: 'Latina', bodyType: 'curvy', skinTone: 'tan', eyeColor: 'hazel', hairColor: 'dark brown', hairStyle: 'wavy shoulder-length', clothingStyle: 'athleisure', location: 'home gym', lighting: 'soft ring light', expression: 'friendly', shotType: 'close-up', cameraDevice: 'shot on iPhone, photorealistic, UGC' } },
]

const VOICES = [
  { label: 'Warm Female VO', voiceName: 'Rachel', gender: 'Female' as const },
  { label: 'Confident Male VO', voiceName: 'Adam', gender: 'Male' as const },
  { label: 'Friendly Female VO', voiceName: 'Bella', gender: 'Female' as const },
]

const SCRIPT_TEXT_1 = `Okay so I almost returned this serum… and now I'm on my third bottle.\n\nMy skin was so dull I'd cake on foundation just to look awake. Nothing worked.\n\nThen I tried this for a week — and people literally asked if I'd been on holiday.\n\nIt's 15% vitamin C, no sticky finish, zero fragrance. I just put it on, glow, done.\n\nThey're doing 20% off right now. Don't sleep on it.`
const SCRIPT_TEXT_2 = `I thought I was just "bad at sleeping." Turns out I had no idea what was actually happening at night.\n\nThis little ring tracks my sleep, recovery, all of it — seven day battery, no subscription.\n\nFirst week it told me my late coffee was wrecking my deep sleep. Cut it. Now I actually wake up rested.\n\nIf you wake up tired for no reason, this is the move.`
const SCENE_PROMPT = `SCENE 1 — A-ROLL CHARACTER: @INFLUENCER talking to camera in a sunlit apartment, holding @PRODUCT, warm natural light, UGC selfie framing.\n\nSCENE 2 — B-ROLL DETAIL: extreme close-up of @PRODUCT, water droplets, soft studio light.\n\nSCENE 3 — A-ROLL PRODUCT: @INFLUENCER applying @PRODUCT in a mirror, satisfied expression.`

const BROLLS = [
  { from: '#f59e0b', to: '#b45309', prompt: 'Close-up of a glass serum bottle on a marble counter, morning light, water droplets, photorealistic.' },
  { from: '#6366f1', to: '#1e3a8a', prompt: 'Smart ring resting on a nightstand next to a phone showing a sleep graph, moody blue light.' },
  { from: '#10b981', to: '#065f46', prompt: 'Memory-foam pillow on a freshly made bed, soft side light, cozy bedroom.' },
  { from: '#fb7185', to: '#9f1239', prompt: 'Influencer holding product up to camera, bright kitchen, UGC selfie style.' },
]

// ── Seed ─────────────────────────────────────────────────────────────────

function idSnapshot() {
  const s = useBankStore.getState()
  return {
    products: s.products.map((x) => x.id),
    models: s.models.map((x) => x.id),
    scripts: s.scripts.map((x) => x.id),
    voices: s.voices.map((x) => x.id),
    brolls: s.brolls.map((x) => x.id),
    characterHistory: s.characterHistory.map((x) => x.id),
    scriptHistory: s.scriptHistory.map((x) => x.id),
    imageHistory: s.imageHistory.map((x) => x.id),
  }
}

function diffNewIds(before: ReturnType<typeof idSnapshot>): Manifest {
  const after = idSnapshot()
  const out = { ...EMPTY_MANIFEST }
  for (const key of Object.keys(out) as (keyof Manifest)[]) {
    const had = new Set(before[key])
    out[key] = after[key].filter((id) => !had.has(id))
  }
  return out
}

export async function seedMockData(): Promise<void> {
  if (hasMockData()) return
  const store = useBankStore.getState()
  const before = idSnapshot()

  // Suppress the per-row "saved" toasts during the bulk insert — we surface a
  // single summary toast at the end instead.
  const realAddToast = useAppStore.getState().addToast
  useAppStore.setState({ addToast: () => {} })

  try {
    const now = Date.now()
    // Stagger createdAt so day-bucketing + sort order look natural.
    const ago = (i: number) => now - i * 11 * 60 * 1000

    // Products
    const productImages: string[] = []
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i]
      const img = await makeImageAsset({ w: 1024, h: 1024, from: p.from, to: p.to, label: p.name, sub: 'PRODUCT' })
      productImages.push(img)
      await store.addProduct({
        productImage: img,
        productName: p.name,
        productDescription: p.desc,
        targetMarket: p.market,
        painPoints: p.pain,
        usps: p.usps,
        benefits: p.benefits,
        offer: p.offer,
        cta: p.cta,
        confirmed: true,
      })
    }

    // Influencers (models) — last one carries a character sheet.
    for (let i = 0; i < INFLUENCERS.length; i++) {
      const m = INFLUENCERS[i]
      const portrait = await makeImageAsset({ w: 768, h: 1365, from: m.from, to: m.to, label: m.name, sub: 'INFLUENCER' })
      const isSheet = i === INFLUENCERS.length - 1
      const sheet = isSheet
        ? await makeImageAsset({ w: 1365, h: 768, from: m.from, to: m.to, label: `${m.name} — Sheet`, sub: 'turnaround · expressions · full body' })
        : undefined
      await store.addModel({
        name: m.name,
        characterImage: portrait,
        jsonProfile: m.profile as Record<string, unknown>,
        notes: '',
        source: 'character-studio',
        ...(sheet ? { sheetImage: sheet } : {}),
      })
    }

    // Scripts bank
    await store.addScript({ title: 'Glow Serum — Almost Returned It', scriptText: SCRIPT_TEXT_1, linkedProductId: '', source: 'script-architect', kind: 'remix' })
    await store.addScript({ title: 'Sleep Tracker — Bad At Sleeping', scriptText: SCRIPT_TEXT_2, linkedProductId: '', source: 'script-architect', kind: 'remix' })
    await store.addScript({ title: 'Serum Ad — Scene Blueprint', scriptText: SCENE_PROMPT, linkedProductId: '', source: 'script-architect', kind: 'reverse-engineer' })

    // Voices bank
    for (const v of VOICES) {
      await store.addVoice({
        label: v.label,
        voiceId: `demo-voice-${v.voiceName.toLowerCase()}`,
        voiceName: v.voiceName,
        gender: v.gender,
        stability: 0.75,
        similarityBoost: 0.75,
        style: 0,
        speed: 1,
        linkedModelId: '',
      })
    }

    // B-Roll bank stills (sourceApp 'broll-studio' → show in B-Roll's Gallery)
    for (let i = 0; i < BROLLS.length; i++) {
      const b = BROLLS[i]
      const img = await makeImageAsset({ w: 768, h: 1365, from: b.from, to: b.to, label: `B-Roll ${i + 1}`, sub: 'broll-studio' })
      await store.addBRoll({ imageUrl: img, prompt: b.prompt, sourceApp: 'broll-studio' })
    }

    // Influencers tab — generation history (portraits + a sheet)
    for (let i = 0; i < INFLUENCERS.length; i++) {
      const m = INFLUENCERS[i]
      const img = await makeImageAsset({ w: 768, h: 1365, from: m.from, to: m.to, label: m.name, sub: 'portrait' })
      const item: CharacterHistoryItem = {
        id: `demo-char-${i}`,
        imageRef: img,
        profile: m.profile,
        modelId: 'gpt-image-2-text-to-image',
        aspectRatio: '9:16',
        resolution: '1K',
        kind: 'portrait',
        createdAt: ago(i + 1),
      }
      await store.addCharacterHistory(item)
    }
    const sheetSubject = INFLUENCERS[2]
    const sheetImg = await makeImageAsset({ w: 1365, h: 768, from: sheetSubject.from, to: sheetSubject.to, label: `${sheetSubject.name} — Sheet`, sub: 'reference sheet' })
    await store.addCharacterHistory({
      id: 'demo-char-sheet',
      imageRef: sheetImg,
      profile: sheetSubject.profile,
      modelId: 'gpt-image-2-image-to-image',
      aspectRatio: '16:9',
      resolution: '4K',
      kind: 'sheet',
      createdAt: ago(0),
    })

    // Scripts tab — generation history
    const scriptHistory: ScriptHistoryItem[] = [
      {
        id: 'demo-script-hist-0',
        mode: 'write',
        variations: [SCRIPT_TEXT_1, SCRIPT_TEXT_1.replace('third bottle', 'second bottle'), SCRIPT_TEXT_1.replace('20% off', 'a bundle deal')],
        inputSummary: 'Glow Lab Vitamin C Serum — Problem/Agitate/Solution',
        productName: 'Glow Lab Vitamin C Serum',
        brief: 'Skincare serum, target women 24-40, emphasize the visible glow',
        writeStyle: 'Problem–Agitate–Solution',
        writeFormat: 'script',
        writeLength: 30,
        createdAt: ago(2),
      },
      {
        id: 'demo-script-hist-1',
        mode: 'remix',
        variations: [SCRIPT_TEXT_2, SCRIPT_TEXT_2.replace('seven day battery', 'a week of battery'), SCRIPT_TEXT_2.replace('late coffee', 'evening screen time')],
        inputSummary: 'FocusBand Sleep Tracker — testimonial remix',
        productName: 'FocusBand Sleep Tracker',
        winningTranscript: SCRIPT_TEXT_2,
        createdAt: ago(4),
      },
      {
        id: 'demo-script-hist-2',
        mode: 'reverse-engineer',
        variations: [SCENE_PROMPT],
        inputSummary: 'Serum ad — scene blueprint',
        reversePrompt: SCENE_PROMPT,
        createdAt: ago(6),
      },
    ]
    for (const item of scriptHistory) await store.addScriptHistory(item)

    // Playground — image generation history
    for (let i = 0; i < 3; i++) {
      const b = BROLLS[i]
      const img = await makeImageAsset({ w: 768, h: 1365, from: b.from, to: b.to, label: `Playground ${i + 1}`, sub: 'image' })
      const item: ImageHistoryItem = {
        id: `demo-img-${i}`,
        modelId: 'nano-banana-2',
        prompt: b.prompt,
        aspectRatio: '9:16',
        resolution: '1K',
        imageUrl: img,
        createdAt: ago(i),
      }
      await store.addImageHistory(item)
    }
  } finally {
    useAppStore.setState({ addToast: realAddToast })
  }

  const manifest = diffNewIds(before)
  try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest)) } catch { /* ignore */ }
}

// ── Remove ─────────────────────────────────────────────────────────────────

export async function removeMockData(): Promise<void> {
  const manifest = readManifest()
  if (!manifest) return
  const store = useBankStore.getState()

  const realAddToast = useAppStore.getState().addToast
  useAppStore.setState({ addToast: () => {} })

  try {
    for (const id of manifest.products) await store.deleteProduct(id)
    for (const id of manifest.models) await store.deleteModel(id)
    for (const id of manifest.scripts) await store.deleteScript(id)
    for (const id of manifest.voices) await store.deleteVoice(id)
    for (const id of manifest.brolls) await store.deleteBRoll(id)
    for (const id of manifest.characterHistory) await store.deleteCharacterHistory(id)
    for (const id of manifest.scriptHistory) await store.deleteScriptHistory(id)
    for (const id of manifest.imageHistory) await store.deleteImageHistory(id)
  } finally {
    useAppStore.setState({ addToast: realAddToast })
  }

  try { localStorage.removeItem(MANIFEST_KEY) } catch { /* ignore */ }
}
