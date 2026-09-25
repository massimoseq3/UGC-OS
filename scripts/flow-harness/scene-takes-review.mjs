// Scene Clips with Pause for Review and two takes: pick take 2 of scene 1
// and take 1 of scene 2; the pack gets exactly those.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors } = await boot({ timeScale: 0.25, stub: { quiet: true } })
await page.getByText('Start a Flow').first().waitFor()
const setup = await openTemplate(page, 'Talking Head Ad, Scene by Scene')
await pickField(page, setup, 'The Winning Ad', 'the serum')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await setup.getByRole('button', { name: /Open Canvas/ }).click()
await page.waitForTimeout(800)
await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  useFlowStore.getState().patchSettings('scenes', { takes: 2 })
  useFlowStore.getState().patchBlock('scenes', { review: true })
})
await page.getByRole('button', { name: /Run Flow/ }).first().click()
await page.waitForTimeout(500)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) await confirm.click()
const final = await waitForRun(page, { log: () => {}, onReview: async (d, title) => {
  await page.waitForTimeout(800)
  if (/Best Takes/.test(title)) {
    await shot(page, 'r01-takes-review')
    await d.getByRole('button', { name: 'Leave Take 1 Out' }).first().click()
    await d.getByRole('button', { name: 'Keep Take 2' }).first().click()
    await page.waitForTimeout(200)
    await shot(page, 'r02-takes-picked')
  }
  await d.getByRole('button', { name: /^Keep \d+/ }).click()
} })
console.log('final', JSON.stringify(final.blocks), final.errors)
const pack = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const plan = planFlow(doc, doc.outputs, PLAN_DEPS)
  const all = Object.values(doc.outputs.scenes.instances)[0].outputs.clips[0].payload.clips.map((c) => `${c.scene}:${c.take}:${c.ref.slice(-6)}`)
  return { all, keep: Object.values(doc.outputs.scenes.instances)[0].keep, packs: plan.blocks.edit.instances.map((i) => i.cached?.pack?.clips.map((r) => r.slice(-6))) }
})
console.log(JSON.stringify(pack))
await page.locator('.react-flow__node[data-id="scenes"]').dblclick({ position: { x: 60, y: 20 } })
await page.waitForTimeout(1200)
await shot(page, 'r03-window-kept')
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
