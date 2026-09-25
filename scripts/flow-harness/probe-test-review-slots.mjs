// Repro: Test With 1 on a flow with a per-slot Characters block (count 4,
// Pause for Review). Keep everything the test made. What does the FULL run
// plan to make afterwards?
import { boot } from './boot.mjs'
import { waitForRun, keepAll } from './drive.mjs'
const { browser, page } = await boot({ logConsole: false, stub: { log: () => {} } })
await page.getByPlaceholder('Describe the flow you want').fill('Five hooks for my serum, a female voice, B-Roll for each')
await page.getByRole('button', { name: /Build Flow/ }).click()
await page.getByRole('button', { name: /Open in Editor/ }).click()
const ask = page.getByPlaceholder('Ask Flow to change something…')
await ask.click(); await ask.fill('Cast 4 new faces'); await ask.press('Enter')
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(async () => {
    const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
    const s = useFlowStore.getState()
    return !!s.docs[s.openId]?.blocks.some((b) => b.kind === 'characters')
  })
  if (has) break
  await page.waitForTimeout(500)
}
const facesPlan = () => page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const { knownGraph } = await window.__appImport('/src/apps/flow/store/blocks.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const b = doc.blocks.find((x) => x.kind === 'characters')
  const plan = planFlow(knownGraph(doc), doc.outputs, PLAN_DEPS)
  const bp = plan.blocks[b.id]
  return { itemsOff: b.items.map((i) => !!i.off), fullRunFacesToMake: bp.instances.reduce((n, i) => n + (i.run ? (i.slots?.length ?? 1) : 0), 0), fullRunCredits: Math.round(plan.credits) }
})
console.log('before Test With 1:', JSON.stringify(await facesPlan()))
await page.getByRole('button', { name: /Test With 1/ }).first().click()
// Answer each review only once it's the sole one pending (avoids the other bug).
await waitForRun(page, { log: () => {}, onReview: async (dialog) => keepAll(dialog) })
console.log('after  Test With 1 (kept everything):', JSON.stringify(await facesPlan()))
await browser.close()
