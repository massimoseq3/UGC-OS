// Reload mid-run (B-Roll clips phase) and check the run resumes from its
// saved task handles instead of paying twice.
import { boot, BASE_URL } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll, openFlowApp, runState } from './drive.mjs'
const { browser, page, stub, pageErrors } = await boot({ logConsole: false, stub: { log: () => {} } })
await page.getByText('Start a Flow').first().waitFor()
const setup = await openTemplate(page, 'Product → 5 UGC Ads')
await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
await pickField(page, setup, 'Your Character', 'Maya')
await setup.getByRole('button', { name: /^Run · / }).click()
let reloaded = false
let before
try {
  await waitForRun(page, {
    log: () => {},
    onReview: async (d) => keepAll(d),
    onTick: async (st) => {
      if (!reloaded && /running/.test(st.blocks.broll ?? '') && st.blocks.broll && (await page.getByText(/Clips · [1-9]\d* of/).count()) > 0) {
        reloaded = true
        before = JSON.stringify(stub.stats.createTask)
        console.log('reloading during clips:', st.blocks, before)
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
console.log('createTask before reload:', before)
console.log('createTask after run:    ', JSON.stringify(stub.stats.createTask))
console.log('unhandled:', stub.unhandled, 'pageErrors:', pageErrors)
await browser.close()
