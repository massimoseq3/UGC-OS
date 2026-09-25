// The three new gallery templates, as a member meets them: Template Setup,
// Run straight from it, keep everything at reviews, Run View at the end.
import { boot } from './boot.mjs'
import { openTemplate, pickField, waitForRun, keepAll, setView, flowHome } from './drive.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, stub } = await boot({ timeScale: 0.25, stub: { quiet: true } })
await page.getByText('Start a Flow').first().waitFor()
await page.waitForTimeout(800)
await shot(page, 't00-home')
for (const [i, name] of ['Talking Head Ad, Scene by Scene', 'Street Interview, One Shot', 'Same Ad, Three Faces'].entries()) {
  await flowHome(page)
  await page.waitForTimeout(600)
  const setup = await openTemplate(page, name)
  await pickField(page, setup, 'The Winning Ad', 'the serum')
  await pickField(page, setup, 'Your Product', 'GlowSerum Vitamin C Serum')
  for (const f of ['Your Character', 'Character 1', 'Character 2', 'Character 3']) {
    if (await setup.getByText(f, { exact: true }).isVisible().catch(() => false)) await pickField(page, setup, f, 'Maya')
  }
  await page.waitForTimeout(400)
  await shot(page, `t${i}1-setup`)
  const run = setup.getByRole('button', { name: /^Run · / })
  console.log(name, 'run enabled', !(await run.isDisabled()), await run.innerText())
  await run.click()
  const final = await waitForRun(page, { log: () => {}, onReview: async (d, title) => { await shot(page, `t${i}2-review`); await keepAll(d) } })
  console.log(name, JSON.stringify(final.blocks), final.errors)
  await page.getByRole('button', { name: 'Fit', exact: true }).click().catch(() => {})
  await page.waitForTimeout(700)
  await shot(page, `t${i}3-canvas-done`)
  await setView(page, 'run')
  await page.waitForTimeout(1200)
  await shot(page, `t${i}4-runview`)
}
console.log('summary', JSON.stringify(stub.summary?.() ?? {}).slice(0, 400))
console.log('console errors', consoleErrors.slice(0, 8), 'page errors', pageErrors.slice(0, 5))
await browser.close()
