// Many Hooks, One Body: keep ONE body at its review, keep all hooks; check
// ten packs, each its own hook clip + the one body's clips.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll, setView } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, stub } = await boot({ timeScale: 0.25, stub: { quiet: true } })
await page.getByText('Start a Flow').first().waitFor()
await page.waitForTimeout(600)
const setup = await openTemplate(page, 'Many Hooks, One Body')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await shot(page, 'h01-setup')
await setup.getByRole('button', { name: /Open Canvas/ }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(500)
await shot(page, 'h02-canvas')
await page.getByRole('button', { name: /Run Flow/ }).first().click()
await page.waitForTimeout(500)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) { await shot(page, 'h03-confirm'); await confirm.click() }
const final = await waitForRun(page, { log: () => {}, onReview: async (d, title) => {
  await page.waitForTimeout(500)
  if (/Body/.test(title)) {
    await shot(page, 'h04-review-body')
    // leave only the first take on
    const ticks = d.locator('button[aria-label^="Leave"]')
    const n = await ticks.count()
    for (let i = n - 1; i >= 1; i--) await ticks.nth(i).click()
  } else await shot(page, 'h05-review-hooks')
  await d.getByRole('button', { name: /^Keep \d+/ }).click()
} })
console.log('final', JSON.stringify(final.blocks), final.errors)
await page.getByRole('button', { name: 'Fit', exact: true }).click().catch(() => {})
await page.waitForTimeout(600)
await shot(page, 'h06-done')
const packs = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { useFlowPlans } = await window.__appImport('/src/apps/flow/hooks/useFlowPlan.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const plan = planFlow(doc, doc.outputs, PLAN_DEPS)
  return plan.blocks.edit.instances.map((i) => ({ title: i.cached?.pack?.title?.slice(0, 40), clips: i.cached?.pack?.clips.length, script: i.cached?.pack?.script?.split('\n').length }))
})
console.log('packs', packs.length, JSON.stringify(packs.slice(0, 3)))
await setView(page, 'run')
await page.waitForTimeout(1200)
await shot(page, 'h07-runview')
console.log('createTask', JSON.stringify(stub.stats.createTask))
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
