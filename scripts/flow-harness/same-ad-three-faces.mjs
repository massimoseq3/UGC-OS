// Same Ad, Three Faces: one character + two variants made by Change edits,
// Variants reviewed, a Scripts edit made in the review, three ads filmed.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, stub } = await boot({ timeScale: 0.25, stub: { quiet: true } })
await page.getByText('Start a Flow').first().waitFor()
const setup = await openTemplate(page, 'Same Ad, Three Faces')
await pickField(page, setup, 'The Winning Ad', 'the serum')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await shot(page, 'v01-setup')
await setup.getByRole('button', { name: /Open Canvas/ }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Fit', exact: true }).click().catch(() => {})
await page.waitForTimeout(600)
await shot(page, 'v02-canvas')
await page.getByRole('button', { name: /Run Flow/ }).first().click()
await page.waitForTimeout(500)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) await confirm.click()
const final = await waitForRun(page, { log: () => {}, onReview: async (d, title) => {
  await page.waitForTimeout(800)
  console.log('review', title)
  if (/Variants/.test(title)) {
    await shot(page, 'v03-variants-review')
    // Leave the second audience's face out: its ad must not be filmed.
    const tiles = d.locator('div.grid button')
    console.log('face tiles in review', await tiles.count())
    await tiles.nth(1).click()
    await page.waitForTimeout(200)
    await shot(page, 'v03b-variants-picked')
  }
  if (/Scripts/.test(title)) {
    await shot(page, 'v04-scripts-review')
  }
  await d.getByRole('button', { name: /^(Keep \d+|Animate)/ }).first().click()
} })
console.log('final', JSON.stringify(final.blocks), final.errors ?? '')
const info = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const plan = planFlow(doc, doc.outputs, PLAN_DEPS)
  return {
    variants: plan.blocks.variants.instances.map((i) => ({ change: i.inputs.change?.[0]?.label?.slice(0, 30), made: Object.values(i.cached?.items ?? {}).map((v) => v.label.slice(0, 30)) })),
    scenesRuns: plan.blocks.scenes.instances.map((i) => i.inputs.character?.[0]?.label?.slice(0, 30)),
    edit: plan.blocks.edit.instances.length,
    left: plan.planned,
  }
})
console.log(JSON.stringify(info, null, 1))
await page.getByRole('button', { name: 'Fit', exact: true }).click().catch(() => {})
await page.waitForTimeout(600)
await shot(page, 'v05-done')
await page.locator('.react-flow__node[data-id="variants"]').dblclick({ position: { x: 60, y: 20 } })
await page.waitForTimeout(1200)
await shot(page, 'v06-variants-window')
const reqs = stub?.requests?.() ?? []
console.log('image edit requests', reqs.filter?.((r) => /image/i.test(r.model ?? '')).length)
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
