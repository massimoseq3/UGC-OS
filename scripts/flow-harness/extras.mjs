// Wider coverage than smoke.mjs, to prove the stub's other responders against
// the real parsers. Screenshots in ./shots/extras.
// Run: node extras.mjs [--fast] [--quiet] [--headed]
//
//   A. Describe It ("Five hooks for my serum, a female voice, B-Roll for each")
//      → proposal → Open in Editor → Ask Flow "Cast 4 new faces" → Test With 1
//      (hooks responder, Characters portraits, B-Roll, Edit Pack)
//   B. Clone a Winner: Saved Ad → Ad Analyzer (upload + chat-as-a-job JSON)
//      → Remix (+ remix voice brief) → Voiceovers / B-Roll / Edit Pack.
//      Starts the run, then switches to the Scripts app to see where the
//      review modal shows up.
//   C. Outliers: a TikTok search on the ScrapeCreators stub.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, openRoute } from './boot.mjs'
import { makeShooter, openTemplate, pickField, waitForRun, keepAll, reviewModal, setView, flowHome, runState, slug } from './drive.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const t0 = Date.now()
const say = (...a) => console.log(`[extras ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
const shot = makeShooter(path.join(HERE, 'shots', 'extras'), { log: (m) => say(m) })
const results = {}

const { browser, page, stub, consoleErrors, pageErrors, seeded } = await boot({
  headless: !process.argv.includes('--headed'),
  timeScale: process.argv.includes('--fast') ? 0.2 : 1,
  stub: { quiet: process.argv.includes('--quiet') },
})
say('booted', seeded)

async function scenario(name, fn) {
  try {
    await fn()
    results[name] ??= 'ok'
  } catch (err) {
    results[name] = `FAILED: ${String(err).split('\n')[0]}`
    say(`${name} failed`, err)
    await shot(page, `${slug(name)}-failure`, `${name}: state at failure`).catch(() => {})
  }
}

const keepAllShot = (tag) => {
  const seen = new Set()
  return async (dialog, title) => {
    if (!seen.has(title)) {
      seen.add(title)
      await page.waitForTimeout(1000)
      await shot(page, `${tag}-review-${slug(title)}`, `${tag}: "${title}"`)
    }
    await keepAll(dialog)
  }
}

// ── A. Describe It + Ask Flow + Test With 1 ─────────────────────────────────
await scenario('A describe-it', async () => {
  await page.getByText('Start a Flow').first().waitFor({ timeout: 30_000 })
  await page.getByPlaceholder('Describe the flow you want').fill('Five hooks for my serum, a female voice, B-Roll for each')
  await page.getByRole('button', { name: /Build Flow/ }).click()
  await page.getByText("Here's the Flow").waitFor({ timeout: 30_000 })
  await page.waitForTimeout(600)
  await shot(page, 'describe-proposal', "Describe It: the proposal card (Here's the Flow) with plan chips and notes")
  await page.getByRole('button', { name: /Open in Editor/ }).click()
  await page.waitForTimeout(1500)
  await shot(page, 'describe-canvas', 'The described flow on the canvas')

  const ask = page.getByPlaceholder('Ask Flow to change something…')
  await ask.click()
  await ask.fill('Cast 4 new faces')
  await ask.press('Enter')
  await page.getByRole('button', { name: 'Undo' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)
  await shot(page, 'ask-flow-result', 'Ask Flow "Cast 4 new faces": a Characters block wired into B-Roll, with Undo')

  await page.getByRole('button', { name: /Test With 1/ }).first().click()
  await page.waitForTimeout(800)
  // A test run is cheap, but confirm if the app asks.
  const confirmRun = page.locator('div.pointer-events-auto.opacity-100').filter({ has: page.locator('h3', { hasText: /Run the Test\?|Run This Flow\?/ }) }).getByRole('button', { name: /^Run · / })
  if (await confirmRun.isVisible().catch(() => false)) await confirmRun.click()
  const st = await waitForRun(page, { log: (...a) => say(...a), onReview: keepAllShot('A') })
  await page.waitForTimeout(1200)
  await shot(page, 'describe-test-finished', `Test With 1 finished (${st.status})`)
  results['A describe-it'] = st.status === 'done' ? 'ok' : `run ${st.status}: ${st.errors.join(' | ')}`
})

// ── B. Clone a Winner, reviewed from another app ────────────────────────────
await scenario('B clone-a-winner', async () => {
  await flowHome(page)
  const setup = await openTemplate(page, 'Clone a Winner')
  await pickField(page, setup, 'The Winning Ad', 'the serum my derm asked about')
  await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
  await pickField(page, setup, 'Your Character', 'Maya')
  await shot(page, 'clone-setup', 'Clone a Winner setup: saved ad, product and character picked')
  await setup.getByRole('button', { name: /^Run · / }).click()
  say('Clone a Winner running; switching to the Scripts app')
  await page.waitForTimeout(800)
  await openRoute(page, '/scripts')
  // Does the review modal follow the member into another app?
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && !(await reviewModal(page).isVisible().catch(() => false))) await page.waitForTimeout(1000)
  const active = await page.evaluate(async () => (await window.__appImport('/src/stores/appStore.ts')).useAppStore.getState().activeApp)
  if (await reviewModal(page).isVisible().catch(() => false)) {
    await page.waitForTimeout(800)
    await shot(page, 'clone-review-over-scripts-app', `Flow's review modal while the member is in "${active}" (not Flow)`)
    results['B review modal over another app'] = `yes — shown while activeApp=${active}`
  } else {
    results['B review modal over another app'] = `no — nothing shown while activeApp=${active}`
  }
  await openRoute(page, '/flow')
  const st = await waitForRun(page, { log: (...a) => say(...a), onReview: keepAllShot('B') })
  await page.waitForTimeout(1200)
  await shot(page, 'clone-finished-canvas', `Clone a Winner finished (${st.status})`)
  await setView(page, 'run')
  await shot(page, 'clone-finished-runview', 'Clone a Winner: Run View')
  await setView(page, 'edit')
  results['B clone-a-winner'] = st.status === 'done' ? 'ok' : `run ${st.status}: ${st.errors.join(' | ')}`
})

// ── C. Outliers search ──────────────────────────────────────────────────────
await scenario('C outliers', async () => {
  await openRoute(page, '/outliers')
  await page.waitForTimeout(1200)
  const tiktok = page.getByRole('button', { name: /^TikTok$/ }).first()
  if (await tiktok.isVisible().catch(() => false)) await tiktok.click()
  const box = page.getByPlaceholder(/Search TikTok/)
  await box.fill('vitamin c serum')
  await box.press('Enter')
  await page.getByText('glowwithmaya', { exact: false }).first().waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await shot(page, 'outliers-tiktok-search', 'Outliers: a TikTok search answered by the ScrapeCreators stub')
})

console.log('\n══════════ EXTRAS SUMMARY ══════════')
for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v}`)
console.log('\nstub:\n' + stub.summary())
console.log(`\npage console errors (${consoleErrors.length}):`)
for (const e of consoleErrors) console.log('  -', e.slice(0, 300))
console.log(`page uncaught errors (${pageErrors.length}):`)
for (const e of pageErrors) console.log('  -', e.slice(0, 300))
console.log('\nscreenshots:')
for (const s of shot.list) console.log(`  shots/extras/${s.file} — ${s.what}`)
void runState
await browser.close()
