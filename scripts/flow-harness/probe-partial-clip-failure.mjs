// Repro (Flow bug): kie fails 1 clip in 7 (stub failTask). The run ends
// 'done' with no error or failed count anywhere, B-Roll shows 30 clips for 35
// stills, the packs ship short, and Run Flow says "Nothing to Run".
// Run: node probe-partial-clip-failure.mjs  (fast mode, ~40s)
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll } from './drive.mjs'
let n = 0
const { browser, page, stub } = await boot({ timeScale: 0.2, logConsole: false, stub: { quiet: true, failTask: ({ kind }) => (kind === 'video' && ++n % 7 === 0 ? 'Content moderation: stub says no' : null) } })
await page.getByText('Start a Flow').first().waitFor()
const setup = await openTemplate(page, 'Product → 5 UGC Ads')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await setup.getByRole('button', { name: /^Run · / }).click()
const st = await waitForRun(page, { log: () => {}, onReview: (d) => keepAll(d) })
console.log(st.status, st.blocks, st.errors.slice(0, 3))
await page.screenshot({ path: 'shots/repro-partial-clip-failure.png' })
console.log('unhandled', stub.unhandled.length)
await browser.close()
