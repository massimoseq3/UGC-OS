// Scene Clips: reload mid-run (after scene 1, while the rest film) and check
// the run resumes from its saved handles and its kept clips — no scene paid
// for twice — and that continuity's frame survives the reload.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll, openFlowApp, runState } from './drive.mjs'
const { browser, page, stub, pageErrors } = await boot({ logConsole: false, stub: { log: () => {}, pollsBeforeSuccess: 2 } })
await page.getByText('Start a Flow').first().waitFor()
const setup = await openTemplate(page, 'Talking Head Ad, Scene by Scene')
await pickField(page, setup, 'The Winning Ad', 'the serum')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
// Two takes of each scene, so there's something in flight to resume.
await setup.getByRole('button', { name: /Open Canvas/ }).click()
await page.waitForTimeout(800)
await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  useFlowStore.getState().patchSettings('scenes', { takes: 2 })
})
await page.getByRole('button', { name: /Run Flow/ }).first().click()
await page.waitForTimeout(500)
const confirm = page.getByRole('button', { name: /^Run · / })
if (await confirm.isVisible().catch(() => false)) await confirm.click()
let reloaded = false
let before
try {
  await waitForRun(page, {
    log: () => {},
    onReview: async (d) => keepAll(d),
    onTick: async (st) => {
      const note = await page.evaluate(async () => {
        const { useFlowRunStore } = await window.__appImport('/src/apps/flow/run/runtime.ts')
        const run = Object.values(useFlowRunStore.getState().runs)[0]
        return Object.values(run?.instances?.scenes ?? {}).map((i) => i.note).join(',')
      })
      if (!reloaded && /Scenes · [1-9]/.test(note)) {
        reloaded = true
        before = JSON.stringify(stub.stats.createTask)
        console.log('reloading during scenes:', st.blocks, note, before)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
        await openFlowApp(page)
        await page.evaluate(async () => {
          const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
          const { useFlowRunStore } = await window.__appImport('/src/apps/flow/run/runtime.ts')
          const id = Object.keys(useFlowRunStore.getState().runs)[0]
          useFlowStore.getState().openFlow(id)
        })
      }
    },
  })
} catch (e) { console.log('wait failed', String(e)) }
const st = await runState(page)
console.log('final:', st.status, st.blocks, st.errors)
const clips = await page.evaluate(async () => {
  const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
  const s = useFlowStore.getState(); const doc = s.docs[s.openId]
  return Object.values(doc.outputs.scenes?.instances ?? {}).map((i) => i.outputs.clips?.[0]?.payload.clips.map((c) => `${c.scene}:${c.take}`).join(' '))
})
console.log('clips:', clips)
console.log('createTask before reload:', before)
console.log('createTask after run:    ', JSON.stringify(stub.stats.createTask))
console.log('unhandled:', stub.unhandled, 'pageErrors:', pageErrors)
await browser.close()
