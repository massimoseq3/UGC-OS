// Repro (Flow bug): two ItemsReview modals back to back (Scripts, then Characters) —
// does the second one inherit the first one's "keep" list?
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
await page.getByRole('button', { name: /Test With 1/ }).first().click()
const labels = []
let first = true
await waitForRun(page, { log: () => {}, onReview: async (dialog, title) => {
  // Sit on the first review long enough for the Characters block to finish
  // and queue its own review behind it.
  if (first) { first = false; await page.waitForTimeout(6000) }
  labels.push(`${title}: ${await dialog.getByRole('button', { name: /^(Keep|Animate)/ }).innerText()} (${await dialog.locator('button.rounded-2xl, button.rounded-xl').count()} tiles)`)
  await keepAll(dialog)
} })
const faces = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  const b = doc.blocks.find((x) => x.kind === 'characters')
  return b.items
})
console.log('reviews seen:', labels)
console.log('characters block items after "keeping all":', JSON.stringify(faces))
await browser.close()
