// Boot UGC OS in Playwright with every outbound call stubbed, keys set, Flow
// switched on, onboarding dismissed, and a Product + Character in the Bank.
//
//   import { boot } from './boot.mjs'
//   const { browser, context, page, stub, consoleErrors } = await boot()
//   ... drive page ...
//   await browser.close()
//
// The dev server must already be running (npm run dev → :5173). This file
// never writes to the repo: localStorage is seeded by an init script and the
// Bank rows through the app's own stores (see seedBank).

import { chromium } from 'playwright'
import { CHROME } from './assets.mjs'
import { installStub, FAKE_HOST } from './stub.mjs'

export const BASE_URL = process.env.UGC_URL ?? 'http://localhost:5173'

export const SEED_PRODUCT = {
  productName: 'GlowSerum Vitamin C Serum',
  productDescription: 'A lightweight 20% vitamin C face serum in a dark amber dropper bottle that fades dark spots and evens skin tone.',
  uniqueMechanism: 'Stabilised 20% L-ascorbic acid in UV-blocking amber glass, so it stays potent instead of oxidising orange.',
  targetMarket: 'Women 25-40 with sun spots or post-acne marks who want brighter skin without a long routine.',
  painPoints: 'Dark spots that concealer never fully hides\nSerums that turn orange and stop working\nSticky formulas that pill under sunscreen',
  currentAlternatives: 'Drugstore vitamin C in clear bottles that oxidise within weeks; heavy concealer every morning.',
  objections: 'Price — about 30 cents a day, one bottle lasts almost three months.',
  notFor: 'Anyone looking for an overnight miracle.',
  usps: 'Dark amber glass keeps the formula stable\nWater-light texture that layers under sunscreen',
  benefits: 'Visibly faded dark spots in three to four weeks\nEven, bright skin tone that needs less makeup',
  proof: '4.7 stars from 2,300 reviews; dermatologist-tested.',
  beforeAfter: 'Before: every morning starts with two layers of concealer and angling away from the bathroom light.\n\nAfter: two drops, sunscreen, and out the door with bare skin that looks even.',
  offer: '20% off your first bottle with free shipping.',
  cta: 'Tap the link to grab yours',
  confirmed: true,
}

export const SEED_CHARACTER = {
  name: 'Maya',
  notes: 'Late-20s skincare creator, warm and chatty, films in her bathroom and bedroom.',
  source: 'manual-import',
  jsonProfile: {
    gender: 'Female', age: '26-30', ethnicity: 'Colombian', hairColor: 'Deep espresso brown', hairStyle: 'Shoulder-length soft waves with curtain bangs',
    clothingStyle: 'Oversized cream cable-knit sweater', expression: 'Soft closed-mouth smile', location: 'Bright bedroom', lighting: 'Soft window light',
  },
}

// A saved ad in the Swipe File, for the Clone a Winner template and Describe
// It's "remix my saved ad". Its media points at the stub's fake CDN.
export const SEED_SWIPE = {
  platform: 'tiktok',
  sourceId: '7412000000000000001',
  postUrl: 'https://www.tiktok.com/@glowwithmaya/video/7412000000000000001',
  mediaUrl: `https://${FAKE_HOST}/vid/1.mp4`,
  authorHandle: 'glowwithmaya',
  authorName: 'Maya | skincare',
  caption: 'the serum my derm asked about 😳 #skincare #vitaminc #darkspots',
  transcript: 'Okay I need to talk about the serum that made my dermatologist ask what I changed. I have had these dark spots since my twenties and nothing touched them.',
  views: 2310000, likes: 184000, comments: 2310, shares: 9800, saves: 22100, followerCount: 18400, outlierMultiple: 125.5,
}

// Runs in the page before any app script, on every navigation. Only fills
// what's missing, so a test that changes a setting keeps it across reloads.
function initScript({ kieKey, scKey, timeScale }) {
  // Fast mode: the page's clock runs `1 / timeScale` times faster. Date.now()
  // is warped and every setTimeout / setInterval delay scaled by the same
  // factor, so wall-clock checks agree with timers — the submit gate
  // (utils/kieSubmitGate.ts: 750ms between creates, checked with Date.now())
  // and kie.ts's 1.5s / 5s polls all shrink together. `new Date()`,
  // performance.now(), CSS and rAF animations keep real time, so timestamps
  // shown in the UI and toasts' lifetimes are the price. Opt-in.
  if (timeScale && timeScale !== 1) {
    const realNow = Date.now.bind(Date)
    const start = realNow()
    Date.now = () => Math.round(start + (realNow() - start) / timeScale)
    const st = window.setTimeout
    const si = window.setInterval
    window.setTimeout = function (fn, ms, ...rest) { return st.call(window, fn, typeof ms === 'number' ? ms * timeScale : ms, ...rest) }
    window.setInterval = function (fn, ms, ...rest) { return si.call(window, fn, typeof ms === 'number' ? Math.max(4, ms * timeScale) : ms, ...rest) }
  }
  // `window.__appImport('/src/…')` — the app's OWN instance of a source
  // module. After Vite hot-updates a module, the app imports it as
  // `/src/x.ts?t=123`, and a bare import('/src/x.ts') from a test would get a
  // second, empty instance (a different store). The URL the page really
  // loaded is in resource timing, so use that when there is one.
  try { performance.setResourceTimingBufferSize(20000) } catch { /* ignore */ }
  window.__appImport = (p) => {
    let url = p
    try {
      const hits = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => {
        try { return new URL(n).pathname === p } catch { return false }
      })
      if (hits.length) url = hits[hits.length - 1]
    } catch { /* fall back to the bare path */ }
    return import(url)
  }
  try {
    const setIfMissing = (k, v) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v) }
    // Settings store (src/stores/settingsStore.ts, STORAGE_KEY) — the keys are
    // browser-local by design, so this is exactly where a member's live.
    const raw = localStorage.getItem('ai-ugc-lab-settings')
    const s = raw ? JSON.parse(raw) : {}
    if (!s.kieApiKey || !s.scrapeCreatorsKey) {
      localStorage.setItem('ai-ugc-lab-settings', JSON.stringify({ perAppModel: {}, ...s, kieApiKey: s.kieApiKey || kieKey, scrapeCreatorsKey: s.scrapeCreatorsKey || scKey }))
    }
    // Flow is an optional app, OFF by default (stores/appVisibilityStore.ts).
    const apps = JSON.parse(localStorage.getItem('ai-ugc-lab-optional-apps') || '{}')
    if (apps.flow === undefined) localStorage.setItem('ai-ugc-lab-optional-apps', JSON.stringify({ ...apps, flow: true }))
    // Meet Your Workspace auto-opens once per browser (stores/appStore.ts).
    setIfMissing('ugc-lab:team-intro-seen', '1')
    // Edit's "New update" dot (stores/skillUpdateStore.ts SKILL_VERSION).
    setIfMissing('ai-ugc-lab-skill-version-seen', '99')
  } catch (e) {
    console.warn('[boot] init script failed', e)
  }
}

/**
 * Put one Product and one Character in the Bank through the app's own stores
 * (Vite serves the source modules, so importing them from the page reaches the
 * same instances the app uses). Idempotent: skipped when a row of that name
 * exists. Images come off the stub's fake CDN and are saved as real assets.
 */
export async function seedBank(page, { product = SEED_PRODUCT, character = SEED_CHARACTER, swipe = SEED_SWIPE } = {}) {
  return page.evaluate(async ({ product, character, swipe, fake }) => {
    const bank = await window.__appImport('/src/stores/bankStore.ts')
    const assets = await window.__appImport('/src/utils/assetStore.ts')
    await bank.localBanksReady
    const save = async (url) => {
      const blob = await (await fetch(url)).blob()
      return `asset://${await assets.saveAsset(blob, blob.type || 'image/png')}`
    }
    const out = {}
    const s = bank.useBankStore.getState()
    const hasProduct = s.products.find((p) => p.productName === product.productName)
    out.productId = hasProduct?.id ?? await s.addProduct({ ...product, productImage: await save(`https://${fake}/misc/product.png`) }, { silent: true })
    const hasModel = bank.useBankStore.getState().models.find((m) => m.name === character.name)
    if (!hasModel) {
      const ref = await save(`https://${fake}/misc/character.png`)
      await bank.useBankStore.getState().addModel({ ...character, characterImage: ref })
    }
    out.characterId = bank.useBankStore.getState().models.find((m) => m.name === character.name)?.id
    if (swipe) {
      const had = bank.useBankStore.getState().swipes.find((x) => x.sourceId === swipe.sourceId)
      out.swipeId = had?.id ?? await bank.useBankStore.getState().addSwipe({ ...swipe, thumbRef: await save(`https://${fake}/img/3.png`) })
    }
    return out
  }, { product, character, swipe, fake: FAKE_HOST })
}

/**
 * @param opts
 *   headless      default true
 *   viewport      default 1600x1000
 *   route         path to open after seeding (default '/flow')
 *   stub          options passed to installStub (pollsBeforeSuccess, verbose, …)
 *   seed          seed the Bank (default true)
 *   slowMo        Playwright slowMo, for watching
 *   logConsole    echo page console errors/warnings as they happen (default true)
 *   timeScale     e.g. 0.2 runs the page's clock 5x faster (Date.now + timers), so
 *                 kie polls and the submit gate's spacing shrink (default 1 =
 *                 real timing; a full template run takes ~80s)
 * @returns { browser, context, page, stub, consoleErrors, pageErrors, seeded }
 */
export async function boot({
  headless = true,
  viewport = { width: 1600, height: 1000 },
  route = '/flow',
  stub: stubOpts = {},
  seed = true,
  slowMo,
  logConsole = true,
  timeScale = 1,
} = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, headless, slowMo })
  // Service workers would bypass route(); the app registers none, but block
  // them anyway so the stub stays the only way out.
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', deviceScaleFactor: 1 })
  const stub = await installStub(context, stubOpts)
  await context.addInitScript(initScript, { kieKey: 'stub-kie-key-0000', scKey: 'stub-sc-key-0000', timeScale })

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    const text = msg.text()
    // React dev-mode noise that says nothing about the app or the stub.
    if (/Download the React DevTools|\[vite\]/.test(text)) return
    if (msg.type() === 'error') consoleErrors.push(text)
    if (logConsole) console.log(`[page ${msg.type()}] ${text.slice(0, 400)}`)
  })
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.stack ?? err))
    if (logConsole) console.log(`[pageerror] ${String(err).slice(0, 400)}`)
  })

  // Land on the Dashboard first so the stores exist, seed, then switch apps
  // IN the SPA (a reload right after seeding could drop the bank's idle-queued
  // IndexedDB write).
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, null, { timeout: 60_000 })
  let seeded = null
  if (seed) {
    seeded = await seedBank(page)
    await page.waitForTimeout(800)
  }
  if (route) await openRoute(page, route)
  return { browser, context, page, stub, consoleErrors, pageErrors, seeded }
}

/**
 * Switch to an app by its URL slug ('/flow', '/scripts', '/broll', …) without
 * reloading — through the app store, the way the dock does it.
 */
export async function openRoute(page, route) {
  const slug = route.replace(/^\//, '').split('/')[0]
  await page.evaluate(async (slug) => {
    const { getAppIdForSlug } = await window.__appImport('/src/utils/routing.ts')
    const { useAppStore } = await window.__appImport('/src/stores/appStore.ts')
    const id = getAppIdForSlug(slug)
    if (!id) throw new Error(`no app for slug ${slug}`)
    useAppStore.getState().openApp(id)
  }, slug)
  await page.waitForURL((u) => u.pathname.startsWith(`/${slug}`), { timeout: 30_000 }).catch(() => {})
}
