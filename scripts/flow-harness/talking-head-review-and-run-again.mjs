// W1 done right: Scene Prompts → Scripts (reverse-engineer) → Scene Clips,
// with Scripts paused for review (edit one take), Test With 1, full run,
// then the Scene Clips window, Edit Pack, Run View and Run Again.
import { boot } from './boot.mjs'
import { runState, waitForRun, setView, keepAll } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, seeded } = await boot({ stub: { pollsBeforeSuccess: 1 } })
await page.waitForTimeout(1000)
const flowId = await page.evaluate(async (seeded) => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const graph = {
    blocks: [
      { id: 'ad', kind: 'bank', label: 'The Winning Ad', x: 0, y: 0, settings: { bank: 'swipes' }, source: 'bank', field: true, pick: seeded.swipeId },
      { id: 'product', kind: 'bank', label: 'Your Product', x: 0, y: 220, settings: { bank: 'products' }, source: 'bank', field: true, pick: seeded.productId },
      { id: 'character', kind: 'bank', label: 'Your Character', x: 0, y: 440, settings: { bank: 'models' }, source: 'bank', field: true, pick: seeded.characterId },
      { id: 'analyzer', kind: 'analyzer', x: 340, y: 0, settings: {}, source: 'generate' },
      { id: 'remix', kind: 'scripts', x: 700, y: 0, settings: { mode: 'remix', writeFormat: 'script', writeStyle: 'pas', writeLength: 30, remixLength: 'default', hookCategory: 'auto', hookCount: 10, variationCount: 3, brief: '', source: '', additionalContext: 'No captions or text on screen. One location: her parked car.' }, source: 'generate', review: true },
      { id: 'scenes', kind: 'scenes', x: 1080, y: 120, settings: { shape: 'scenes', takes: 2, aspectRatio: '9:16', audio: true, voice: true, style: true, productWhenShown: true, continuity: true, rules: 'No captions, subtitles or text on screen.' }, source: 'generate' },
      { id: 'edit', kind: 'edit', x: 1460, y: 160, settings: {}, source: 'generate' },
    ],
    wires: [
      { id: 'w1', from: 'ad', fromPort: 'out', to: 'analyzer', toPort: 'ad' },
      { id: 'w2', from: 'analyzer', fromPort: 'scenes', to: 'remix', toPort: 'source' },
      { id: 'w3', from: 'product', fromPort: 'out', to: 'remix', toPort: 'product' },
      { id: 'w4', from: 'remix', fromPort: 'all', to: 'scenes', toPort: 'script' },
      { id: 'w5', from: 'character', fromPort: 'out', to: 'scenes', toPort: 'character' },
      { id: 'w6', from: 'product', fromPort: 'out', to: 'scenes', toPort: 'product' },
      { id: 'w7', from: 'scenes', fromPort: 'clips', to: 'edit', toPort: 'clips' },
      { id: 'w8', from: 'remix', fromPort: 'all', to: 'edit', toPort: 'script' },
    ],
  }
  const st = useFlowStore.getState()
  const id = st.createFlow({ name: 'Talking Head · Clone a Winner', graph })
  st.openFlow(id)
  st.setView('edit')
  return id
}, seeded)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(500)
await shot(page, 'w1b-01-canvas')
// Test With 1, editing the kept take at the review
await page.getByRole('button', { name: /Test With 1/ }).click()
let edited = false
let final = await waitForRun(page, { log: (...a) => console.log(...a), onReview: async (d) => {
  if (!edited) {
    edited = true
    await page.waitForTimeout(600)
    await shot(page, 'w1b-02-review')
    const row = d.locator('span.cursor-text').first()
    await row.click()
    await page.waitForTimeout(200)
    const ta = d.locator('textarea').first()
    const text = await ta.inputValue()
    await ta.fill(text.replace(/--- Scene 1:[^\n]*\n[^\n]*/, (m) => m + ' She laughs.'))
    await page.waitForTimeout(200)
    await d.locator('h3').first().click()
    await shot(page, 'w1b-03-review-edited')
  }
  await d.getByRole('button', { name: /^Keep \d+/ }).click()
} })
console.log('test final', JSON.stringify(final))
await page.getByRole('button', { name: 'Fit', exact: true }).click()
await page.waitForTimeout(700)
await shot(page, 'w1b-04-test-done')
// Full run
await page.getByRole('button', { name: /Run Flow|Re-run/ }).first().click()
await page.waitForTimeout(800)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) { await shot(page, 'w1b-05-confirm'); await confirm.click() }
final = await waitForRun(page, { log: (...a) => console.log(...a), onReview: async (d) => { await d.getByRole('button', { name: /^Keep \d+/ }).click() } })
console.log('full final', JSON.stringify(final))
await page.waitForTimeout(800)
await shot(page, 'w1b-06-full-done')
const scenesNode = page.locator('.react-flow__node[data-id="scenes"]')
await scenesNode.dblclick({ position: { x: 60, y: 20 } })
await page.waitForTimeout(1500)
await shot(page, 'w1b-07-scenes-window')
await page.keyboard.press('Escape')
await setView(page, 'run')
await page.waitForTimeout(1200)
await shot(page, 'w1b-08-run-view')
console.log('prices', JSON.stringify(await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const { knownGraph } = await window.__appImport('/src/apps/flow/store/blocks.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const g = knownGraph(doc)
  const main = planFlow(g, doc.outputs, PLAN_DEPS)
  const again = planFlow(g, doc.outputs, PLAN_DEPS, { fresh: true })
  const per = (p, f) => Object.fromEntries(Object.entries(p.blocks).map(([id, b]) => [id, Math.round(b[f])]))
  return { mainAll: per(main, 'creditsAll'), againRun: per(again, 'credits'), againScript: again.blocks.scenes.instances[0]?.inputs.script?.[0]?.payload?.text?.slice(0, 80) }
})))
const packs = await page.evaluate(async (flowId) => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const doc = useFlowStore.getState().docs[flowId]
  return Object.values(doc.outputs.edit?.instances ?? {}).map((i) => ({ title: i.pack?.title, clips: i.pack?.clips.length, script: i.pack?.script?.slice(0, 80) }))
}, flowId)
console.log('packs', JSON.stringify(packs))
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
