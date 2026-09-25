// The member's own ad, with no Outliers search and no Swipe File: picked on a
// lone Ad Analyzer's face, it lands as a "Your Ad" block wired in and is
// analyzed from the file itself; uploaded in Clone a Winner's Template Setup,
// the template runs (Test With 1) off it. Asserts the analyses read the
// uploaded file (one upload to kie's file host each, one analysis call each)
// and nothing went to ScrapeCreators. Screenshots to ./shots (or $OUT).
import fs from 'node:fs'
import path from 'node:path'
import { boot, SEED_PRODUCT } from './boot.mjs'
import { ASSET_DIR } from './assets.mjs'
import { flowHome, keepAll, makeShooter, openTemplate, pickField, waitForRun } from './drive.mjs'

const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
const shot = makeShooter(OUT)
const { browser, page, stub, consoleErrors, pageErrors } = await boot({ timeScale: 0.2, logConsole: false })
const ad = (name) => ({ name, mimeType: 'video/webm', buffer: fs.readFileSync(path.join(ASSET_DIR, 'vid/1.webm')) })
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const openDoc = () => page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const s = useFlowStore.getState()
  return s.docs[s.openId]
})
const lastAnalysis = () => page.evaluate(async () => {
  const { useBankStore } = await window.__appImport('/src/stores/bankStore.ts')
  const r = useBankStore.getState().adAnatomyHistory[0]
  return r && { status: r.status, fileName: r.fileName }
})

// ── 1. A lone Ad Analyzer, and an ad of the member's own ──────────────────
const ids = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const s = useFlowStore.getState()
  const id = s.createFlow({ name: 'Own Ad Probe' })
  s.openFlow(id)
  s.setView('edit')
  const an = useFlowStore.getState().addBlock('analyzer', { x: 520, y: 160 })
  return { id, an }
})
await page.waitForTimeout(800)
await shot(page, 'own-ad-lone-analyzer', 'A lone Ad Analyzer: its face asks for the member\'s ad')
await page.locator(`.react-flow__node[data-id="${ids.an}"] input[type=file]`).setInputFiles(ad('my-ad.webm'))
let doc
for (let i = 0; i < 40; i++) {
  doc = await openDoc()
  if (doc.blocks.some((b) => b.settings.upload)) break
  await page.waitForTimeout(250)
}
const holder = doc.blocks.find((b) => b.kind === 'bank' && b.settings.bank === 'swipes')
check(!!holder?.settings.upload?.ref && holder.settings.upload.name === 'my-ad.webm', 'the ad is held by a new ad block')
check(doc.wires.some((w) => w.from === holder?.id && w.to === ids.an && w.toPort === 'ad'), 'the ad block is wired into the Ad Analyzer')
check(!!holder?.settings.upload?.thumb, 'its first frame was kept for the face')
await page.waitForTimeout(600)
await shot(page, 'own-ad-wired', 'The ad dropped in, as a "Your Ad" block wired into the Analyzer')

await page.locator(`.react-flow__node[data-id="${ids.an}"]`).dblclick({ position: { x: 60, y: 14 } })
const analyze = page.getByRole('button', { name: /^Analyze the Ad/ })
await analyze.waitFor({ timeout: 10_000 })
await page.waitForTimeout(600)
await shot(page, 'own-ad-window', 'The Analyzer\'s window: the ad playing, its pill, Analyze priced')
await analyze.click()
const first = await waitForRun(page, { log: () => {} })
check(first.status === 'done', `the analysis ran (${first.status}${first.errors?.length ? `: ${first.errors.join('; ')}` : ''})`)
const row = await lastAnalysis()
check(row?.status === 'complete' && row.fileName === 'my-ad.webm', `the Ad Analyzer read the uploaded file (${JSON.stringify(row)})`)
await page.waitForTimeout(800)
await shot(page, 'own-ad-breakdown', 'The breakdown of the member\'s own ad, in the Analyzer\'s window')
await page.keyboard.press('Escape')

// ── 2. Clone a Winner, with the member's ad instead of a saved one ────────
await flowHome(page)
const setup = await openTemplate(page, 'Clone a Winner')
await setup.locator('input[type=file][accept*="video"]').setInputFiles(ad('winner.webm'))
await setup.getByText('Drop Another Ad to Replace It').waitFor({ timeout: 15_000 })
await pickField(page, setup, 'Your Product', SEED_PRODUCT.productName)
await pickField(page, setup, 'Your Character', 'Maya')
await shot(page, 'own-ad-template-setup', 'Clone a Winner\'s setup, The Winning Ad uploaded rather than picked')
const run = setup.getByRole('button', { name: /^Run/ })
check(await run.isEnabled(), 'Run is enabled with an uploaded ad and no saved one')
await setup.getByRole('button', { name: 'Open Canvas' }).click()
await page.waitForTimeout(1200)
doc = await openDoc()
const winning = doc.blocks.find((b) => b.label === 'The Winning Ad')
check(winning?.settings.upload?.name === 'winner.webm' && !winning.pick, 'The Winning Ad holds the upload')
// Test With 1, through the runtime: the header button's name is its tooltip.
const started = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { startRun } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  return startRun(useFlowStore.getState().openId, { test: true })
})
check(started.ok, `Test With 1 started${started.ok ? '' : ` (${started.reason})`}`)
const test = await waitForRun(page, { log: () => {}, onReview: async (dialog) => keepAll(dialog) })
check(test.status === 'done', `Test With 1 finished (${test.status}${test.errors?.length ? `: ${test.errors.join('; ')}` : ''})`)
check((await lastAnalysis())?.fileName === 'winner.webm', 'the template analyzed the uploaded ad')
await shot(page, 'own-ad-template-run', 'Clone a Winner, run off the member\'s own ad')

check(stub.stats.uploads >= 2, `the ads went to kie's file host (${stub.stats.uploads} uploads)`)
check((stub.stats.chat['ad-analyzer'] ?? 0) + (stub.stats.chat['ad-analyzer (job)'] ?? 0) === 2, `two analyses (${JSON.stringify(stub.stats.chat)})`)
check(!Object.keys(stub.stats.scrape).length, 'nothing went to ScrapeCreators')
check(!stub.unhandled.length, `no unhandled requests (${stub.unhandled.join(', ')})`)
check(!pageErrors.length, `no page errors (${pageErrors.slice(0, 3).join(' | ')})`)
if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 5))
console.log(stub.summary())
console.log(`result: ${failures ? 'FAIL' : 'PASS'}`)
await browser.close()
process.exit(failures ? 1 : 0)
