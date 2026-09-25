// Controls tour on a real template: palette hover card, help, wire tools and
// peek, insert on a wire, Run Block on a block whose upstream isn't made.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors } = await boot({ stub: { quiet: true } })
await page.getByText('Start a Flow').first().waitFor()
await page.waitForTimeout(600)
await shot(page, 'c00-home')
const setup = await openTemplate(page, '10-Hook Machine')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await setup.getByRole('button', { name: /Open Canvas/ }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(500)
await shot(page, 'c01-canvas')
// palette hover
await page.getByRole('button', { name: 'Add Scene Clips' }).hover()
await page.waitForTimeout(300)
await shot(page, 'c02-palette-hover')
await page.mouse.move(800, 300)
// help
await page.getByRole('button', { name: 'How Flow Works' }).click()
await page.waitForTimeout(300)
await shot(page, 'c03-help')
await page.keyboard.press('Escape')
// Run Block on Voiceovers (Scripts not made yet): Run This Block via right-click
const node = (t) => page.locator('.react-flow__node').filter({ has: page.locator('header span', { hasText: new RegExp(`^${t}$`) }) }).first()
const voice = node('Voiceovers')
const vb = await voice.boundingBox()
await page.mouse.click(vb.x + 60, vb.y + 20, { button: 'right' })
await page.waitForTimeout(300)
await shot(page, 'c04-voice-context')
await page.getByRole('button', { name: /Run This Block/ }).click()
await page.waitForTimeout(800)
await shot(page, 'c05-run-block-confirm')
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) await confirm.click()
const final = await waitForRun(page, { log: () => {}, onReview: async (d) => { await shot(page, 'c06-review'); await keepAll(d) } })
console.log('run block final', JSON.stringify(final.blocks))
await page.waitForTimeout(600)
await shot(page, 'c07-after-run-block')
// hover the Scripts → Voiceovers wire midpoint and peek
const wires = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  return doc.wires.map((w) => ({ id: w.id, from: w.from, to: w.to, fromPort: w.fromPort, toPort: w.toPort }))
})
console.log(JSON.stringify(wires))
const w = wires.find((x) => x.toPort === 'script' && x.to.startsWith('voice'))
const edge = page.locator(`.react-flow__edge[data-id="${w.id}"] path.react-flow__edge-interaction`)
const eb = await edge.boundingBox()
// click the wire to select it (tools appear at its middle)
await edge.click({ force: true, position: { x: eb.width / 2, y: eb.height / 2 } }).catch(async () => { await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2) })
await page.waitForTimeout(400)
await shot(page, 'c08-wire-selected')
const peekBtn = page.getByRole('button', { name: "See What's on It" }).first()
await peekBtn.click()
await page.waitForTimeout(500)
await shot(page, 'c09-wire-peek')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await edge.click({ force: true }).catch(() => {})
await page.waitForTimeout(300)
const ins = page.getByRole('button', { name: 'Insert a Block' }).first()
if (await ins.isVisible().catch(() => false)) { await ins.click(); await page.waitForTimeout(400); await shot(page, 'c10-insert-menu') }
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
