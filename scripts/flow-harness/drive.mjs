// Helpers for driving Flow in Playwright: locators the app's markup needs,
// Flow's run state read off its own store, and a run loop that answers
// Pause-for-Review modals. Shared by smoke.mjs and extras.mjs.
//
// Reaching app state from a test: inside page.evaluate, use
//   const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
// (installed by boot.mjs's init script) rather than a bare import(): after a
// Vite hot update the app holds the module as `…ts?t=…`, and a bare import
// would hand you a second, empty instance of the store.

import fs from 'node:fs'
import path from 'node:path'

/** Numbered screenshots into `dir`, with a log line each. */
export function makeShooter(dir, { log = console.log, clear = /^\d\d-.*\.png$/ } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (clear) for (const f of fs.readdirSync(dir)) if (clear.test(f)) fs.rmSync(path.join(dir, f))
  let n = 0
  const list = []
  const shot = async (page, name, what, opts = {}) => {
    n += 1
    const file = `${String(n).padStart(2, '0')}-${name}.png`
    await page.screenshot({ path: path.join(dir, file), ...opts })
    list.push({ file, what })
    log(`📸 ${file} — ${what}`)
    return file
  }
  shot.list = list
  return shot
}

/**
 * An OPEN modal. The app's Modal (components/Modal.tsx) has no role="dialog";
 * an open one is the panel div with `pointer-events-auto … opacity-100` (a
 * closed one stays mounted at opacity-0, which Playwright counts as visible).
 */
export function openModal(page, opts = {}) {
  let loc = page.locator('div.pointer-events-auto.opacity-100').filter({ has: page.locator('h3') })
  if (opts.title) loc = loc.filter({ has: page.locator('h3', { hasText: opts.title }) })
  if (opts.has) loc = loc.filter({ has: opts.has })
  return loc.last()
}

/** Make Flow the active app (no reload). */
export async function openFlowApp(page) {
  await page.evaluate(async () => {
    const { useAppStore } = await window.__appImport('/src/stores/appStore.ts')
    if (useAppStore.getState().activeApp !== 'flow') useAppStore.getState().openApp('flow')
  })
  await page.waitForTimeout(400)
}

/** Back to Flow Home (closes the open flow). */
export async function flowHome(page) {
  await openFlowApp(page)
  await page.evaluate(async () => (await window.__appImport('/src/apps/flow/store/flowStore.ts')).useFlowStore.getState().openFlow(null))
  await page.getByText('Start a Flow').first().waitFor({ timeout: 15_000 })
}

/**
 * Canvas ('edit') or Run View ('run') for the open flow. Through Flow's store:
 * the Edit/Run segmented control only exists on the canvas (Run View has
 * "Open Canvas"), and getByRole('button', { name: 'Edit' }) also matches the
 * DOCK's Edit app — clicking that leaves Flow.
 */
export async function setView(page, view) {
  await page.evaluate(async (v) => {
    const { useAppStore } = await window.__appImport('/src/stores/appStore.ts')
    if (useAppStore.getState().activeApp !== 'flow') useAppStore.getState().openApp('flow')
    ;(await window.__appImport('/src/apps/flow/store/flowStore.ts')).useFlowStore.getState().setView(v)
  }, view)
  await page.waitForTimeout(700)
}

/** The open flow's live run, summarised: status, per-block lines, errors. */
export async function runState(page) {
  return page.evaluate(async () => {
    const { useFlowStore } = await window.__appImport('/src/apps/flow/store/flowStore.ts')
    const { useFlowRunStore } = await window.__appImport('/src/apps/flow/run/runtime.ts')
    const flowId = useFlowStore.getState().openId
    const run = flowId ? useFlowRunStore.getState().runs[flowId] : undefined
    const doc = flowId ? useFlowStore.getState().docs[flowId] : undefined
    const label = (id) => doc?.blocks.find((b) => b.id === id)?.id ?? id
    return run ? {
      flowId,
      name: doc?.name,
      status: run.status,
      test: run.test,
      reviews: run.reviews,
      spent: Math.round(run.spent),
      estimate: Math.round(run.estimate),
      blocks: Object.fromEntries(Object.entries(run.blocks).map(([id, b]) => [label(id), `${b.status}${b.total ? ` ${b.finished}/${b.total}` : ''}${b.failed ? ` failed ${b.failed}` : ''}${b.reason ? ` (${b.reason})` : ''}`])),
      errors: Object.entries(run.instances).flatMap(([id, insts]) => Object.values(insts).filter((i) => i.error).map((i) => `${label(id)}: ${i.error}`)),
    } : { flowId, name: doc?.name, status: 'none' }
  })
}

/** Pick a row in a Template Setup field ("Your Product") through the BankPicker. */
export async function pickField(page, setup, fieldTitle, rowText) {
  await setup.getByText(fieldTitle, { exact: true }).click()
  // BankPicker (or Choose a Saved Ad for swipes) opens above the setup modal.
  await page.getByText(rowText, { exact: false }).last().click({ timeout: 15_000 })
  await page.waitForTimeout(400)
}

/** Flow Home → a gallery card's Use Template → its setup modal. */
export async function openTemplate(page, name) {
  const card = page.locator('div').filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Use Template' }) }).last()
  await card.getByRole('button', { name: 'Use Template' }).click()
  const setup = openModal(page, { title: name })
  await setup.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(400)
  return setup
}

/** The review modal that is open right now, if any. */
export function reviewModal(page) {
  return openModal(page, { has: page.getByRole('button', { name: 'Review Later' }) })
}

/** Press the review's go button (Keep N and Continue / Animate N · …). */
export async function keepAll(dialog) {
  await dialog.getByRole('button', { name: /^(Keep \d+ and Continue|Animate \d+|Keep \d+)/ }).click()
}

/**
 * Wait for the open flow's run to settle. Every review that opens is handed
 * to `onReview(dialog, title)` (default: keep everything). `onTick(state)`
 * runs once a second for mid-run screenshots. Returns the final state.
 */
export async function waitForRun(page, { timeoutMs = 6 * 60_000, onReview, onTick, log = console.log } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  let waitingTicks = 0
  while (Date.now() < deadline) {
    const st = await runState(page)
    const line = JSON.stringify(st.blocks)
    if (line !== last) {
      log(`run ${st.status}`, st.blocks)
      last = line
    }
    if (st.status !== 'running' && st.status !== 'none') return st
    const dialog = reviewModal(page)
    if (await dialog.isVisible().catch(() => false)) {
      const title = (await dialog.locator('h3').first().innerText().catch(() => '')) || 'Review'
      if (onReview) await onReview(dialog, title)
      else await keepAll(dialog)
      log(`review "${title}" answered`)
      await page.waitForTimeout(800)
      continue
    }
    // A review nobody is looking at: the modal was closed as "Review Later"
    // (an app switch does that too — useCloseOnAppSwitch), so it now waits on
    // its block. Reopen it from the block's own Review button on the canvas.
    if (st.reviews?.length) {
      waitingTicks += 1
      if (waitingTicks >= 2) {
        waitingTicks = 0
        await setView(page, 'edit')
        const btn = page.locator('.react-flow__node button', { hasText: /^Review$/ }).first()
        if (await btn.isVisible().catch(() => false)) {
          log('review was waiting on its block — reopening it from the canvas')
          await btn.click()
          await page.waitForTimeout(600)
          continue
        }
      }
    } else waitingTicks = 0
    if (onTick) await onTick(st)
    await page.waitForTimeout(1000)
  }
  throw new Error(`run did not finish within ${timeoutMs / 1000}s`)
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
