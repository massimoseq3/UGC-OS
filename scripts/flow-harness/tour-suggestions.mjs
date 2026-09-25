// W1 talking head, built from the empty canvas's quick starts and the
// suggested next steps, then Scene Clips; test run, full run, screenshots.
import { boot } from './boot.mjs'
import { runState, waitForRun, setView } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, seeded } = await boot({ stub: { pollsBeforeSuccess: 1 } })
await page.waitForTimeout(1200)
await page.getByText('Start From Scratch').click()
await page.waitForTimeout(1000)
await shot(page, 'w1-01-empty')
await page.getByRole('button', { name: /A Winning Ad/ }).click()
await page.waitForTimeout(800)
await shot(page, 'w1-02-winning-ad-added')
// Pick the saved ad on the block through the store (the Bank picker is the app's own).
await page.evaluate(async (swipeId) => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const st = useFlowStore.getState()
  const doc = st.docs[st.openId]
  const b = doc.blocks.find((x) => x.kind === 'bank')
  st.patchBlock(b.id, { pick: swipeId })
}, seeded.swipeId)
await page.waitForTimeout(600)
await shot(page, 'w1-03-suggestion')
// Accept suggestions: Ad Analyzer, then Scripts
for (let i = 0; i < 2; i++) {
  const ghost = page.locator('.flow-ghost').first()
  if (await ghost.isVisible().catch(() => false)) { await ghost.click(); await page.waitForTimeout(800) }
}
await shot(page, 'w1-04-after-suggestions')
const graph = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const st = useFlowStore.getState()
  const doc = st.docs[st.openId]
  return { blocks: doc.blocks.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y })), wires: doc.wires }
})
console.log(JSON.stringify(graph))
console.log(JSON.stringify(await runState(page)))
console.log('console errors', consoleErrors.slice(0, 5), 'page errors', pageErrors.slice(0, 5))
await browser.close()
