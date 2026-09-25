// W1 continued: from Scripts' + stub pick Scene Clips; feed it a character
// and the product through its input dots; take the advice; Test With 1; Run.
import { boot } from './boot.mjs'
import { runState, waitForRun, setView, keepAll } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const store = (page, fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const st = useFlowStore.getState()
  const doc = st.docs[st.openId]
  return new Function('st', 'doc', 'arg', fn)(st, doc, arg)
}, { fn, arg })
const { browser, page, consoleErrors, pageErrors, seeded } = await boot({ stub: { pollsBeforeSuccess: 1 } })
await page.waitForTimeout(1200)
await page.getByText('Start From Scratch').click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /A Winning Ad/ }).click()
await page.waitForTimeout(500)
await store(page, `const b = doc.blocks.find((x) => x.kind === 'bank'); st.patchBlock(b.id, { pick: arg })`, seeded.swipeId)
for (let i = 0; i < 2; i++) { await page.locator('.flow-ghost').first().click(); await page.waitForTimeout(700) }
await page.waitForTimeout(500)
await shot(page, 'w1-10-three-blocks')
// Scripts' + stub → What Next → Scene Clips
const nodeTitled = (t) => page.locator('.react-flow__node').filter({ has: page.locator('header span', { hasText: new RegExp(`^${t}$`) }) }).first()
const scriptsNode = nodeTitled('Scripts')
await scriptsNode.hover()
await scriptsNode.locator('.flow-next').first().click()
await page.waitForTimeout(400)
await shot(page, 'w1-11-what-next')
await page.locator('.absolute.z-40').getByRole('button', { name: /Scene Clips/ }).first().click()
await page.waitForTimeout(900)
await shot(page, 'w1-12-scene-clips-wired')
// Character: click the Scene Clips "Character" input dot → What Feeds This? → Character (bank)
const scenesNode = nodeTitled('Scene Clips')
const handle = scenesNode.locator('.react-flow__handle-left[data-handleid="character"]')
await handle.click({ force: true })
await page.waitForTimeout(400)
await shot(page, 'w1-13-what-feeds-character')
await page.locator('.absolute.z-40').getByRole('button', { name: /^Character/ }).first().click()
await page.waitForTimeout(700)
const productHandle = scenesNode.locator('.react-flow__handle-left[data-handleid="product"]')
await productHandle.click({ force: true })
await page.waitForTimeout(300)
await page.locator('.absolute.z-40').getByRole('button', { name: /^Product/ }).first().click()
await page.waitForTimeout(700)
// Pick both banks' rows
await store(page, `for (const b of doc.blocks) { if (b.kind === 'bank' && b.settings.bank === 'models') st.patchBlock(b.id, { pick: arg.characterId }); if (b.kind === 'bank' && b.settings.bank === 'products') st.patchBlock(b.id, { pick: arg.productId }) }`, seeded)
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(600)
await shot(page, 'w1-14-before-advice')
const fix = page.getByRole('button', { name: /Scene Prompts/ })
console.log('advice visible', await fix.isVisible().catch(() => false))
if (await fix.isVisible().catch(() => false)) { await fix.click(); await page.waitForTimeout(600) }
await shot(page, 'w1-15-after-advice')
const g = await store(page, `return { blocks: doc.blocks.map((b) => [b.id, b.kind, b.settings.mode, b.settings.bank]), wires: doc.wires.map((w) => [w.from, w.fromPort, w.to, w.toPort]) }`)
console.log(JSON.stringify(g))
// Test With 1
await page.getByRole('button', { name: /Test With 1/ }).click()
await page.waitForTimeout(800)
await shot(page, 'w1-16-test-started')
let final = await waitForRun(page, { log: (...a) => console.log(...a), onReview: async (d) => keepAll(d) })
console.log('test final', JSON.stringify(final))
await shot(page, 'w1-17-test-done')
// Open the Scene Clips window
await scenesNode.dblclick({ position: { x: 60, y: 20 } })
await page.waitForTimeout(1200)
await shot(page, 'w1-18-scenes-window-after-test')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
// Full run
await page.getByRole('button', { name: /Run Flow|Re-run/ }).first().click()
await page.waitForTimeout(800)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) { await shot(page, 'w1-19-confirm'); await confirm.click() }
final = await waitForRun(page, { log: (...a) => console.log(...a), onReview: async (d) => { await shot(page, 'w1-20-review'); await keepAll(d) } })
console.log('full final', JSON.stringify(final))
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(700)
await shot(page, 'w1-21-full-done')
await scenesNode.dblclick({ position: { x: 60, y: 20 } })
await page.waitForTimeout(1500)
await shot(page, 'w1-22-scenes-window-full')
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
