// End-to-end smoke of Flow on the stub: Flow Home → "Product → 5 UGC Ads" →
// pick product + character → Run → keep everything at each review → finished.
// Screenshots land in ./shots. Run:  node smoke.mjs  [--fast] [--quiet] [--headed] [--slow]
//   --fast   timeScale 0.2: the page clock runs 5x faster (polls, submit gate)
//   --quiet  only UNHANDLED requests and errors from the stub
//
// Exit code 0 when the run finished with status 'done', no UNHANDLED outbound
// request and no uncaught page error. Takes ~80s (see the README in the
// final report: the app polls kie every 5s after a 1.5s first poll).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './boot.mjs'
import { makeShooter, openTemplate, pickField, runState, setView, waitForRun, keepAll, slug } from './drive.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const headed = process.argv.includes('--headed')

const t0 = Date.now()
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const say = (...a) => console.log(`[smoke ${secs()}]`, ...a)
const shot = makeShooter(path.join(HERE, 'shots'), { log: (m) => say(m) })

const fast = process.argv.includes('--fast')
const { browser, page, stub, consoleErrors, pageErrors, seeded } = await boot({
  headless: !headed,
  slowMo: process.argv.includes('--slow') ? 150 : undefined,
  timeScale: fast ? 0.2 : 1,
  stub: { quiet: process.argv.includes('--quiet') },
})
say('booted', seeded)
let exitCode = 1
let final = null

try {
  // ── Flow Home ──────────────────────────────────────────────────────────
  await page.getByText('Start a Flow').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await shot(page, 'flow-home', 'Flow Home: Describe It bar, gallery templates, Your Flows')

  // ── Template Setup ─────────────────────────────────────────────────────
  const setup = await openTemplate(page, 'Product → 5 UGC Ads')
  await shot(page, 'template-setup-empty', 'Template Setup before any pick (Run is grey with the reason)')
  await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
  await pickField(page, setup, 'Your Character', 'Maya')
  await page.waitForTimeout(300)
  await shot(page, 'template-setup-filled', 'Template Setup with product + character picked, Run priced')

  const runBtn = setup.getByRole('button', { name: /^Run · / })
  if (await runBtn.isDisabled()) throw new Error(`Run is disabled: ${await setup.innerText()}`)
  await runBtn.click()
  say('Run pressed')
  await page.waitForTimeout(1500)
  await shot(page, 'canvas-run-started', 'Canvas right after Run: Scripts writing (its review opens as soon as it lands)')

  // ── Wait for the run, keeping everything at each review ────────────────
  const reviewed = new Set()
  const mid = new Set()
  final = await waitForRun(page, {
    log: (...a) => say(...a),
    onReview: async (dialog, title) => {
      if (!reviewed.has(title)) {
        reviewed.add(title)
        await page.waitForTimeout(1200) // let the thumbnails decode
        await shot(page, `review-${slug(title)}`, `Pause for Review: "${title}" (the smoke keeps everything)`)
      }
      await keepAll(dialog)
    },
    onTick: async (st) => {
      const broll = st.blocks?.broll ?? ''
      const stillsReviewed = [...reviewed].some((t) => /Stills/.test(t))
      if (!mid.has('voice') && /running/.test(st.blocks?.voice ?? '')) {
        mid.add('voice')
        await shot(page, 'canvas-mid-run', 'Canvas mid-run: Voiceovers reading, B-Roll storyboarding')
      }
      if (!mid.has('stills') && /running/.test(broll) && !stillsReviewed && (await page.getByText(/Stills · \d+ of \d+/).count()) > 0) {
        mid.add('stills')
        await shot(page, 'canvas-broll-stills', 'Canvas: B-Roll making its stills (progress on the block)')
      }
      if (!mid.has('clips') && /running/.test(broll) && stillsReviewed) {
        mid.add('clips')
        await page.waitForTimeout(800)
        await shot(page, 'canvas-broll-clips', 'Canvas: B-Roll animating the kept stills into clips')
        await setView(page, 'run')
        await shot(page, 'runview-mid-run', 'Run View mid-run (clips phase)')
        await setView(page, 'edit')
      }
    },
  })

  // ── Finished ───────────────────────────────────────────────────────────
  await page.waitForTimeout(1500)
  await shot(page, 'canvas-finished', `Canvas after the run (${final.status}): Edit Pack offers Download 5 Packs`)
  await setView(page, 'run')
  await page.waitForTimeout(1500)
  await shot(page, 'runview-finished', 'Run View after the run: one card per Edit Pack')
  await page.mouse.move(1000, 500)
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(600)
  await shot(page, 'runview-finished-scrolled', 'Run View results, scrolled')
  await setView(page, 'edit')

  // A block open in its app's own window (double-click the block's title).
  try {
    await page.locator('.react-flow__node').filter({ hasText: 'B-Roll' }).first().getByText('B-Roll', { exact: true }).first().dblclick({ timeout: 5000 })
    await page.waitForTimeout(1500)
    await shot(page, 'block-window-broll', "B-Roll block open in B-Roll's own window: the app's inputs + what the block made")
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  } catch (err) {
    say('could not open the B-Roll block window:', String(err).split('\n')[0])
  }

  exitCode = final.status === 'done' && stub.unhandled.length === 0 && pageErrors.length === 0 ? 0 : 1
} catch (err) {
  console.error('[smoke] FAILED:', err)
  await shot(page, 'failure', `state at failure: ${String(err).split('\n')[0].slice(0, 100)}`).catch(() => {})
} finally {
  const st = final ?? (await runState(page).catch(() => null))
  console.log('\n══════════ SMOKE SUMMARY ══════════')
  console.log(`time: ${secs()}`)
  console.log('run:', JSON.stringify(st, null, 2))
  console.log('\nstub:\n' + stub.summary())
  console.log(`\npage console errors (${consoleErrors.length}):`)
  for (const e of consoleErrors) console.log('  -', e.slice(0, 300))
  console.log(`page uncaught errors (${pageErrors.length}):`)
  for (const e of pageErrors) console.log('  -', e.slice(0, 300))
  console.log('\nscreenshots:')
  for (const s of shot.list) console.log(`  shots/${s.file} — ${s.what}`)
  console.log(`\nresult: ${exitCode === 0 ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(exitCode)
}
