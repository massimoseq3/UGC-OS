// Price each gallery template the way Template Setup does: loaded, the
// fields picked from the seeded bank, planned.
import { boot } from './boot.mjs'
const { browser, page, seeded } = await boot({ route: '/flow' })
await page.waitForTimeout(800)
const out = await page.evaluate(async (seeded) => {
  const { loadGalleryTemplate } = await window.__appImport('/src/apps/flow/templates/gallery.ts')
  const { planFlow } = await window.__appImport('/src/apps/flow/engine/plan.ts')
  const { PLAN_DEPS } = await window.__appImport('/src/apps/flow/run/runtime.ts')
  const { withSlots } = await window.__appImport('/src/apps/flow/store/blocks.ts')
  const res = {}
  for (const slug of ['product-to-5-ugc-ads', '10-hook-machine', 'clone-a-winner', 'talking-head-clone', 'street-interview', 'same-ad-new-faces', 'many-hooks-one-body']) {
    const t = await loadGalleryTemplate(slug)
    const pickFor = (b) => b.kind !== 'bank' ? undefined : b.settings.bank === 'products' ? seeded.productId : b.settings.bank === 'models' ? seeded.characterId : b.settings.bank === 'swipes' ? seeded.swipeId : undefined
    const { shapeBlocks } = await window.__appImport('/src/apps/flow/store/blocks.ts'); const graph = { blocks: shapeBlocks({ blocks: t.file.blocks.map((b) => ({ ...b, pick: pickFor(b) ?? b.pick })), wires: t.file.wires }), wires: t.file.wires }
    const plan = planFlow(graph, {}, PLAN_DEPS)
    const test = planFlow(graph, {}, PLAN_DEPS, { test: true })
    res[slug] = { all: Math.round(plan.creditsAll), test: Math.round(test.credits), blocks: t.file.blocks.length, changes: t.changes, per: Object.fromEntries(Object.entries(plan.blocks).map(([id, bp]) => [id, Math.round(bp.creditsAll)])) }
  }
  return res
}, seeded)
console.log(JSON.stringify(out, null, 1))
await browser.close()
