// What a Scene Clips run sends for each scene: the Playground request its
// clip is — the prompt, the references, the length fitted to the model — so
// the block's price, its window and its run all build the same request.
// The reading of the script is sceneShots.ts; this is where it meets the
// model and the banks.

import type { FlowBlock, FlowValue } from '../types'
import type { PlaygroundRunInput } from '../../playground/runner'
import type { PromptRef } from '../../playground/components/PromptPanel'
import { getDefaultModel, getModel, snapVideoDurationUp } from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useBankStore } from '../../../stores/bankStore'
import { shotPrompt, type SceneScript, type SceneShot } from './sceneShots'

// Until the block picks its own, Playground's video pick — the same
// fallback a Playground block makes.
export function scenesVideoModel(block: FlowBlock): string | undefined {
  return (block.settings.modelId as string | undefined)
    ?? useSettingsStore.getState().getAppModel('playground:video')
    ?? getDefaultModel('playground', 'video')?.id
}

function textOf(values: FlowValue[] | undefined): string {
  const p = values?.[0]?.payload as { text?: string } | undefined
  return typeof p?.text === 'string' ? p.text : ''
}

export function scriptTextOf(inputs: Record<string, FlowValue[]>): string {
  return textOf(inputs.script)
}

// The scene script wired into Match Voice & Look, when one is.
export function matchTextOf(inputs: Record<string, FlowValue[]>): string | undefined {
  const v = inputs.match?.[0]
  return v && !v.pending ? textOf(inputs.match) || undefined : undefined
}

function productPhoto(productId: string): string {
  return useBankStore.getState().products.find((p) => p.id === productId)?.productImage ?? ''
}

// The pictures a scene's clip is given: the character always, the product
// only where the scene shows it (unless the block says every scene), then
// anything else wired in, then scene 1's frame for the scenes after it.
export function sceneRefs(block: FlowBlock, inputs: Record<string, FlowValue[]>, shot: SceneShot, frame?: string): PromptRef[] {
  const refs: PromptRef[] = []
  const character = inputs.character?.find((v) => v.type === 'character')
  if (character?.type === 'character' && character.payload.imageRef) {
    refs.push({ url: character.payload.imageRef, label: character.label || 'Character', source: 'character', slot: 'ref', parent: character.lineage?.[0] })
  }
  const product = inputs.product?.find((v) => v.type === 'product')
  const everyScene = block.settings.productWhenShown === false
  if (product?.type === 'product' && (everyScene || shot.showsProduct)) {
    const url = product.pending ? 'pending' : productPhoto(product.payload.productId)
    if (url) refs.push({ url, label: product.label || 'Product', source: 'product', slot: 'ref', parent: product.lineage?.[0] })
  }
  for (const v of inputs.refs ?? []) {
    const url = v.type === 'image' ? v.payload.ref
      : v.type === 'character' ? v.payload.imageRef
      : v.type === 'style' ? v.payload.thumbRefs?.[0] ?? ''
      : v.type === 'product' ? productPhoto(v.payload.productId)
      : ''
    if (url) refs.push({ url, label: v.label, source: 'upload', slot: 'ref', parent: v.lineage?.[0] })
  }
  if (frame) refs.push({ url: frame, label: 'Scene 1', source: 'broll', slot: 'ref' })
  return refs
}

// One scene's clip, as the Playground request it is. The length is the
// scene's, rounded UP onto the model's ladder so its lines fit, and capped at
// the model's longest — sceneOverrun says when that cap cuts a scene short.
export function sceneClipInput(block: FlowBlock, script: SceneScript, shot: SceneShot, refs: PromptRef[]): PlaygroundRunInput {
  const s = block.settings
  const modelId = scenesVideoModel(block) ?? ''
  const video = getModel(modelId)?.videoConstraints
  const fit = (value: string, allowed: readonly string[] | undefined, fallback?: string) =>
    !allowed?.length || allowed.includes(value) ? value : fallback && allowed.includes(fallback) ? fallback : allowed[0]
  const want = Math.ceil(shot.seconds)
  return {
    mode: 'video',
    modelId,
    prompt: shotPrompt(script, shot, {
      style: s.style !== false,
      voice: s.voice !== false,
      rules: typeof s.rules === 'string' ? s.rules : '',
    }),
    refs,
    aspectRatio: fit(String(s.aspectRatio ?? '9:16'), video?.aspectRatios, '9:16'),
    resolution: fit(String(s.resolution ?? video?.default ?? '720p'), video?.resolutions, video?.default),
    durationSeconds: video?.durations?.length ? snapVideoDurationUp(want, video.durations) : want,
    audio: s.audio !== false && !!video?.supportsAudio,
    instrumental: false,
  }
}

// A scene longer than the model's longest clip, which will run short and
// rush its lines — said in the window before anything is spent.
export function sceneOverrun(block: FlowBlock, shot: SceneShot): number | null {
  const durations = getModel(scenesVideoModel(block) ?? '')?.videoConstraints?.durations
  const longest = durations?.length ? Math.max(...durations) : null
  return longest !== null && Math.ceil(shot.seconds) > longest ? longest : null
}
