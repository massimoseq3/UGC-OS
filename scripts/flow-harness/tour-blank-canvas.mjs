// Explore: blank canvas as a new user, right-click, Tab picker, then a W1
// talking-head flow built with Scene Clips, test run, full run.
import { boot } from './boot.mjs'
import fs from 'node:fs'
// Screenshots go to ./shots (or $OUT).
const OUT = process.env.OUT ?? new URL('./shots', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const { browser, page, consoleErrors, pageErrors, seeded } = await boot({ stub: { pollsBeforeSuccess: 1 } })
console.log('seeded', seeded)
await page.waitForTimeout(1500)
// Start from scratch
await page.getByText('Start From Scratch').click()
await page.waitForTimeout(1200)
await shot(page, 'e01-blank-canvas')
// Right-click on the empty canvas
await page.mouse.click(800, 450, { button: 'right' })
await page.waitForTimeout(400)
await shot(page, 'e02-pane-context-menu')
await page.keyboard.press('Escape')
await page.mouse.click(1400, 800)
// Tab picker
await page.mouse.move(600, 400)
await page.keyboard.press('Tab')
await page.waitForTimeout(400)
await shot(page, 'e03-add-block-picker')
await page.keyboard.type('scene')
await page.waitForTimeout(300)
await shot(page, 'e04-add-block-search')
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
await shot(page, 'e05-scene-clips-added')
// Right-click on the new block
const node = page.locator('.react-flow__node').first()
const box = await node.boundingBox()
await page.mouse.click(box.x + 40, box.y + 20, { button: 'right' })
await page.waitForTimeout(400)
await shot(page, 'e06-block-context-menu')
await page.getByText('Rename', { exact: true }).click()
await page.waitForTimeout(200)
await page.keyboard.type('Talking Head')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await shot(page, 'e07-renamed')
console.log('console errors', consoleErrors.length, consoleErrors.slice(0, 5))
console.log('page errors', pageErrors.slice(0, 5))
await browser.close()
